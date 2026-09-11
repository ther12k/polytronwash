// ═══════════════════════════════════════════════════════════════════════
// Polytron Washing Machine — appliance web UI
// Served by the ESP32 itself (web_server js_include). No frameworks, no
// build step, no CDN, no internet. REST for commands, /events SSE for
// live state. The firmware stays the authority on every safety rule;
// this file only renders and requests.
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────
// Configuration / entity names
// ─────────────────────────────
// These are the ESPHome entity NAMES (yaml `name:`), the REST API contract.
// Changing a name in polytron-v3.yaml is a one-line change here.

const ENTITIES = Object.freeze({
  button: {
    wash: "Start Wash",
    spin: "Start Spin",
    drain: "Start Drain",
    fill: "Start Fill",
    rinse: "Start Rinse",
    rinseND: "Start Rinse No Drain",
    stop: "STOP ALL",
    quick: "Run Quick",
    normal: "Run Normal",
    custom: "Run Custom",
  },
  switch: {
    drain: "Drain-Clutch",
    motorA: "Motor A",
    motorB: "Motor B",
    inlet: "Water Inlet",
  },
  number: {
    wash: { name: "Wash Minutes", min: 1, max: 60, step: 1, dec: 0, unit: "min" },
    spin: { name: "Spin Minutes", min: 1, max: 30, step: 1, dec: 0, unit: "min" },
    drainN: { name: "Drain Minutes", min: 1, max: 15, step: 1, dec: 0, unit: "min" },
    fill: { name: "Fill Minutes", min: 1, max: 10, step: 1, dec: 0, unit: "min" },
    rinseM: { name: "Rinse Minutes", min: 1, max: 15, step: 1, dec: 0, unit: "min" },
    spinDrain: { name: "Spin Drain Seconds", min: 5, max: 300, step: 5, dec: 0, unit: "s" },
    rinseDrain: { name: "Rinse Drain Seconds", min: 15, max: 180, step: 5, dec: 0, unit: "s" },
    pulse: { name: "Wash Pulse Seconds", min: 0.5, max: 10, step: 0.5, dec: 1, unit: "s" },
    dead: { name: "Wash Dead Time Seconds", min: 0.5, max: 5, step: 0.25, dec: 2, unit: "s" },
    coast: { name: "Stop Coast Seconds", min: 0, max: 60, step: 5, dec: 0, unit: "s" },
  },
  select: {
    washPreset: { name: "Wash Preset", options: ["5", "10", "20", "30"] },
    spinPreset: { name: "Spin Preset", options: ["10", "20", "30"] },
    spinMotor: { name: "Spin Motor", options: ["A", "B"] },
  },
  text: {
    quick: "Program Quick",
    normal: "Program Normal",
    custom: "Program Custom",
  },
  sensor: {
    state: "text_sensor/Cycle State",
    program: "text_sensor/Current Program",
    running: "binary_sensor/Cycle Running",
    stepProg: "sensor/Cycle Progress",
    progProg: "sensor/Program Progress",
    progElapsed: "sensor/Program Elapsed",
    progRemaining: "sensor/Program Remaining",
    heap: "sensor/Free Heap",
    rssi: "sensor/WiFi Signal",
  },
});

const MODE_COLORS = {
  WASH: "#4a9eff", DRAIN: "#14b8a6", SPIN: "#a78bfa", FILL: "#22d3ee",
  IDLE: "#8b93a5", STOPPED: "#f59e0b",
};

// ─────────────────────────────
// API — the only place REST URLs are built
// ─────────────────────────────

const enc = encodeURIComponent;

const api = {
  pressButton(name) { return fetch(`/button/${enc(name)}/press`, { method: "POST" }); },
  setSwitch(name, on) {
    return fetch(`/switch/${enc(name)}/${on ? "turn_on" : "turn_off"}`, { method: "POST" });
  },
  setNumber(name, value) {
    return fetch(`/number/${enc(name)}/set?value=${value}`, { method: "POST" });
  },
  setSelect(name, option) {
    return fetch(`/select/${enc(name)}/set?option=${enc(option)}`, { method: "POST" });
  },
  setText(name, value) {
    return fetch(`/text/${enc(name)}/set?value=${enc(value)}`, { method: "POST" });
  },
};

// ─────────────────────────────
// SSE / device store
// ─────────────────────────────
// State map keyed by SSE entity id ("domain/Name"). Reconnection only
// re-synchronizes state — commands are never queued or replayed.

const store = {
  states: {},        // id -> { state, value }
  conn: "connecting", // connecting | online | reconnecting | offline
  logs: [],
  _es: null,
  _offlineTimer: null,
  _dirty: false,
};

function handleStateEvent(json) {
  let d;
  try { d = JSON.parse(json); } catch { return; }
  if (!d || !d.id) return;
  store.states[d.id] = { state: d.state, value: d.value };
  renderSoon();
}

function handleLogEvent(line) {
  // Device sends ANSI-colored log lines; strip escapes for clean display.
  store.logs.push(String(line).replace(/\x1b\[[0-9;]*m/g, ""));
  if (store.logs.length > 200) store.logs.shift();
  renderSoon();
}

function connectEvents() {
  const es = new EventSource("/events");
  store._es = es;

  const armOffline = () => {
    store.conn = "reconnecting";
    clearTimeout(store._offlineTimer);
    store._offlineTimer = setTimeout(() => { store.conn = "offline"; store._dirty = true; renderSoon(); }, 8000);
    store._dirty = true;
  };

  es.addEventListener("open", () => {
    clearTimeout(store._offlineTimer);
    store.conn = "online";
    store._dirty = true;
    renderSoon();
  });
  es.addEventListener("error", armOffline);
  // Initial dump (with names) and live updates both carry {id, state, value}.
  es.addEventListener("state", (e) => handleStateEvent(e.data));
  es.addEventListener("state_detail_all", (e) => handleStateEvent(e.data));
  es.addEventListener("log", (e) => handleLogEvent(e.data));
}

const st = (id) => {
  const s = store.states[ENTITIES.sensor[id]];
  return s ? s.state : undefined;
};
const num = (id) => parseFloat(st(id));

// ─────────────────────────────
// Program parser
// ─────────────────────────────

const OPS = { WASH: { icon: "💧", label: "Wash" }, DRAIN: { icon: "⬇", label: "Drain" },
              SPIN: { icon: "🌀", label: "Spin" }, FILL: { icon: "🚿", label: "Fill" },
              WAIT: { icon: "⏸", label: "Wait" } };

function parseProgram(str) {
  return (str || "").split(",").map((x) => x.trim()).filter(Boolean).map((tok) => {
    const i = tok.indexOf(":");
    const op = (i > 0 ? tok.slice(0, i) : tok).toUpperCase();
    const sec = i > 0 ? parseInt(tok.slice(i + 1), 10) : 0;
    return { op, sec };
  });
}

function validateProgram(steps) {
  if (!steps.length) return "empty";
  for (const s of steps) {
    if (!OPS[s.op]) return `unknown step "${s.op}"`;
    if (!Number.isInteger(s.sec) || s.sec < 1 || s.sec > 3600) return `${s.op} needs 1–3600 s`;
  }
  return null; // valid
}

function programTotal(steps) {
  // Nominal program time; each SPIN adds the live Spin Drain Seconds
  // (num_spin_drain_s) + 10 s coast (spin_coast_s in polytron-v3.yaml).
  const drain = parseFloat((store.states[`number/${ENTITIES.number.spinDrain.name}`] || {}).state) || 0;
  return steps.reduce((t, s) => t + s.sec + (s.op === "SPIN" ? drain + 10 : 0), 0);
}

const fmtSec = (s) => {
  const v = parseFloat(s) || 0;
  const m = Math.floor(v / 60), r = Math.round(v % 60);
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
};

// ─────────────────────────────
// Rendering
// ─────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

function card(title, sub, bodyHtml, extra = "") {
  return `<section class="card ${extra}">
    ${(title || sub) ? `<div class="card-h"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ""}</div>` : ""}
    ${bodyHtml}</section>`;
}

function derived() {
  const running = st("running") === "ON";
  const step = st("state") || "—";
  const program = st("program") || "—";
  return {
    running, step, program,
    modeColor: MODE_COLORS[step] || "#8b93a5",
    progPct: Math.max(0, Math.min(100, num("progProg") || 0)),
    stepPct: Math.max(0, Math.min(100, num("stepProg") || 0)),
    elapsed: fmtSec(st("progElapsed")),
    remaining: fmtSec(st("progRemaining")),
    heap: st("heap"),
    rssi: ["unknown", "nan", ""].includes((st("rssi") || "").toLowerCase())
      ? undefined : st("rssi"),
  };
}

// ─────────────────────────────
// Rendering — build once, patch in place
// ─────────────────────────────
// The DOM is created a single time; state events only patch values.
// That keeps <details> open, file inputs, focus and scroll intact.

function renderApp() {
  const D = derived();
  const lock = D.running ? "disabled" : "";

  let html = `
  <header class="hdr">
    <div class="avatar">🧺</div>
    <div class="hdr-t"><h1>Polytron Washing Machine</h1>
      <div class="tag">direct-drive conversion</div></div>
    <span class="pill">…</span>
  </header>`;

  html += card("Cycle Status", "", `
    <div class="cyc">
      <div class="cyc-row">
        <div class="kv"><span class="k">Program</span><span class="v v-program">${esc(D.program)}</span></div>
        <div class="kv"><span class="k">Step</span>
          <span class="v step-chip v-step">${esc(D.step)}</span></div>
      </div>
      <div class="bar"><div class="bar-fill"></div></div>
      <div class="bar-lab"><span class="lab-prog">—</span><span class="lab-step">ready</span></div>
      <div class="cyc-row">
        <div class="kv"><span class="k">Elapsed</span><span class="v v-elapsed">—</span></div>
        <div class="kv"><span class="k">Remaining</span><span class="v v-remaining">—</span></div>
        <div class="kv"><span class="k">Free heap</span><span class="v v-heap">${esc(D.heap ?? "—")}</span></div>
        <div class="kv"><span class="k">WiFi</span><span class="v v-rssi">${esc(D.rssi ?? "—")}</span></div>
      </div>
    </div>`, "c-status");

  const qa = (label, key, cls) =>
    `<button class="qa ${cls || ""}" data-btn="${key}">${label}</button>`;
  html += card("Quick Actions", "", `
    <div class="qa-grid">
      ${qa("Start Wash", "wash")}${qa("Start Spin", "spin")}
      ${qa("Start Drain", "drain")}${qa("Start Fill", "fill")}
      ${qa("Rinse", "rinse")}
      ${qa("Rinse No Drain", "rinseND")}
      ${qa("STOP ALL", "stop", "stop")}
      ${qa("Run Quick", "quick")}${qa("Run Normal", "normal")}${qa("Run Custom", "custom")}
    </div>`, "c-actions");

  const progRow = (key, label) => {
    const name = ENTITIES.text[key];
    const cur = (store.states[`text/${name}`] || {}).state || "";
    const steps = parseProgram(cur);
    const err = validateProgram(steps);
    const total = programTotal(steps);
    return `<div class="prog">
      <label class="prog-l">${label}</label>
      <input class="prog-in" data-prog="${key}" value="${esc(cur)}"
        placeholder="WASH:600, DRAIN:30, SPIN:300" spellcheck="false" ${lock}>
      <div class="prog-meta ${err ? "err" : ""}">${err ? "✕ " + err : steps.length + " step" + (steps.length === 1 ? "" : "s") + " · " + fmtSec(total)}</div>
      <div class="prog-btns">
        <button class="btn sm" data-prog-save="${key}" ${lock}>Save</button>
        <button class="btn sm primary" data-prog-run="${key}" ${lock}>Run</button>
      </div>
    </div>`;
  };
  html += card("Program Sequences", "seconds per step",
    progRow("quick", "Quick") + progRow("normal", "Normal") + progRow("custom", "Custom"), "c-programs");

  const stepper = (cfg, label, extra = "") => {
    const v = parseFloat((store.states[`number/${cfg.name}`] || {}).state);
    const shown = isNaN(v) ? "—" : v.toFixed(cfg.dec);
    return `<div class="row">
      <span class="row-l">${label}${extra ? ` <span class="mut">${extra}</span>` : ""}</span>
      <div class="stepper" data-num="${esc(cfg.name)}">
        <button class="pm" data-dir="-1">−</button>
        <span class="val">${shown}<small>${cfg.unit}</small></span>
        <button class="pm" data-dir="1">+</button>
      </div></div>`;
  };
  const chips = (cfg, label) => {
    const cur = (store.states[`select/${cfg.name}`] || {}).state;
    return `<div class="row"><span class="row-l">${label}</span>
      <div class="chips" data-sel="${esc(cfg.name)}">
        ${cfg.options.map((o) => `<button class="chip ${cur === o ? "on" : ""}" data-opt="${o}">${o}</button>`).join("")}
      </div></div>`;
  };
  const N = ENTITIES.number;
  html += card("Timing & Presets", "",
    stepper(N.wash, "Wash") +
    stepper(N.spin, "Spin") +
    stepper(N.drainN, "Drain") +
    stepper(N.fill, "Fill") +
    stepper(N.rinseM, "Rinse", "agitate in clean water") +
    chips(ENTITIES.select.washPreset, "Wash preset") +
    chips(ENTITIES.select.spinPreset, "Spin preset") +
    chips(ENTITIES.select.spinMotor, "Spin motor") +
    stepper(N.pulse, "Wash pulse", "A/B run") +
    stepper(N.dead, "Wash dead time", "gap") +
    stepper(N.coast, "Stop coast", "brake delay") +
    stepper(N.spinDrain, "Spin drain", "before motor") +
    stepper(N.rinseDrain, "Rinse drain", "pre-drain + final drain"), "c-timing");

  const relay = (key, name) => {
    const on = (store.states[`switch/${name}`] || {}).state === "ON";
    return `<div class="row"><span class="row-l">${name}</span>
      <button class="toggle ${on ? "on" : ""}" data-relay="${key}"><span class="knob"></span></button></div>`;
  };
  html += `<details class="card adv c-relays">
    <summary><h2>Manual Relays</h2><span class="sub">advanced — bypasses cycles, interlocks still enforced</span></summary>
    <div class="warn">Direct relay control. Firmware interlocks (A/B mutual exclusion, fill/drain, coast-before-brake) remain active.</div>
    ${relay("drain", ENTITIES.switch.drain)}
    ${relay("motorA", ENTITIES.switch.motorA)}
    ${relay("motorB", ENTITIES.switch.motorB)}
    ${relay("inlet", ENTITIES.switch.inlet)}
  </details>`;

  html += `<section class="card c-ota">
    <div class="card-h"><h2>OTA Update</h2><span class="sub">firmware .bin</span></div>
    <div class="ota">
      <input type="file" id="ota-file" accept=".bin">
      <button class="btn" id="ota-go">Upload</button>
    </div>
    <div class="ota-status" id="ota-status"></div>
  </section>`;

  html += `<details class="card adv c-log">
    <summary><h2>Debug Log</h2><span class="sub">live device log</span></summary>
    <div class="log-bar"><label><input type="checkbox" id="log-follow" checked> follow</label>
      <button class="btn sm" id="log-clear">Clear</button></div>
    <pre class="log" id="log"></pre>
  </details>`;

  return html;
}

function stopbarHtml(D) {
  return `<div class="stopbar">
    <span class="stopbar-i"><b style="color:${D.modeColor}">${esc(D.step)}</b> · ${esc(D.program)} · ${Math.round(D.progPct)}%</span>
    <button class="btn stop" data-btn="stop">STOP ALL</button>
  </div>`;
}

function patchConn(root) {
  const pill = root.querySelector(".hdr .pill");
  if (!pill) return;
  const m = {
    connecting: ["…", "Connecting"], online: ["●", "Online"],
    reconnecting: ["●", "Reconnecting…"], offline: ["✕", "Offline"],
  }[store.conn];
  pill.textContent = `${m[0]} ${m[1]}`;
  pill.className = `pill conn-${store.conn}`;
}

function patchStatus(root, D) {
  const q = (s) => root.querySelector(s);
  const sub = q(".c-status .sub");
  if (sub) sub.textContent = D.running ? "running" : "idle";
  q(".v-program").textContent = D.program;
  const stepEl = q(".v-step");
  stepEl.textContent = D.step;
  stepEl.style.setProperty("--sc", D.modeColor);
  const bar = q(".bar-fill");
  bar.style.width = D.progPct + "%";
  bar.style.background = D.running ? D.modeColor : "#3a4356";
  q(".lab-prog").textContent = D.running ? Math.round(D.progPct) + "%" : "—";
  q(".lab-step").textContent = D.running ? "step " + Math.round(D.stepPct) + "%" : "ready";
  q(".v-elapsed").textContent = D.running ? D.elapsed : "—";
  q(".v-remaining").textContent = D.running ? D.remaining : "—";
  // device state strings carry their unit ("231 KB", "-84 dBm")
  q(".v-heap").textContent = D.heap ?? "—";
  q(".v-rssi").textContent = D.rssi ?? "—";
}

function patchLocks(root, D) {
  root.querySelectorAll(".qa[data-btn]").forEach((b) => {
    const lock = D.running && b.dataset.btn !== "stop";
    b.classList.toggle("locked", lock);
    b.disabled = lock;
  });
  root.querySelectorAll(".c-programs .prog-in, .c-programs .btn").forEach((b) => { b.disabled = D.running; });
  root.querySelectorAll(".pm, .chip").forEach((b) => { b.disabled = D.running; });
  root.querySelectorAll("[data-relay]").forEach((b) => { b.disabled = D.running; });

  // sticky stop bar appears only while running
  let bar = root.querySelector(".stopbar");
  if (D.running && !bar) {
    bar = el(stopbarHtml(D));
    root.querySelector(".app").appendChild(bar);
    bar.querySelector("[data-btn='stop']").addEventListener("click", () =>
      api.pressButton(ENTITIES.button.stop));
  } else if (!D.running && bar) {
    bar.remove();
  } else if (D.running && bar) {
    const i = bar.querySelector(".stopbar-i");
    i.innerHTML = `<b style="color:${D.modeColor}">${esc(D.step)}</b> · ${esc(D.program)} · ${Math.round(D.progPct)}%`;
  }
}

function patchValues(root) {
  root.querySelectorAll(".stepper").forEach((s) => {
    const cfg = Object.values(ENTITIES.number).find((n) => n.name === s.dataset.num);
    const v = parseFloat((store.states[`number/${cfg.name}`] || {}).state);
    s.querySelector(".val").innerHTML = (isNaN(v) ? "—" : v.toFixed(cfg.dec)) + `<small>${cfg.unit}</small>`;
  });
  root.querySelectorAll(".chips").forEach((g) => {
    const cur = (store.states[`select/${g.dataset.sel}`] || {}).state;
    g.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", cur === c.dataset.opt));
  });
  root.querySelectorAll("[data-relay]").forEach((b) => {
    const name = ENTITIES.switch[b.dataset.relay];
    b.classList.toggle("on", (store.states[`switch/${name}`] || {}).state === "ON");
  });
  root.querySelectorAll("[data-prog]").forEach((input) => {
    if (root.activeElement === input) return;
    const cur = (store.states[`text/${ENTITIES.text[input.dataset.prog]}`] || {}).state || "";
    if (input.value !== cur) {
      input.value = cur;
      const steps = parseProgram(cur);
      const err = validateProgram(steps);
      const meta = input.parentElement.querySelector(".prog-meta");
      meta.textContent = err ? "✕ " + err : steps.length + " step" + (steps.length === 1 ? "" : "s") + " · " + fmtSec(programTotal(steps));
      meta.classList.toggle("err", !!err);
    }
  });
}

const LOG_HINT = "Log is quiet while the machine is idle — actions, warnings and errors appear here live.";

function patchLog(root) {
  const log = root.getElementById("log");
  if (!log) return;
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
  log.textContent = store.logs.length ? store.logs.join("\n") : LOG_HINT;
  const follow = root.getElementById("log-follow");
  if (follow && follow.checked) log.scrollTop = log.scrollHeight;
  else if (!follow) log.scrollTop = atBottom ? log.scrollHeight : log.scrollTop;
}

let booted = false;
function renderSoon() {
  requestAnimationFrame(() => {
    const host = document.querySelector("esp-app");
    if (!host || !host.shadowRoot) return;
    const root = host.shadowRoot;
    if (!booted) return; // render() runs first
    const D = derived();
    patchConn(root);
    patchStatus(root, D);
    patchLocks(root, D);
    patchValues(root);
    patchLog(root);
  });
}

function render() {
  const host = document.querySelector("esp-app");
  if (!host || !host.shadowRoot) return;
  const root = host.shadowRoot;
  root.innerHTML = `<style>${CSS_TEXT}</style><div class="app">${renderApp()}</div>`;
  bindEvents(root);
  patchConn(root);
  const D = derived();
  patchStatus(root, D);
  patchLocks(root, D);
  patchValues(root);
  patchLog(root);
  booted = true;
}

// ─────────────────────────────
// Events — bound once, elements persist
// ─────────────────────────────

function bindEvents(root) {
  root.querySelectorAll(".qa[data-btn]").forEach((b) =>
    b.addEventListener("click", () => api.pressButton(ENTITIES.button[b.dataset.btn])));

  root.querySelectorAll("[data-relay]").forEach((b) => {
    const name = ENTITIES.switch[b.dataset.relay];
    b.addEventListener("click", () => {
      const cur = (store.states[`switch/${name}`] || {}).state === "ON";
      // optimistic flip so rapid clicks can't desync before SSE confirms
      store.states[`switch/${name}`] = { state: cur ? "OFF" : "ON", value: !cur };
      patchValues(root);
      api.setSwitch(name, !cur);
    });
  });

  root.querySelectorAll(".stepper").forEach((s) =>
    s.querySelectorAll(".pm").forEach((b) => b.addEventListener("click", () => {
      const cfg = Object.values(ENTITIES.number).find((n) => n.name === s.dataset.num);
      const v = parseFloat((store.states[`number/${cfg.name}`] || {}).state);
      if (isNaN(v)) return;
      const nv = Math.min(cfg.max, Math.max(cfg.min, +(v + cfg.step * +b.dataset.dir).toFixed(2)));
      api.setNumber(cfg.name, nv);
    })));

  root.querySelectorAll(".chips").forEach((g) =>
    g.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () =>
      api.setSelect(g.dataset.sel, c.dataset.opt))));

  root.querySelectorAll("[data-prog-run]").forEach((b) =>
    b.addEventListener("click", () => api.pressButton(ENTITIES.button[b.dataset.progRun])));

  root.querySelectorAll("[data-prog-save]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.progSave;
      const input = root.querySelector(`[data-prog="${key}"]`);
      const steps = parseProgram(input.value);
      if (validateProgram(steps)) { input.classList.add("invalid"); return; }
      input.classList.remove("invalid");
      api.setText(ENTITIES.text[key], input.value);
    }));

  root.querySelectorAll("[data-prog]").forEach((input) => {
    input.addEventListener("input", () => {
      const steps = parseProgram(input.value);
      const meta = input.parentElement.querySelector(".prog-meta");
      const err = validateProgram(steps);
      meta.textContent = err ? "✕ " + err : steps.length + " step" + (steps.length === 1 ? "" : "s") + " · " + fmtSec(programTotal(steps));
      meta.classList.toggle("err", !!err);
      input.classList.toggle("invalid", !!err);
    });
  });

  root.getElementById("ota-go").addEventListener("click", () => uploadOta(root));

  root.getElementById("log-clear").addEventListener("click", () => { store.logs = []; patchLog(root); });
}

function uploadOta(root) {
  const input = root.getElementById("ota-file");
  const status = root.getElementById("ota-status");
  const file = input.files[0];
  if (!file) { status.textContent = "Choose a firmware .bin first."; return; }
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/update");
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) status.textContent = `Uploading… ${Math.round((e.loaded / e.total) * 100)}%`;
  };
  xhr.onload = () => {
    status.textContent = xhr.status === 200
      ? "✓ Uploaded — device is rebooting. Wait ~30 s, then reload."
      : `✕ Upload failed (HTTP ${xhr.status})`;
  };
  xhr.onerror = () => { status.textContent = "✕ Network error during upload."; };
  status.textContent = "Uploading…";
  const fd = new FormData();
  fd.append("file", file, file.name);
  xhr.send(fd);
}

// ─────────────────────────────
// Bootstrap
// ─────────────────────────────

const THEME_BG = "#0e1117";

const CSS_TEXT = `
:host{display:block;background:var(--bg);min-height:100vh;
  --bg:#0e1117;--card:#161b26;--card2:#1c2333;--line:#232c40;
  --tx:#e6eaf2;--mut:#8b93a5;--acc:#4a9eff;--red:#ef4444;--ok:#22c55e}
*{box-sizing:border-box;margin:0}
.app{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);
  color:var(--tx);min-height:100vh;max-width:760px;margin:0 auto;padding:14px 14px 90px;
  display:flex;flex-direction:column;gap:14px}
@media (min-width:900px){
  .app{max-width:1100px;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;
    grid-template-areas:"hdr hdr" "status actions" "programs programs" "timing relays" "ota log"}
  .hdr{grid-area:hdr}.c-status{grid-area:status}.c-actions{grid-area:actions}
  .c-programs{grid-area:programs}.c-timing{grid-area:timing}.c-relays{grid-area:relays}
  .c-ota{grid-area:ota}.c-log{grid-area:log}
  .app>*{margin:0}
}
.hdr{display:flex;align-items:center;gap:12px;padding:6px 2px}
.avatar{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#1e3a5f,#0d2440);
  display:flex;align-items:center;justify-content:center;font-size:24px;border:1px solid var(--line)}
.hdr-t{flex:1}.hdr-t h1{font-size:17px;font-weight:700}
.tag{font-size:12px;color:var(--mut)}
.pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.conn-online{color:var(--ok);border-color:#14532d}.conn-connecting,.conn-reconnecting{color:#f59e0b;border-color:#78350f}
.conn-offline{color:var(--red);border-color:#7f1d1d}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.card h2{font-size:14px;font-weight:700;letter-spacing:.02em}
.sub{font-size:11px;color:var(--mut)}
.cyc-row{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px}
.kv .k{display:block;font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.kv .v{font-size:15px;font-weight:700}
.step-chip{padding:1px 9px;border-radius:8px;background:color-mix(in srgb,var(--sc,#8b93a5) 18%,transparent);
  color:var(--sc,#8b93a5);font-size:13px}
.bar{height:10px;border-radius:999px;background:var(--card2);overflow:hidden}
.bar-fill{height:100%;border-radius:999px;background:#3a4356;transition:width 1s linear,background 1s}
.bar-lab{display:flex;justify-content:space-between;font-size:11px;color:var(--mut);margin:5px 0 12px}
.qa-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.qa{padding:12px 4px;border-radius:11px;border:1px solid var(--line);background:var(--card2);
  color:var(--tx);font-size:12.5px;font-weight:600;line-height:1.25;cursor:pointer;
  min-width:0;overflow-wrap:break-word}
.qa:hover:not(:disabled){border-color:var(--acc)}
.qa.stop{background:#3f1d24;border-color:#7f1d1d;color:#fca5a5;font-weight:800}
.qa.stop:hover{background:#7f1d1d;color:#fff}
.qa.locked{opacity:.35;cursor:not-allowed}
.prog{display:grid;grid-template-columns:70px 1fr auto;gap:6px 10px;align-items:center;padding:8px 0;
  border-bottom:1px solid var(--line)}
.prog:last-child{border-bottom:none}
.prog-l{font-size:12px;font-weight:700;color:var(--mut)}
.prog-in{grid-column:2;background:var(--card2);border:1px solid var(--line);border-radius:9px;
  color:var(--tx);padding:9px 11px;font-family:ui-monospace,monospace;font-size:12px;width:100%}
.prog-in:focus{outline:none;border-color:var(--acc)}
.prog-in.invalid{border-color:var(--red)}
.prog-in:disabled{opacity:.5}
.prog-btns{grid-column:3;display:flex;gap:6px}
.prog-btns .btn:disabled{opacity:.5;cursor:not-allowed}
.prog-meta{grid-column:2;font-size:11px;color:var(--mut)}
.prog-meta.err{color:var(--red)}
.row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row-l{font-size:13px;font-weight:600}
.mut{font-size:11px;color:var(--mut);font-weight:400}
.stepper{display:flex;align-items:center;gap:10px}
.pm{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:var(--card2);
  color:var(--acc);font-size:16px;font-weight:700;cursor:pointer}
.pm:disabled{opacity:.35;cursor:not-allowed}
.val{min-width:64px;text-align:center;font-weight:700;font-size:14px}
.val small{color:var(--mut);font-weight:400;font-size:10px;margin-left:2px}
.chips{display:flex;gap:6px}
.chip{padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card2);
  color:var(--mut);font-size:12px;font-weight:700;cursor:pointer}
.chip.on{background:#12233f;border-color:var(--acc);color:var(--acc)}
.chip:disabled{opacity:.35;cursor:not-allowed}
details.adv>summary{display:flex;align-items:baseline;gap:10px;cursor:pointer;list-style:none}
details.adv>summary::-webkit-details-marker{display:none}
details.adv>summary::before{content:"▸";color:var(--mut);transition:.15s}
details.adv[open]>summary::before{transform:rotate(90deg)}
.warn{font-size:11px;color:#f59e0b;background:#2a1c10;border:1px solid #78350f;border-radius:8px;
  padding:7px 10px;margin-bottom:8px}
.toggle{width:44px;height:24px;border-radius:999px;background:var(--card2);border:1px solid var(--line);
  position:relative;cursor:pointer;transition:.2s}
.toggle.on{background:#12233f;border-color:var(--acc)}
.toggle .knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
  background:var(--mut);transition:.2s}
.toggle.on .knob{left:22px;background:var(--acc)}
.toggle:disabled{opacity:.35;cursor:not-allowed}
.ota{display:flex;gap:8px}
.ota input{flex:1;background:var(--card2);border:1px solid var(--line);border-radius:9px;
  color:var(--mut);font-size:12px;padding:8px}
.ota-status{font-size:12px;color:var(--mut);margin-top:8px;min-height:16px}
.btn{padding:9px 16px;border-radius:9px;border:1px solid var(--line);background:var(--card2);
  color:var(--tx);font-size:12.5px;font-weight:700;cursor:pointer}
.btn.primary{background:#12233f;border-color:var(--acc);color:var(--acc)}
.btn.stop{background:#7f1d1d;border-color:#b91c1c;color:#fff;font-weight:800}
.btn.sm{padding:6px 12px;font-size:11.5px}
.log-bar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-bottom:8px;
  font-size:11px;color:var(--mut)}
.log-bar label{display:flex;gap:5px;align-items:center;cursor:pointer}
.log{background:#0a0d13;border:1px solid var(--line);border-radius:9px;padding:10px;
  font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.55;max-height:260px;
  overflow:auto;white-space:pre-wrap;word-break:break-all;color:#9fb0c8}
.stopbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);width:min(732px,calc(100vw - 28px));
  display:flex;align-items:center;justify-content:space-between;gap:12px;background:#1c1216;
  border:1px solid #7f1d1d;border-radius:13px;padding:10px 10px 10px 16px;box-shadow:0 8px 30px rgba(0,0,0,.55);z-index:5}
.stopbar-i{font-size:13px;color:var(--tx)}
@media (max-width:600px){
  .qa-grid{grid-template-columns:repeat(2,1fr)}
  .qa.stop{grid-column:span 2}
  .prog{grid-template-columns:1fr}
  .prog-l{margin-top:4px}
  .prog-in{grid-column:1}
  .prog-btns{grid-column:1;justify-content:flex-end}
  .prog-meta{grid-column:1;grid-row:3}
  .stopbar{width:calc(100vw - 28px)}
}`;

class WasherApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // dark theme beyond the card: page background + mobile chrome
    document.documentElement.style.background = THEME_BG;
    if (document.body) document.body.style.background = THEME_BG;
    // ESPHome's built-in shell omits the viewport meta — without it phones
    // render at ~980px virtual width and the layout stops being responsive
    if (document.head && !document.querySelector("meta[name=viewport]")) {
      const vp = document.createElement("meta");
      vp.name = "viewport";
      vp.content = "width=device-width, initial-scale=1";
      document.head.appendChild(vp);
    }
    if (document.head && !document.querySelector("meta[name=theme-color]")) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = THEME_BG;
      document.head.appendChild(meta);
    }
    render();
    connectEvents();
  }
}
customElements.define("esp-app", WasherApp);
