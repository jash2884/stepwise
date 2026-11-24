// stepwise.jashparmar.com moved to drishi.jashparmar.com. Every address
// redirects for good, except /move, which carries saved progress across.
const TO = "https://drishi.jashparmar.com";
const MOVE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Moving your progress to drishi</title>
<style>body{font:18px/1.5 system-ui,sans-serif;background:#eef2f3;color:#10233a;display:grid;place-content:center;min-height:100vh;margin:0;padding:24px;max-width:40ch;margin-inline:auto}a{color:#006a7b}</style></head>
<body><p id="m">Moving your progress to drishi.</p><p><a href="${TO}/">Go to drishi</a></p><script>
try { var o = {}, n = 0; ["stepwise.progress","stepwise.gate","stepwise.mock"].forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) { o[k] = v; n++; } });
  if (n) { var b = new TextEncoder().encode(JSON.stringify(o)), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); location.replace("${TO}/progress#moved=" + encodeURIComponent(btoa(s))); }
  else document.getElementById("m").textContent = "There is no saved progress in this browser.";
} catch (e) { document.getElementById("m").textContent = "Your progress couldn't be read in this browser."; }
</script></body></html>`;
export default {
  fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === "/move") return new Response(MOVE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    // The old offline cache unregisters itself, so it can't keep serving the old site.
    if (u.pathname === "/sw.js") return new Response("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();})()));", { headers: { "content-type": "text/javascript", "cache-control": "no-cache" } });
    return Response.redirect(TO + u.pathname + u.search, request.method === "GET" || request.method === "HEAD" ? 301 : 308);
  },
};
