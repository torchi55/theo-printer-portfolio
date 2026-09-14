/* Owner-only visit log on /about.
   Open: triple-click the last ■ at the bottom of the sheet, or visit /about#log.
   The key is checked server-side (/api/stats); nothing is readable without it. */
(function () {
  const LABELS = {
    "/": "Home grid", "/about": "About", "/contact": "Contact", "/ai-review": "AI review",
    "/pike": "Pike Courtyard", "/triangulated-tectonic": "Triangulated Tectonic", "/farm-to-brick": "Farm to Brick",
    "/helioform-station": "Helioform Station", "/forged-fungus": "Forged Fungus", "/115-almond": "115 Almond",
    "/haldane-house": "Haldane House", "/axon-voice": "Axon Voice", "/redline": "Redline", "/redline/annotator": "Redline annotator",
  };
  const label = (p) => LABELS[p] || p;
  const ss = (() => { try { return sessionStorage; } catch { return null; } })();
  const ls = (() => { try { return localStorage; } catch { return null; } })();
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dur = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 1) return "—";
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    return m < 60 ? m + "m " + String(s % 60).padStart(2, "0") + "s" : Math.floor(m / 60) + "h " + (m % 60) + "m";
  };
  const clock = (ts) => new Date(ts).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const hhmm = (ts) => new Date(ts).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

  const css = `
  .vl{position:fixed;inset:0;z-index:99990;background:rgba(6,6,6,.78);overflow-y:auto;overscroll-behavior:contain;padding:28px 16px 48px;-webkit-overflow-scrolling:touch}
  .vl[hidden]{display:none}
  .vl-slip{position:relative;max-width:520px;margin:0 auto;background:#f6f5f1 url("assets/paper-texture.jpg");background-size:600px auto;color:#1a1208;
    padding:26px 26px 30px;font-family:var(--euro);box-shadow:0 18px 60px rgba(0,0,0,.55);
    -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/10px 100%,conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) 50%/10px 100%;
    -webkit-mask-composite:source-in;mask-composite:intersect}
  .vl-mono{font-family:ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Courier New",monospace}
  .vl-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-top:6px}
  .vl-title{font-size:13px;letter-spacing:.28em;color:#c8860a;text-shadow:0 0 10px rgba(200,134,10,.2)}
  .vl-sub{font-size:6.5px;letter-spacing:.22em;color:rgba(26,18,8,.4);margin-top:5px;text-transform:uppercase}
  .vl-x{font:inherit;font-size:9px;letter-spacing:.2em;background:none;border:1px solid rgba(26,18,8,.2);color:rgba(26,18,8,.6);padding:6px 9px}
  .vl-x:hover,.vl-tab:hover,.vl-btn:hover{color:#c8860a;border-color:rgba(200,134,10,.5)}
  .vl-dots{height:1px;margin:14px 0;background-image:radial-gradient(circle,rgba(0,0,0,.25) 1px,transparent 1px);background-size:4.5px 1px;background-repeat:repeat-x}
  .vl-rule{border-top:1px dashed rgba(26,18,8,.28);margin:16px 0}
  .vl-h{font-size:8px;letter-spacing:.26em;color:#c8860a;margin:0 0 10px;text-transform:uppercase}
  .vl-lock{display:flex;flex-direction:column;gap:10px;padding:10px 0 4px}
  .vl-lock label{font-size:7px;letter-spacing:.22em;color:rgba(26,18,8,.5)}
  .vl-row{display:flex;gap:8px}
  .vl-in{flex:1;min-width:0;font-size:14px;padding:9px 10px;border:1px solid rgba(26,18,8,.3);background:rgba(255,255,255,.55);color:#1a1208;border-radius:0}
  .vl-in:focus{outline:1px solid #c8860a;border-color:#c8860a}
  .vl-btn,.vl-tab{font-family:var(--euro);font-size:8px;letter-spacing:.2em;text-transform:uppercase;background:none;color:rgba(26,18,8,.62);border:1px solid rgba(26,18,8,.22);padding:8px 12px}
  .vl-tab[aria-pressed=true]{background:#1a1208;color:#f6f5f1;border-color:#1a1208}
  .vl-err{font-size:10px;color:#a3300b;min-height:14px}
  .vl-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .vl-tabs .vl-btn{margin-left:auto}
  .vl-big{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}
  .vl-big b{display:block;font-size:28px;font-weight:400;line-height:1.1}
  .vl-big span{font-size:6.5px;letter-spacing:.2em;color:rgba(26,18,8,.5)}
  .vl-live{color:#c8860a}
  .vl-kv{display:flex;justify-content:space-between;gap:10px;font-size:11px;line-height:1.9}
  .vl-kv i{font-style:normal;color:rgba(26,18,8,.55)}
  .vl-days{display:flex;align-items:flex-end;gap:2px;height:56px;margin-top:6px}
  .vl-days div{flex:1;background:#1a1208;min-height:1px;position:relative}
  .vl-days div.z{background:rgba(26,18,8,.15)}
  .vl-days-lab{display:flex;justify-content:space-between;font-size:9px;color:rgba(26,18,8,.45);margin-top:4px}
  .vl-pg{margin-bottom:12px}
  .vl-pg-top{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
  .vl-pg-name{font-size:8.5px;letter-spacing:.12em;text-transform:uppercase}
  .vl-pg-n{font-size:11px;white-space:nowrap}
  .vl-bar{height:5px;background:rgba(26,18,8,.08);margin:5px 0 4px}
  .vl-bar i{display:block;height:100%;background:repeating-linear-gradient(90deg,#1a1208 0 3px,transparent 3px 4px)}
  .vl-pg-meta{font-size:10px;color:rgba(26,18,8,.55)}
  .vl-ses{padding:10px 0;border-bottom:1px dotted rgba(26,18,8,.25);font-size:11px;line-height:1.6}
  .vl-ses:last-child{border-bottom:0}
  .vl-ses-top{display:flex;justify-content:space-between;gap:10px}
  .vl-ses-top b{font-weight:600}
  .vl-ses .vl-org{color:#1a1208}
  .vl-tag{display:inline-block;font-size:9px;border:1px solid rgba(26,18,8,.3);padding:0 4px;margin-left:4px;vertical-align:1px}
  .vl-tag.hot{border-color:#c8860a;color:#c8860a}
  .vl-trail{color:rgba(26,18,8,.62);margin-top:2px;word-break:break-word}
  .vl-trail em{font-style:normal;color:#1a1208}
  .vl-cols{display:grid;grid-template-columns:1fr 1fr;gap:4px 22px}
  .vl-empty{font-size:11px;color:rgba(26,18,8,.5);padding:6px 0}
  .vl-foot{font-size:6.5px;letter-spacing:.2em;color:rgba(26,18,8,.4);text-align:center;margin-top:18px;line-height:2;text-transform:uppercase}
  .vl-more{display:block;margin:10px auto 0}
  @media (max-width:520px){.vl-slip{padding:22px 16px 26px}.vl-cols{grid-template-columns:1fr}.vl-big b{font-size:24px}}
  `;

  let root, body, state = { days: 1, data: null, showAll: false };

  function build() {
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    root = document.createElement("div");
    root.className = "vl";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Visit log");
    root.innerHTML = `<div class="vl-slip">
      <div class="vl-top"><div><div class="vl-title">VISIT LOG</div><div class="vl-sub">theojaneway.com · owner copy</div></div>
      <button class="vl-x" type="button" data-act="close" aria-label="Close">✕</button></div>
      <div class="vl-dots"></div><div class="vl-body"></div></div>`;
    document.body.appendChild(root);
    body = root.querySelector(".vl-body");
    root.addEventListener("click", (e) => {
      if (e.target === root) return close();
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "close") close();
      if (act === "days") { state.days = Number(b.dataset.days); state.showAll = false; load(); }
      if (act === "refresh") load();
      if (act === "more") { state.showAll = true; render(); }
      if (act === "lock") { ss && ss.removeItem("tj_key"); lockScreen(); }
    });
    root.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = root.querySelector(".vl-in").value;
      if (!v) return;
      ss && ss.setItem("tj_key", v);
      load(v);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });
  }

  function open() {
    if (!root) build();
    root.hidden = false;
    const key = ss && ss.getItem("tj_key");
    key ? load(key) : lockScreen();
  }
  function close() {
    root.hidden = true;
    if (location.hash === "#log") history.replaceState(null, "", location.pathname + location.search);
  }

  function lockScreen(msg) {
    body.innerHTML = `<form class="vl-lock" autocomplete="on">
      <label for="vlKey">OWNER KEY</label>
      <input type="text" name="username" value="theojaneway.com" autocomplete="username" hidden>
      <div class="vl-row"><input id="vlKey" class="vl-in vl-mono" type="password" autocomplete="current-password" required>
      <button class="vl-btn" type="submit">Print</button></div>
      <div class="vl-err vl-mono" role="alert">${esc(msg || "")}</div></form>`;
    setTimeout(() => root.querySelector(".vl-in")?.focus(), 30);
  }

  async function load(key) {
    key = key || (ss && ss.getItem("tj_key"));
    if (!key) return lockScreen();
    if (!state.data) body.innerHTML = `<div class="vl-empty vl-mono">printing…</div>`;
    else root.querySelector(".vl-refresh")?.replaceChildren("…");
    try {
      const r = await fetch("/api/stats?days=" + state.days, { headers: { "x-key": key }, cache: "no-store" });
      if (r.status === 401) { ss && ss.removeItem("tj_key"); state.data = null; return lockScreen("Wrong key."); }
      if (r.status === 429) { state.data = null; return lockScreen("Too many tries. Wait 15 minutes."); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "HTTP " + r.status);
      state.data = await r.json();
      try { ls && ls.setItem("tj_owner", "1"); } catch {} // stop counting this device
      render();
    } catch (e) {
      body.innerHTML = `<div class="vl-err vl-mono">Log offline: ${esc(e.message)}</div>`;
    }
  }

  const list = (rows, max = 8) =>
    rows.length
      ? rows.slice(0, max).map((r) => `<div class="vl-kv vl-mono"><span>${esc(r.name)}</span><i>${r.n}</i></div>`).join("")
      : `<div class="vl-empty vl-mono">—</div>`;

  function render() {
    const d = state.data, s = d.summary;
    const range = { 1: "Today", 7: "7 days", 30: "30 days" };
    const tabs = `<div class="vl-tabs">${[1, 7, 30].map((n) =>
      `<button class="vl-tab" type="button" data-act="days" data-days="${n}" aria-pressed="${state.days === n}">${range[n]}</button>`).join("")}
      <button class="vl-btn vl-refresh" type="button" data-act="refresh" aria-label="Refresh">↻</button></div>`;

    const big = `<div class="vl-big vl-mono">
      <div><b>${s.visitors}</b><span>VISITORS</span></div>
      <div><b>${s.views}</b><span>PAGE VIEWS</span></div>
      <div><b class="${s.liveNow ? "vl-live" : ""}">${s.liveNow}</b><span>ON SITE NOW</span></div></div>
      <div class="vl-dots"></div>
      <div class="vl-kv vl-mono"><span>New visitors</span><i>${s.newVisitors}</i></div>
      <div class="vl-kv vl-mono"><span>Visits</span><i>${s.sessions}</i></div>
      <div class="vl-kv vl-mono"><span>Avg time per visit</span><i>${dur(s.avgSessionMs)}</i></div>
      ${d.days > 1 ? `<div class="vl-kv vl-mono"><span>Today</span><i>${s.todayVisitors} visitors · ${s.todayViews} views</i></div>` : ""}`;

    let days = "";
    if (d.days > 1) {
      const max = Math.max(1, ...d.byDay.map((x) => x.visitors));
      days = `<div class="vl-rule"></div><div class="vl-h">Visitors / day</div>
        <div class="vl-days">${d.byDay.map((x) => `<div class="${x.visitors ? "" : "z"}" style="height:${Math.max(2, (x.visitors / max) * 100)}%" title="${x.day}: ${x.visitors} visitors, ${x.views} views"></div>`).join("")}</div>
        <div class="vl-days-lab vl-mono"><span>${d.byDay[0].day.slice(5)}</span><span>peak ${max}</span><span>${d.byDay[d.byDay.length - 1].day.slice(5)}</span></div>`;
    }

    const maxV = Math.max(1, ...d.pages.map((p) => p.visitors));
    const pages = d.pages.length
      ? d.pages.map((p) => `<div class="vl-pg">
          <div class="vl-pg-top"><span class="vl-pg-name">${esc(label(p.path))}</span><span class="vl-pg-n vl-mono">${p.visitors} ppl · ${p.views} views</span></div>
          <div class="vl-bar"><i style="width:${(p.visitors / maxV) * 100}%"></i></div>
          <div class="vl-pg-meta vl-mono">avg ${dur(p.avgMs)} · median ${dur(p.medMs)} · scrolled ${p.scroll}% · total ${dur(p.totalMs)}</div></div>`).join("")
      : `<div class="vl-empty vl-mono">No views in this range yet.</div>`;

    const shown = state.showAll ? d.sessions : d.sessions.slice(0, 12);
    const sessions = d.sessions.length
      ? shown.map((x) => {
          const who = x.org ? `<span class="vl-org">${esc(x.org)}</span>` : "";
          const tags = (x.returning ? `<span class="vl-tag">returning</span>` : "") +
            (x.q ? `<span class="vl-tag hot">ref=${esc(x.q)}</span>` : "") +
            (x.host ? `<span class="vl-tag">datacenter?</span>` : "");
          const trail = x.trail.map((t) => `<em>${esc(label(t.p))}</em> ${dur(t.ms)}`).join(" → ");
          return `<div class="vl-ses vl-mono">
            <div class="vl-ses-top"><b>${d.days > 1 ? clock(x.start) : hhmm(x.start)}</b><span>${dur(x.ms)}</span></div>
            <div>${esc(x.place || "Unknown place")}${tags}</div>
            ${who ? `<div>${who}</div>` : ""}
            <div style="color:rgba(26,18,8,.55)">via ${esc(x.ref)} · ${esc(x.dev)} · ${esc(x.os)} ${esc(x.br)}</div>
            <div class="vl-trail">${trail}</div></div>`;
        }).join("") +
        (!state.showAll && d.sessions.length > 12 ? `<button class="vl-btn vl-more" type="button" data-act="more">Show all ${d.sessions.length}</button>` : "")
      : `<div class="vl-empty vl-mono">Nobody yet.</div>`;

    const all = Object.entries(d.allTime).sort((a, b) => b[1] - a[1]);

    body.innerHTML = `${tabs}<div class="vl-rule"></div>${big}${days}
      <div class="vl-rule"></div><div class="vl-h">Most viewed projects</div>${pages}
      <div class="vl-rule"></div><div class="vl-h">Who visited</div>${sessions}
      <div class="vl-rule"></div>
      <div class="vl-cols"><div><div class="vl-h">Came from</div>${list(d.referrers)}</div>
      <div><div class="vl-h">Device</div>${list(d.devices, 4)}</div></div>
      <div class="vl-rule"></div><div class="vl-h">Places</div>${list(d.places, 10)}
      <div class="vl-rule"></div><div class="vl-h">All-time views</div>
      ${all.length ? all.map(([p, n]) => `<div class="vl-kv vl-mono"><span>${esc(label(p))}</span><i>${n}</i></div>`).join("") : `<div class="vl-empty vl-mono">—</div>`}
      <div class="vl-foot">Printed ${clock(d.generated)} PT · this device not counted<br>
      time = tab visible only · tag links with ?ref=firmname</div>
      <div style="text-align:center;margin-top:10px"><button class="vl-btn" type="button" data-act="lock">Lock</button></div>`;
  }

  // ── triggers ──
  function arm() {
    const squares = document.querySelectorAll(".ab-corners .ab-sq");
    const sq = squares[squares.length - 1];
    if (sq) {
      Object.assign(sq.style, { padding: "14px", margin: "-14px", position: "relative" }); // finger-sized, still invisible
      let taps = [];
      sq.addEventListener("click", () => {
        const now = Date.now();
        taps = taps.filter((t) => now - t < 900).concat(now);
        if (taps.length >= 3) { taps = []; open(); }
      });
    }
    if (location.hash === "#log") open();
    addEventListener("hashchange", () => { if (location.hash === "#log") open(); });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", arm) : arm();
})();
