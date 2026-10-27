// DNS resolution (iterative and recursive, with caching at the local server)
// and HTTP response times for non-persistent and persistent connections.
//
// Conventions (stated in the UI):
// - Every DNS message takes one time unit (half a round trip) to arrive.
// - The local DNS server always answers its own host recursively; "iterative"
//   and "recursive" describe how it asks the rest of the hierarchy.
// - HTTP times follow Kurose & Ross: a TCP connection costs 1 RTT, each request
//   and response 1 RTT, and each object adds its transmission time. Parallel
//   connections are assumed not to slow each other down.

export const DNS_LANES = [
  { id: "host", label: "Host" }, { id: "local", label: "Local DNS" }, { id: "root", label: "Root" },
  { id: "tld", label: "TLD" }, { id: "auth", label: "Authoritative" },
];

export const DNS_CODE = {
  iterative: [
    "host → local DNS: \"IP of name?\"  // a recursive query",
    "local DNS: if the answer is cached, reply at once",
    "local → root: \"name?\"  root refers it to the TLD servers",
    "local → TLD: \"name?\"  TLD refers it to the authoritative server",
    "local → authoritative: \"name?\"  it answers with the A record",
    "local DNS caches every reply until its TTL runs out",
    "local DNS → host: the IP address",
  ],
  recursive: [
    "host → local DNS: \"IP of name?\"  // a recursive query",
    "local DNS: if the answer is cached, reply at once",
    "local → root (recursive): root must find the answer itself",
    "  root → TLD server (recursive)",
    "    TLD → authoritative, which answers with the A record",
    "  each server passes the answer back down the chain, caching it",
    "local DNS → host: the IP address",
  ],
};

// A stable made-up address in the documentation range 203.0.113.0/24.
const fakeIp = (name) => `203.0.113.${[...name].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 253, 7) + 1}`;

export function parseName(text) {
  const name = String(text).trim().toLowerCase().replace(/\.$/, "");
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(name)) throw new Error("Write a full domain name like gaia.cs.umass.edu.");
  const labels = name.split(".");
  if (labels.length < 3) throw new Error("Use a name with at least three parts (host.domain.tld) so there's an authoritative server to ask.");
  return { name, tld: labels.at(-1), domain: labels.slice(-2).join(".") };
}

export function dnsLookup({ name = "gaia.cs.umass.edu", mode = "iterative", cache = "none" } = {}) {
  if (!DNS_CODE[mode]) throw new Error(`Unknown mode ${mode}`);
  if (!["none", "tld", "answer"].includes(cache)) throw new Error(`Unknown cache state ${cache}`);
  const n = parseName(name), ip = fakeIp(n.name);
  const tldNs = `${n.tld}-servers.example`, authNs = `dns.${n.domain}`;
  const msgs = [], steps = [];
  const cached = cache === "none" ? [] : cache === "tld" ? [`${n.tld} NS ${tldNs}`] : [`${n.tld} NS ${tldNs}`, `${n.domain} NS ${authNs}`, `${n.name} A ${ip}`];
  let t = 0;
  const send = (from, to, label, short, line, note, cls = "query") => {
    msgs.push({ from, to, t0: t, t1: t + 1, label, short, cls, step: steps.length });
    t += 1;
    steps.push({ line, note, vars: { asking: `${from} → ${to}`, question: n.name, messages: msgs.length, time: `${t} × one-way`, cache: [...cached] } });
  };
  steps.push({ line: null, note: `The host wants the IP address of ${n.name}. ${cache === "none" ? "The local DNS server's cache is empty." : cache === "tld" ? `The local DNS server already has the .${n.tld} TLD servers cached (very common: root servers are rarely asked).` : `The local DNS server already has ${n.name} cached from an earlier lookup.`}`, vars: { question: n.name, messages: 0, cache: [...cached] } });
  send("host", "local", `query ${n.name}?`, "Q", 1, `The host's resolver asks its local DNS server (from DHCP). This query is recursive: "find me the answer, whatever it takes".`);
  if (cache === "answer") {
    send("local", "host", `A ${ip}`, "A", [2, 7], `The answer is in the local server's cache, so it replies at once: ${n.name} is ${ip}. Only 2 messages, one round trip.`, "answer");
    return { msgs, steps, ip, messages: msgs.length, time: t, tMax: t + 1 };
  }
  const cacheAdd = (rec, line) => { if (!cached.includes(rec)) cached.push(rec); steps.at(-1).vars.cache = [...cached]; steps.at(-1).line = [steps.at(-1).line, line].flat(); };
  if (mode === "iterative") {
    if (cache !== "tld") {
      send("local", "root", `query ${n.name}?`, "Q", 3, `The local server asks a root server. Root servers don't know ${n.name}; they only know who runs each top-level domain.`);
      send("root", "local", `refer: .${n.tld} NS ${tldNs}`, "NS", 3, `The root replies with a referral: "ask the .${n.tld} servers", giving their names and addresses (glue records). This is an iterative reply: the root does no more work itself.`, "referral");
      cacheAdd(`${n.tld} NS ${tldNs}`, 6);
    }
    send("local", "tld", `query ${n.name}?`, "Q", [2, 4].slice(cache === "tld" ? 0 : 1), `${cache === "tld" ? `The .${n.tld} servers are cached, so the local server skips the root and ` : "The local server "}asks the .${n.tld} TLD server.`);
    send("tld", "local", `refer: ${n.domain} NS ${authNs}`, "NS", 4, `The TLD server refers it to ${n.domain}'s authoritative server, ${authNs}.`, "referral");
    cacheAdd(`${n.domain} NS ${authNs}`, 6);
    send("local", "auth", `query ${n.name}?`, "Q", 5, `The local server asks ${authNs}, which holds the real records for ${n.domain}.`);
    send("auth", "local", `A ${ip}`, "A", 5, `The authoritative server answers: ${n.name} has address ${ip}.`, "answer");
    cacheAdd(`${n.name} A ${ip}`, 6);
    send("local", "host", `A ${ip}`, "A", 7, `The local server caches every record it learned and answers the host. ${msgs.length + 1} messages in all; the next lookup of any name under .${n.tld} can skip the root.`, "answer");
  } else {
    if (cache !== "tld") {
      send("local", "root", `query ${n.name}? (recursive)`, "Q", 3, `The local server asks the root recursively: the root must now find the answer itself.`);
      send("root", "tld", `query ${n.name}? (recursive)`, "Q", 4, `The root passes the query on to the .${n.tld} TLD server, and must wait for its answer. This puts load on the root, which is why real root servers refuse recursive queries.`);
    } else send("local", "tld", `query ${n.name}? (recursive)`, "Q", [2, 4], `The .${n.tld} servers are cached, so the local server asks the TLD server directly, recursively.`);
    send("tld", "auth", `query ${n.name}? (recursive)`, "Q", 5, `The TLD server asks ${authNs}, the authoritative server for ${n.domain}.`);
    send("auth", "tld", `A ${ip}`, "A", 5, `The authoritative server answers: ${n.name} is ${ip}.`, "answer");
    if (cache !== "tld") {
      send("tld", "root", `A ${ip}`, "A", 6, `The answer travels back the way the query came: TLD to root…`, "answer");
      send("root", "local", `A ${ip}`, "A", 6, `…root to the local server.`, "answer");
    } else send("tld", "local", `A ${ip}`, "A", 6, `The TLD server passes the answer back to the local server.`, "answer");
    cacheAdd(`${n.name} A ${ip}`, 6);
    send("local", "host", `A ${ip}`, "A", 7, `The local server caches the answer and replies to the host. Still ${msgs.length + 1} messages, but every server in the chain had to hold state while it waited.`, "answer");
  }
  return { msgs, steps, ip, messages: msgs.length, time: t, tMax: t + 1 };
}

// --- HTTP response time ---------------------------------------------------------------
export const HTTP_MODES = {
  "np-serial": { name: "Non-persistent, one connection at a time" },
  "np-parallel": { name: "Non-persistent, parallel connections" },
  "p-nopipe": { name: "Persistent, without pipelining" },
  "p-pipe": { name: "Persistent, with pipelining" },
};

export const HTTP_CODE = [
  "look up the server's IP address with DNS  // RTT₁ + … + RTTₙ",
  "open a TCP connection: SYN, SYN+ACK  // 1 RTT",
  "send GET for the base HTML file; receive it  // 1 RTT + transmit",
  "non-persistent: close it; every object needs a new connection",
  "  parallel: open up to P connections at once",
  "persistent: keep the connection open for every object",
  "  without pipelining: one GET at a time, 1 RTT each",
  "  with pipelining: send every GET at once, 1 RTT in all",
];

export function httpTiming({ mode = "np-serial", objects = 8, rtt = 100, tx = 0, parallel = 5, dns = [] } = {}) {
  if (!HTTP_MODES[mode]) throw new Error(`Unknown mode ${mode}`);
  if (!Number.isInteger(objects) || objects < 0 || objects > 30) throw new Error("Use 0 to 30 referenced objects.");
  if (!(rtt > 0) || rtt > 10000) throw new Error("The RTT must be between 0 and 10,000 ms.");
  if (!(tx >= 0) || tx > 10000) throw new Error("Transmission time must be between 0 and 10,000 ms.");
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 30) throw new Error("Use 1 to 30 parallel connections.");
  if (dns.some((x) => !(x >= 0))) throw new Error("DNS round trips must be zero or more.");
  const msgs = [], steps = [], spans = [];
  const T = (ms) => ms / rtt; // diagram time is in RTTs
  let t = 0, fetched = 0, conns = 0;
  const dnsTotal = dns.reduce((s, x) => s + x, 0);
  const half = 0.5;
  const step = (line, note) => steps.push({ line, note, vars: { elapsed: `${(t * rtt).toFixed(0)} ms`, RTTs: Number(t.toFixed(2)), "objects received": fetched, "connections opened": conns } });
  const msg = (from, label, short, cls, dur = half) => { msgs.push({ from, to: from === "client" ? "server" : "client", t0: t, t1: t + dur, label, short, cls, step: steps.length }); t += dur; };
  steps.push({ line: null, note: `Fetch a page: one base HTML file that references ${objects} object${objects === 1 ? "" : "s"} (images and so on). RTT = ${rtt} ms${tx ? `, and each object takes ${tx} ms to transmit` : ""}.`, vars: { elapsed: "0 ms", RTTs: 0, "objects received": 0, "connections opened": 0 } });
  if (dns.length) {
    spans.push({ lane: "client", t0: 0, t1: T(dnsTotal), text: "DNS", step: 1, side: "left" });
    t = T(dnsTotal);
    step(1, `First the browser needs the server's IP address: ${dns.length} DNS round trip${dns.length === 1 ? "" : "s"} of ${dns.join(" + ")} = ${dnsTotal} ms before anything else can happen.`);
  }
  // One request–response exchange over an open connection, for `k` objects at once.
  const connect = (k, line, what) => {
    conns += k;
    msg("client", `${k > 1 ? `${k} × ` : ""}SYN`, "SYN", "syn"); step(line, `Open ${k > 1 ? `${k} TCP connections in parallel` : "a TCP connection"} for ${what}: the client sends SYN${k > 1 ? "s" : ""}…`);
    msg("server", `${k > 1 ? `${k} × ` : ""}SYN+ACK`, "SYN", "syn"); step(line, `…and the server answers SYN+ACK. That's 1 RTT spent before any HTTP data moves.`);
  };
  const fetch = (k, line, what, perTx = T(tx)) => {
    msg("client", `${k > 1 ? `${k} × ` : ""}GET`, "GET", "get"); step(line, `The client sends ${k > 1 ? `${k} GET requests` : "a GET"} for ${what}${line.includes(2) || line.includes(3) ? " (riding on the handshake's final ACK)" : ""}.`);
    msg("server", k > 1 ? `${k} objects` : "200 OK", "OK", "resp", half + perTx);
    fetched += what === "the base HTML file" ? 0 : k;
    step(line, `The response${k > 1 ? "s come" : " comes"} back: half an RTT to arrive${perTx ? ` plus ${(perTx * rtt).toFixed(0)} ms to transmit` : ""}.`);
  };
  connect(1, 2, "the base HTML file");
  fetch(1, [3], "the base HTML file");
  if (mode === "np-serial") {
    for (let i = 1; i <= objects; i++) { connect(1, [4, 2], `object ${i}`); fetch(1, [4, 3], `object ${i}`); }
  } else if (mode === "np-parallel") {
    for (let left = objects; left > 0; left -= parallel) {
      const k = Math.min(parallel, left);
      connect(k, [5, 2], `the next ${k} object${k === 1 ? "" : "s"}`);
      fetch(k, [5, 3], `${k} object${k === 1 ? "" : "s"}`);
    }
  } else if (mode === "p-nopipe") {
    for (let i = 1; i <= objects; i++) fetch(1, [6, 7], `object ${i} on the same connection`);
  } else if (objects) {
    msg("client", `${objects} × GET`, "GET", "get"); step([6, 8], `With pipelining the client sends all ${objects} GET requests back to back without waiting for any response.`);
    msg("server", `${objects} objects`, "OK", "resp", half + objects * T(tx)); fetched += objects;
    step([6, 8], `The objects stream back one after another: half an RTT${tx ? ` plus ${objects} × ${tx} ms of transmission` : ""}. One RTT for all ${objects}.`);
  }
  const formula = totalFormula({ mode, objects, rtt, tx, parallel, dnsTotal });
  steps.push({ line: null, done: true, note: `Done: ${formula.text} = ${formula.ms.toFixed(0)} ms.`, vars: { ...steps.at(-1).vars, total: `${formula.ms.toFixed(0)} ms` } });
  return { msgs, steps, spans, tMax: t, total: t * rtt, formula, connections: conns };
}

// The closed-form answer, as an exam would write it.
export function totalFormula({ mode, objects: N, rtt, tx = 0, parallel: P = 5, dnsTotal = 0 }) {
  const base = 2 * rtt + tx;
  const d = dnsTotal ? `${dnsTotal} (DNS) + ` : "";
  const txs = (n) => (tx ? ` + ${n} × ${tx}` : "");
  switch (mode) {
    case "np-serial": return { ms: dnsTotal + (N + 1) * base, rtts: 2 * (N + 1), text: `${d}${N + 1} × 2 RTT${txs(N + 1)}` };
    case "np-parallel": { const b = Math.ceil(N / P); return { ms: dnsTotal + base + b * (2 * rtt) + (N ? b * tx : 0), rtts: 2 + 2 * b, text: `${d}2 RTT + ⌈${N}/${P}⌉ × 2 RTT${txs(1 + b)}` }; }
    case "p-nopipe": return { ms: dnsTotal + base + N * (rtt + tx), rtts: 2 + N, text: `${d}2 RTT + ${N} × 1 RTT${txs(N + 1)}` };
    default: return { ms: dnsTotal + base + (N ? rtt + N * tx : 0), rtts: 2 + (N ? 1 : 0), text: `${d}2 RTT${N ? " + 1 RTT" : ""}${txs(N + 1)}` };
  }
}
