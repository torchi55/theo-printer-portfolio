/* Visit log — first-party, no cookies, no third-party scripts.
   One "view" beacon on load, then cumulative engaged time (visible-tab
   only) + max scroll depth each time the tab hides. Owner's own device
   is skipped once the About log has been unlocked on it. */
(function () {
  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || /^192\.168\./.test(h) || location.protocol === "file:") return;
  if (navigator.webdriver) return;

  function store(s) { try { return window[s]; } catch (e) { return null; } }
  var ls = store("localStorage"), ss = store("sessionStorage");
  try { if (ls && ls.getItem("tj_owner") === "1") return; } catch (e) {}

  function rid() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function keep(s, k) {
    try { var v = s.getItem(k); if (!v) { v = rid(); s.setItem(k, v); } return v; } catch (e) { return rid(); }
  }

  var visitor = ls ? keep(ls, "tj_v") : rid();
  var session = ss ? keep(ss, "tj_s") : rid();
  var view = rid();
  var qs = new URLSearchParams(location.search);
  var ref = document.referrer;
  try { if (ref && new URL(ref).hostname === h) ref = ""; } catch (e) { ref = ""; }

  var URL_ = "/api/collect";
  function send(body, beacon) {
    var json = JSON.stringify(body);
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon(URL_, json)) return;
      fetch(URL_, { method: "POST", body: json, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) {}
  }

  send({
    t: "view", id: view, v: visitor, s: session,
    p: location.pathname, r: ref.slice(0, 300),
    q: (qs.get("ref") || qs.get("utm_source") || "").slice(0, 60),
    w: window.innerWidth
  });

  var shown = document.visibilityState === "visible" ? Date.now() : 0;
  var total = 0, depth = 0, lastSent = -1;

  function scrollDepth() {
    var el = document.scrollingElement || document.documentElement;
    var max = Math.max(el.scrollHeight - window.innerHeight, 0);
    var d = max ? Math.round((window.scrollY / max) * 100) : 100;
    if (d > depth) depth = Math.min(d, 100);
  }
  addEventListener("scroll", scrollDepth, { passive: true });

  function flush() {
    if (shown) { total += Date.now() - shown; shown = 0; }
    scrollDepth();
    if (total === lastSent) return;
    lastSent = total;
    send({ t: "time", id: view, ms: total, sd: depth }, true);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
    else shown = Date.now();
  });
  addEventListener("pagehide", flush);
})();
