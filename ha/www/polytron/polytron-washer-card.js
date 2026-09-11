class PolytronWasherCard extends HTMLElement {
  setConfig(cfg) {
    this._cfg = Object.assign({
      title: "Polytron Washing Machine",
      subtitle: "Smart Controller",
      program: "sensor.polytron_washing_machine_current_program",
      running: "binary_sensor.polytron_washing_machine_cycle_running",
      state: "sensor.polytron_washing_machine_cycle_state",
      // whole-program entities (ring matches the device web UI; new sensors
      // landed under HA's ruang_cuci_ device prefix)
      progress: "sensor.ruang_cuci_polytron_washing_machine_program_progress",
      elapsed: "sensor.ruang_cuci_polytron_washing_machine_program_elapsed",
      remaining: "sensor.ruang_cuci_polytron_washing_machine_program_remaining",
      drain: "switch.polytron_washing_machine_drain_clutch",
      motor_a: "switch.polytron_washing_machine_motor_a",
      motor_b: "switch.polytron_washing_machine_motor_b",
      inlet: "switch.polytron_washing_machine_water_inlet",
      run_quick: "button.polytron_washing_machine_run_quick",
      run_normal: "button.polytron_washing_machine_run_normal",
      run_custom: "button.polytron_washing_machine_run_custom",
      stop: "button.polytron_washing_machine_stop_all",
      start_wash: "button.polytron_washing_machine_start_wash",
      start_drain: "button.polytron_washing_machine_start_drain",
      start_spin: "button.polytron_washing_machine_start_spin",
      start_fill: "button.polytron_washing_machine_start_fill",
      start_rinse: "button.ruang_cuci_polytron_washing_machine_start_rinse",
      start_rinse_nd: "button.ruang_cuci_polytron_washing_machine_start_rinse_no_drain",
      n_wash: "number.polytron_washing_machine_wash_minutes",
      n_spin: "number.polytron_washing_machine_spin_minutes",
      n_drain: "number.polytron_washing_machine_drain_minutes",
      n_fill: "number.polytron_washing_machine_fill_minutes",
      n_rinse: "number.ruang_cuci_polytron_washing_machine_rinse_minutes",
      n_rinsedr: "number.ruang_cuci_polytron_washing_machine_rinse_drain_seconds",
      n_spindr: "number.ruang_cuci_polytron_washing_machine_spin_drain_seconds",
      sel_wash: "select.polytron_washing_machine_wash_preset",
      sel_spin: "select.polytron_washing_machine_spin_preset",
      t_quick: "text.polytron_washing_machine_program_quick",
      t_normal: "text.polytron_washing_machine_program_normal",
      t_custom: "text.polytron_washing_machine_program_custom",
      n_wash_on: "number.ruang_cuci_polytron_washing_machine_wash_pulse_seconds",
      n_wash_dead: "number.ruang_cuci_polytron_washing_machine_wash_dead_time_seconds"
    }, cfg || {});
    this._tab = "home";
    this._prog = "quick";
    this._steps = null;
    this._lastRender = 0;
  }
  set hass(h) {
    this._hass = h;
    const now = Date.now();
    if (!this.shadowRoot) { this.attachShadow({mode:"open"}); this._render(); this._lastRender = now; return; }
    if (now - this._lastRender > 900) { this._render(); this._lastRender = now; }
  }
  getCardSize() { return 12; }
  st(id) { const s = this._hass.states[id]; return s ? s.state : "unavailable"; }
  att(id, a) { const s = this._hass.states[id]; return s ? (s.attributes[a] || "") : ""; }
  call(dom, svc, data) { this._hass.callService(dom, svc, data || {}); }
  fmtMin(sec) { const v = parseFloat(sec) || 0; return v >= 60 ? `${Math.round(v/60)} min` : `${Math.round(v)} s`; }

  _defaults() { return { quick: "WASH:600, DRAIN:30, SPIN:300", normal: "WASH:480, DRAIN:60", custom: "DRAIN:60" }; }
  _textId() { return this._cfg["t_" + this._prog]; }
  _parse(str) {
    return (str || "").split(",").map(x => x.trim()).filter(Boolean).map(tok => {
      const i = tok.indexOf(":");
      if (i > 0) return { op: tok.slice(0, i).toUpperCase(), sec: parseInt(tok.slice(i+1)) || 0 };
      return { op: tok.toUpperCase(), sec: 0 };
    });
  }
  _join(steps) { return steps.map(s => s.sec ? `${s.op}:${s.sec}` : s.op).join(", "); }

  _svcBtn(domain, service, entity, label, cls) {
    return `<button class="qa ${cls||""}" onclick="(this._root&&0)">
      <span class="qa-ic">${label.ic}</span><span class="qa-tx">${label.tx}</span></button>`;
  }

  _render() {
    const h = this._hass; if (!h) return;
    const C = this._cfg;
    const on = this.st(C.running) === "on";
    const prog = Math.max(0, Math.min(100, parseFloat(this.st(C.progress)) || 0));
    const progName = this.st(C.program) || "IDLE";
    const runPill = on ? `<span class="pill run">RUNNING ●</span>` : `<span class="pill idle">IDLE</span>`;
    const ring = 2 * Math.PI * 52;
    const off = ring * (1 - prog / 100);
    const stateTxt = this.st(C.state);
    const sub = stateTxt === "IDLE" ? "Idle · Ready to start" :
      stateTxt.charAt(0) + stateTxt.slice(1).toLowerCase() + " · " + progName;
    const MODEC = { WASH: "#1e88fe", DRAIN: "#00897b", SPIN: "#8e24aa", FILL: "#00acc1" };
    const modeColor = on ? (MODEC[stateTxt] || "#1e88fe") : "#9ca3af";
    const lock = on;

    const chip = (id, name, ic) => {
      const s = this.st(id) === "on";
      return `<div class="chip"><span class="chip-ic">${ic}</span><div><div class="chip-n">${name}</div><div class="chip-s ${s?"on":""}">${s?"ON":"OFF"}</div></div></div>`;
    };
    const sw = (id, name, ic) => {
      const s = this.st(id) === "on";
      return `<div class="mrow"><div class="mic">${ic}</div><div class="mn">${name}<div class="ms ${s?"on":""}">${s?"ON":"OFF"}</div></div>
        <label class="tg ${s?"on":""}" data-dom="switch" data-svc="${s?"turn_off":"turn_on"}" data-id="${id}"><span class="kn"></span></label></div>`;
    };
    const qa = (id, ic, tx, cls) => `<div class="qa ${cls||""}" data-dom="button" data-svc="press" data-id="${id}"><div class="qa-c"><span>${ic}</span></div><div class="qa-t">${tx}</div></div>`;
    const step = (eid, name, ic, min, max, presetSel, incr) => {
      const inc = incr || 1;
      const v = parseFloat(this.st(eid)) || 0;
      const dec = inc < 1 ? (inc < 0.3 ? 2 : 1) : 0;
      return `<div class="step"><div class="sic">${ic}</div><div class="sn">${name}</div>
        <div class="stm"><button class="pm" data-dom="number" data-svc="set_value" data-id="${eid}" data-v="${Math.max(min, +(v-inc).toFixed(2))}">−</button>
        <span class="sv">${v.toFixed(dec)}</span>
        <button class="pm" data-dom="number" data-svc="set_value" data-id="${eid}" data-v="${Math.min(max, +(v+inc).toFixed(2))}">+</button></div>
        ${presetSel || ""}</div>`;
    };
    const presets = (selId, opts) => {
      const cur = this.st(selId);
      return `<div class="presets">${opts.map(o => `<span class="pr ${cur===o?"on":""}" data-dom="select" data-svc="select_option" data-id="${selId}" data-v="${o}">${o}</span>`).join("")}</div>`;
    };

    let tabContent = "";
    if (this._tab === "home") {
      tabContent = `
      <div class="card">
        <div class="ringwrap">
          <div class="ringbox">
            <svg viewBox="0 0 120 120"><circle class="rbg" cx="60" cy="60" r="52"/><circle class="rfg" cx="60" cy="60" r="52"
              style="stroke:${modeColor}" stroke-dasharray="${ring}" stroke-dashoffset="${off}"/></svg>
            <div class="rc"><div class="rp">${on ? Math.round(prog) + "%" : "—"}</div><div class="rs">${on ? stateTxt.charAt(0) + stateTxt.slice(1).toLowerCase() : "Idle"}</div></div>
          </div>
          <div class="cyc">
            <div class="crow">${runPill}</div>
            <div class="ct">${stateTxt === "IDLE" ? "Cycle Ready" : stateTxt.charAt(0) + stateTxt.slice(1).toLowerCase() + "ing"}</div>
            <div class="cs">${sub}</div>
            <div class="er">
              <div><div class="ek">Elapsed Time</div><div class="ev">${this.fmtMin(this.st(C.elapsed))}</div></div>
              <div><div class="ek">Remaining Time</div><div class="ev">${this.fmtMin(this.st(C.remaining))}</div></div>
            </div>
          </div>
        </div>
        <div class="chips">
          ${chip(C.drain, "Drain-Clutch", "🌀")}${chip(C.motor_a, "Motor A", "⚙")}${chip(C.motor_b, "Motor B", "⚙")}${chip(C.inlet, "Water Inlet", "💧")}
        </div>
      </div>
      <div class="card">
        <div class="h2">Quick Actions</div><div class="h3">Start specific functions or stop everything.</div>
        <div class="qarow">
          ${qa(C.start_wash,"▶","Start Wash", lock ? "b dis" : "b")}${qa(C.start_drain,"💧","Start Drain", lock ? "b dis" : "b")}${qa(C.start_spin,"🌀","Start Spin", lock ? "b dis" : "b")}
          ${qa(C.start_fill,"🚿","Start Fill", lock ? "b dis" : "b")}${qa(C.start_rinse,"🫧","Rinse", lock ? "b dis" : "b")}${qa(C.start_rinse_nd,"🫧","Rinse No Drain", lock ? "b dis" : "b")}${qa(C.stop,"■","Stop All","r")}
        </div>
      </div>
      <div class="card">
        <div class="h2">Manual Controls</div><div class="h3">Control individual components in real time.</div>
        <div class="grid2${lock?" dis":""}">${sw(C.drain,"Drain-Clutch","💧")}${sw(C.motor_a,"Motor A","⚙")}${sw(C.motor_b,"Motor B","⚙")}${sw(C.inlet,"Water Inlet","💧")}</div>
      </div>
      <div class="card${lock?" dis":""}">
        <div class="h2">⏱ Cycle Timing <span class="mut">(minutes)</span></div><div class="h3">Set the duration for each step.</div>
        ${step(C.n_wash, "Wash", "💧", 1, 60, presets(C.sel_wash, ["5","10","20","30"]))}
        ${step(C.n_drain, "Drain", "🌊", 1, 15, null)}
        ${step(C.n_spin, "Spin", "🌀", 1, 15, presets(C.sel_spin, ["10","20","30"]))}
        ${step(C.n_spindr, "Spin Drain (s, before motor)", "🌊", 5, 300, null, 5)}
        ${step(C.n_rinse, "Rinse (agitate in clean water)", "🫧", 1, 15, null)}
        ${step(C.n_rinsedr, "Rinse Drain (pre-drain + final drain)", "🌊", 15, 180, null, 5)}
        ${step(C.n_wash_on, "Wash Pulse (A/B run time)", "⚙", 0.5, 10, null, 0.5)}
        ${step(C.n_wash_dead, "Wash Dead Time (gap)", "⏸", 0.5, 5, null, 0.25)}
      </div>`;
    } else if (this._tab === "programs") {
      if (!this._steps) this._steps = this._parse(this.st(this._textId()));
      const meta = { quick: ["⚡","Quick","pblue"], normal: ["🍃","Normal","pgreen"], custom: ["⚙","Custom","ppurple"] };
      const m = meta[this._prog];
      tabContent = `
      <div class="card">
        <div class="h2">Programs</div><div class="h3">Manage wash cycles</div>
        <div class="seg">${["quick","normal","custom"].map(p =>
          `<span class="sego ${this._prog===p?"on":""}" data-p="${p}">${meta[p][0]} ${meta[p][1]}</span>`).join("")}</div>
        <div class="${m[2]} pcard"><div class="pico">${m[0]}</div><div class="pn">${m[1]}</div>
          <div class="pseq">${this._steps.map(s => s.sec ? `${s.op}: ${s.sec}s` : s.op).join(" · ")}</div></div>
      </div>
      <div class="card">
        <div class="h2">Edit Program Sequence</div><div class="h3">Add, remove or adjust each step.</div>
        ${this._steps.map((s, i) => `<div class="erow">
          <div class="eic">${s.op==="WASH"?"💧":s.op==="DRAIN"?"⬇":s.op==="SPIN"?"🌀":s.op==="FILL"?"🚿":"⏸"}</div>
          <div class="en">${s.op.charAt(0)+s.op.slice(1).toLowerCase()}<div class="es">${s.op==="WASH"?"Main wash cycle":s.op==="DRAIN"?"Remove water":s.op==="SPIN"?"Spin dry":s.op==="FILL"?"Fill water":"Pause"}</div></div>
          <div class="stm"><button class="pm" data-a="dec" data-i="${i}">−</button><span class="sv">${s.sec}</span><button class="pm" data-a="inc" data-i="${i}">+</button></div>
          <button class="del" data-a="del" data-i="${i}">🗑</button></div>`).join("")}
        <div class="addstep" data-a="add">＋ Add Step</div>
      </div>
      <div class="btnrow">
        <button class="big ghost${lock?" dis":""}" data-a="run">▶ Run Now</button>
        <button class="big primary" data-a="save">💾 Save Program</button>
      </div>
      <div class="card"><div class="h3">Raw value: <code>${this.st(this._textId()) || "—"}</code></div></div>`;
    } else if (this._tab === "logs") {
      const ids = [C.program, C.running, C.state, C.drain, C.motor_a, C.motor_b, C.inlet];
      const acts = ids.map(id => this._hass.states[id]).filter(Boolean)
        .sort((a, b) => (b.last_changed || "").localeCompare(a.last_changed || "")).slice(0, 8);
      tabContent = `
      <div class="card">
        <div class="h2">Device Health</div>
        <div class="hpill ${on ? "ok" : "warn"}">${on ? "● Healthy" : "● Idle"}</div>
        <div class="h3">${this._cfg.title}</div>
        <div class="hrow"><div>Wi-Fi</div><div class="ok">Connected</div></div>
        <div class="hrow"><div>Firmware</div><div class="ok">v3 direct-drive</div></div>
        <div class="hrow"><div>Cycle State</div><div>${this.st(C.state)}</div></div>
      </div>
      <div class="card">
        <div class="h2">Recent Activity</div><div class="h3">Latest events from your washing machine.</div>
        ${acts.map(s => `<div class="act"><span class="dot ${s.state==="on"?"g":"b"}"></span>
          <span class="an">${s.attributes.friendly_name || s.entity_id}</span>
          <span class="as">${s.state}</span>
          <span class="at">${(s.last_changed || "").slice(11, 19)}</span></div>`).join("")}
      </div>`;
    }

    const tabs = [["home","⌂","Home"],["programs","☰","Programs"],["home2","📈","Controls"],["logs","⚙","Logs"]];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;font-family:inherit}
      *{box-sizing:border-box}
      .app{max-width:520px;margin:0 auto;padding-bottom:90px}
      .hdr{background:linear-gradient(135deg,#2196f3,#0d5bd8);border-radius:18px;padding:18px;color:#fff;display:flex;gap:12px;align-items:center}
      .av{width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:24px}
      .ht{flex:1}.hn{font-weight:700;font-size:17px}.hs{opacity:.85;font-size:12px}
      .online{display:inline-block;background:#22c55e;color:#fff;border-radius:999px;font-size:11px;padding:2px 10px;margin-top:4px}
      .tag{font-size:11px;text-align:right;opacity:.85;line-height:1.4}
      .card{background:#fff;border-radius:16px;padding:16px;margin-top:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);color:#1f2937}
      .h2{font-weight:700;font-size:16px}.h3{font-size:12px;color:#6b7280;margin:2px 0 10px}
      .mut{color:#9ca3af;font-weight:400;font-size:13px}
      .dis{opacity:.4;pointer-events:none}
      .ringwrap{display:flex;gap:14px;align-items:center}
      .ringbox{position:relative;width:120px;height:120px;flex:0 0 120px}
      svg{width:120px;height:120px;transform:rotate(-90deg)}
      .rbg{fill:none;stroke:#e5e7eb;stroke-width:10}
      .rfg{fill:none;stroke:#1e88fe;stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset 1s}
      .rc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
      .rp{font-size:24px;font-weight:800}.rs{font-size:10px;color:#6b7280}
      .cyc{flex:1}.pill{font-size:10px;padding:2px 10px;border-radius:999px;font-weight:700}
      .pill.run{background:#dbeafe;color:#1e88fe}.pill.idle{background:#f3f4f6;color:#6b7280}
      .ct{font-size:18px;font-weight:800;margin-top:6px}.cs{font-size:11px;color:#6b7280;margin-bottom:8px}
      .er{display:flex;gap:18px}.ek{font-size:10px;color:#6b7280}.ev{font-size:15px;font-weight:700}
      .chips{display:flex;gap:6px;margin-top:14px}
      .chip{flex:1;background:#f8fafc;border-radius:10px;padding:6px;font-size:10px;text-align:center}
      .chip-ic{font-size:14px}.chip-n{font-weight:600;margin-top:2px}.chip-s{color:#9ca3af;font-weight:700}.chip-s.on{color:#22c55e}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .mrow{display:flex;align-items:center;gap:8px;background:#f8fafc;border-radius:12px;padding:10px}
      .mic{font-size:18px}.mn{flex:1;font-weight:600;font-size:13px}.ms{font-size:10px;color:#9ca3af;font-weight:700}.ms.on{color:#22c55e}
      .tg{width:40px;height:22px;background:#d1d5db;border-radius:999px;position:relative;cursor:pointer;transition:.2s;flex:0 0 auto}
      .tg.on{background:#1e88fe}.kn{position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s}
      .tg.on .kn{left:20px}
      .qarow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.qa{text-align:center;cursor:pointer}
      @media(max-width:480px){.qarow{grid-template-columns:repeat(2,1fr)}.qarow .qa.r{grid-column:span 2}}
      .qa-c{width:52px;height:52px;border-radius:16px;background:#dbeafe;color:#1e88fe;font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px}
      .qa.r .qa-c{background:#fee2e2;color:#dc2626}.qa-t{font-size:11px;font-weight:600}
      .step{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6}
      .sic{font-size:18px}.sn{flex:1;font-weight:600;font-size:13px}
      .stm{display:flex;align-items:center;gap:8px}
      .pm{width:28px;height:28px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:16px;cursor:pointer;color:#1e88fe;font-weight:700}
      .sv{min-width:30px;text-align:center;font-weight:700}
      .presets{display:flex;gap:4px;margin-left:6px}
      .pr{font-size:10px;padding:2px 8px;border-radius:999px;background:#f3f4f6;cursor:pointer;color:#6b7280;font-weight:600}
      .pr.on{background:#dbeafe;color:#1e88fe}
      .seg{display:flex;background:#f3f4f6;border-radius:12px;padding:4px;margin-bottom:12px}
      .sego{flex:1;text-align:center;padding:8px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;color:#6b7280}
      .sego.on{background:#1e88fe;color:#fff}
      .pcard{border-radius:14px;padding:16px;text-align:center}
      .pblue{background:#eff6ff}.pgreen{background:#f0fdf4}.ppurple{background:#faf5ff}
      .pico{font-size:26px}.pn{font-weight:800;font-size:16px;margin:4px 0}
      .pseq{font-size:12px;color:#374151;font-family:monospace}
      .erow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6}
      .eic{width:34px;height:34px;background:#eff6ff;border-radius:10px;display:flex;align-items:center;justify-content:center}
      .en{flex:1;font-weight:600;font-size:13px}.es{font-size:10px;color:#9ca3af;font-weight:400}
      .del{background:none;border:none;cursor:pointer;font-size:14px;opacity:.6}
      .addstep{margin-top:10px;text-align:center;background:#eff6ff;color:#1e88fe;border-radius:12px;padding:10px;font-weight:700;font-size:13px;cursor:pointer}
      .btnrow{display:flex;gap:10px;margin-top:14px}
      .big{flex:1;padding:12px;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer}
      .ghost{background:#dbeafe;color:#1e88fe}.primary{background:#1e88fe;color:#fff}
      .hpill{display:inline-block;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700}
      .hpill.ok{background:#dcfce7;color:#16a34a}.hpill.warn{background:#f3f4f6;color:#6b7280}
      .hrow{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f3f4f6}
      .ok{color:#16a34a;font-weight:600}
      .act{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
      .dot{width:8px;height:8px;border-radius:50%}.dot.g{background:#22c55e}.dot.b{background:#1e88fe}
      .an{flex:1;font-weight:600}.as{color:#6b7280}.at{color:#9ca3af;font-family:monospace}
      code{font-size:10px;word-break:break-all}
      .nav{position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;background:#fff;border-top:1px solid #e5e7eb;display:flex;z-index:9}
      .ntab{flex:1;text-align:center;padding:10px 0 12px;font-size:10px;font-weight:600;color:#9ca3af;cursor:pointer}
      .ntab.on{color:#1e88fe}.ntab .ni{display:block;font-size:18px;margin-bottom:2px}
      @media (min-width: 768px){
        .app{display:flex;flex-direction:column;max-width:1080px;padding-bottom:20px}
        .nav{position:static;order:-1;width:100%;max-width:none;border-top:none;border-bottom:1px solid #e5e7eb;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:2px}
        .ntab{padding:12px 0;font-size:12px}
        .ntab.on{font-weight:800}
        .content{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch}
        .content .card{margin-top:0}
        .content > .btnrow{grid-column:1/-1;margin-top:0}
      }
      @media (prefers-color-scheme: dark){.card{background:#1f2937;color:#f3f4f6}.chip,.mrow{background:#111827}.h3,.cs,.ek,.rs,.ms,.chip-s{color:#9ca3af}.step,.erow,.act,.hrow{border-color:#374151}.pm{background:#111827;border-color:#374151}.seg{background:#111827}.pr{background:#111827}.rbg{stroke:#374151}.nav{background:#111827;border-color:#374151}.ntab{color:#6b7280}.hpill.warn{background:#374151}.qa.r .qa-c{background:#7f1d1d}}
    </style>
    <div class="app">
      <div class="hdr"><div class="av">🧺</div><div class="ht"><div class="hn">${this._cfg.title}</div><div class="hs">${this._cfg.subtitle}</div><div class="online">● Online</div></div><div class="tag">Smarter Laundry<br>Happier Home</div></div>
      <div class="content">${tabContent}</div>
      <div class="nav">${tabs.map(t => `<div class="ntab ${this._tab===t[0]||(t[0]==="home2"&&this._tab==="controls")?"on":""}" data-tab="${t[0]==="home2"?"controls":t[0]}"><span class="ni">${t[1]}</span>${t[2]}</div>`).join("")}</div>
    </div>`;

    // wire events
    const sr = this.shadowRoot;
    sr.querySelectorAll("[data-dom]").forEach(el => {
      el.addEventListener("click", () => {
        const d = el.dataset;
        if (d.dom === "select") this.call("select", "select_option", { entity_id: d.id, option: d.v });
        else if (d.v) this.call(d.dom, d.svc, { entity_id: d.id, value: parseFloat(d.v) });
        else this.call(d.dom, d.svc, { entity_id: d.id });
      });
    });
    sr.querySelectorAll("[data-tab]").forEach(el => el.addEventListener("click", () => { this._tab = el.dataset.tab; this._render(); }));
    sr.querySelectorAll("[data-p]").forEach(el => el.addEventListener("click", () => { this._prog = el.dataset.p; this._steps = null; this._render(); }));
    sr.querySelectorAll("[data-a]").forEach(el => el.addEventListener("click", () => {
      const a = el.dataset.a, i = parseInt(el.dataset.i);
      if (a === "inc") this._steps[i].sec += 5;
      if (a === "dec") this._steps[i].sec = Math.max(0, this._steps[i].sec - 5);
      if (a === "del") this._steps.splice(i, 1);
      if (a === "add") this._steps.push({ op: "DRAIN", sec: 60 });
      if (a === "save") { this.call("text", "set_value", { entity_id: this._textId(), value: this._join(this._steps) }); }
      if (a === "run") { this.call("button", "press", { entity_id: this._cfg["run_" + this._prog] }); this._tab = "home"; }
      this._render();
    }));
  }
}
customElements.define("polytron-washer-card", PolytronWasherCard);
