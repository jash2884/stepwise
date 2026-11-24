// Brings progress saved at the old address (stepwise.jashparmar.com) here. It
// arrives in the URL fragment, which browsers never send to a server, and only
// fills in what this address doesn't already have.
export function acceptMove() {
  const m = /^#moved=(.+)$/.exec(location.hash);
  if (!m) return false;
  let kept = 0;
  try {
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(decodeURIComponent(m[1])), (c) => c.charCodeAt(0))));
    for (const [k, v] of Object.entries(data)) if (/^stepwise\.(progress|gate|mock)$/.test(k) && typeof v === "string" && v.length < 4e6 && localStorage.getItem(k) === null) { JSON.parse(v); localStorage.setItem(k, v); kept++; }
  } catch (e) { console.warn("couldn't bring progress across", e); }
  history.replaceState(null, "", location.pathname + location.search);
  return kept > 0;
}
