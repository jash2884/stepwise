// Databases misconceptions: keys and normal forms, serialisability, hashing
// and join cost.
import { candidateKeys, closure, normalForm } from "../../engines/fd.js";
import { analyse } from "../../engines/schedules.js";
import { hashTable } from "../../engines/hashing.js";
import { define, firstDiff, opt, optSet } from "./kit.js";

// --- Keys and normal forms -----------------------------------------------------------

const FORMS = ["1NF", "2NF", "3NF", "BCNF"];
const nfOf = (g) => normalForm(g.attrs, g.fds).form;
function superkeyCount(g) {
  const letters = g.attrs.split("");
  let n = 0;
  for (let m = 1; m < 1 << letters.length; m++) {
    const x = letters.filter((_, i) => m >> i & 1).join("");
    if (closure(x, g.fds).closure === g.attrs) n++;
  }
  return n;
}
const normalization = define("normalization", [
  {
    id: "3nf-is-bcnf",
    label: "took a relation in 3NF to be in BCNF",
    predict: (q) => (q.given.variant === "nf" && nfOf(q.given) === "3NF" ? 3 : null),
    explain: () => "BCNF needs every non-trivial dependency X → A to have a superkey on the left. 3NF also allows X → A when A is a prime attribute (part of some candidate key), so a relation can be in 3NF without being in BCNF.",
  },
  {
    id: "forgot-prime-exception",
    label: "forgot that 3NF allows X → A when A is a prime attribute",
    predict: (q) => (q.given.variant === "nf" && nfOf(q.given) === "3NF" ? 1 : null),
    explain: (q) => `3NF is broken only by X → A where X is not a superkey and A is not prime. Here the dependency that isn't from a superkey has a prime attribute on the right (candidate keys: ${candidateKeys(q.given.attrs, q.given.fds).keys.join(", ")}), so R is in 3NF.`,
  },
  {
    id: "stopped-at-one-key",
    label: "stopped after finding one candidate key",
    predict: (q) => (q.given.variant === "count" && q.answer > 1 ? 1 : null),
    explain: (q) => `There can be several candidate keys: try every attribute set that could still determine everything, not just the first one that works. R has ${q.answer}: ${candidateKeys(q.given.attrs, q.given.fds).keys.join(", ")}.`,
  },
  {
    id: "counted-superkeys",
    label: "counted every superkey, not just the minimal ones",
    predict: (q) => (q.given.variant === "count" ? superkeyCount(q.given) : null),
    explain: (q) => `A candidate key is a minimal superkey: no attribute can be removed. R has ${q.given.variant === "count" ? superkeyCount(q.given) : 0} superkeys but only ${q.answer} candidate key${q.answer === 1 ? "" : "s"}.`,
  },
  {
    id: "superkey-is-key",
    label: "picked superkeys that aren't minimal",
    predict: (q) => (q.given.variant === "which" ? optSet(q, (o) => closure(o, q.given.fds).closure === q.given.attrs) : null),
    explain: () => "A set whose closure is every attribute is a superkey. It is a candidate key only if no smaller part of it is a superkey too: check each one with an attribute removed.",
  },
]);

// --- Serialisability ---------------------------------------------------------------------

const T = (t) => `T${t}`;
function topoOrders(res) {
  const out = [];
  const go = (rest, acc) => {
    if (!rest.length) { out.push(acc); return; }
    for (const t of rest) if (res.edges.every((e) => e.to !== t || acc.includes(e.from))) go(rest.filter((x) => x !== t), [...acc, t]);
  };
  go(res.txns, []);
  return out;
}
const serializability = define("serializability", [
  {
    id: "counted-pairs",
    label: "counted every conflicting pair instead of distinct edges",
    predict: (q) => (q.given.variant === "edges" ? analyse(q.given.text).pairs.length : null),
    explain: (q) => `Several conflicting pairs can give the same edge Ti → Tj; the precedence graph has each edge once. There are ${analyse(q.given.text).pairs.length} pairs but ${q.answer} distinct edges.`,
  },
  {
    id: "view-is-conflict",
    label: "took view serialisable to mean the same as conflict serialisable",
    predict: (q) => {
      if (q.given.variant !== "msq") return null;
      const r = analyse(q.given.text);
      if (r.viewSerializable === r.conflictSerializable) return null;
      const truth = [r.conflictSerializable, r.conflictSerializable, r.recovery.recoverable, r.recovery.cascadeless];
      const set = truth.map((x, i) => (x ? i : null)).filter((i) => i !== null);
      return set.length ? set : null;
    },
    explain: () => "Every conflict serialisable schedule is view serialisable, but not the other way round: a schedule with blind writes can be view equivalent to a serial order even when its precedence graph has a cycle.",
  },
  {
    id: "recoverable-is-cascadeless",
    label: "treated recoverable and cascadeless as the same",
    predict: (q) => {
      if (q.given.variant !== "msq") return null;
      const r = analyse(q.given.text);
      if (r.recovery.recoverable === r.recovery.cascadeless) return null;
      const truth = [r.conflictSerializable, r.viewSerializable, r.recovery.recoverable, r.recovery.recoverable];
      const set = truth.map((x, i) => (x ? i : null)).filter((i) => i !== null);
      return set.length ? set : null;
    },
    explain: () => "Recoverable: a transaction commits only after every transaction it read from has committed. Cascadeless is stricter: it reads only values that are already committed. A schedule can be recoverable but not cascadeless.",
  },
  {
    id: "edges-backwards",
    label: "drew the precedence graph's edges backwards",
    predict: (q) => {
      if (q.given.variant !== "order") return null;
      const orders = topoOrders(analyse(q.given.text));
      return orders.length === 1 ? opt(q, [...orders[0]].reverse().map(T).join(" → ")) : null;
    },
    explain: () => "An edge Ti → Tj means an operation of Ti conflicts with a later one of Tj, so Ti must come first in the serial order. Reversing the edges reverses the order.",
  },
]);

// --- Hashing ------------------------------------------------------------------------------

const slotOf = (g, strategy) => hashTable(g.keys, g.m, strategy).steps.find((s) => s.key === g.target)?.slot ?? null;
function hashStep(g, strategy) {
  const a = hashTable(g.keys, g.m, g.strategy).trace, b = hashTable(g.keys, g.m, strategy).trace;
  const i = firstDiff(a, b, (x, y) => x.key === y.key && JSON.stringify(x.probes) === JSON.stringify(y.probes));
  return i >= 0 ? i + 1 : null;
}
const hashing = define("hashing", [
  {
    id: "linear-for-quadratic",
    label: "probed the next slot (linear) instead of jumping by i²",
    predict: (q) => (q.given.strategy === "quadratic" && q.given.target != null ? slotOf(q.given, "linear") : null),
    explain: (q) => `Quadratic probing tries h(k), h(k) + 1, h(k) + 4, h(k) + 9 and so on (mod ${q.given.m}), not consecutive slots. Probing linearly puts ${q.given.target} in slot ${slotOf(q.given, "linear")}; quadratic probing puts it in slot ${q.answer}.`,
    step: (q) => (q.given.strategy === "quadratic" ? hashStep(q.given, "linear") : null),
  },
  {
    id: "quadratic-for-linear",
    label: "jumped by i² instead of probing the next slot",
    predict: (q) => (q.given.strategy === "linear" && q.given.target != null ? slotOf(q.given, "quadratic") : null),
    explain: (q) => `Linear probing tries h(k), h(k) + 1, h(k) + 2 and so on, one slot at a time (mod ${q.given.m}). Here ${q.given.target} ends up in slot ${q.answer}.`,
    step: (q) => (q.given.strategy === "linear" ? hashStep(q.given, "quadratic") : null),
  },
  {
    id: "home-slot",
    label: "put the key in its home slot, ignoring the collision",
    predict: (q) => (q.given.target != null ? q.given.target % q.given.m : null),
    explain: (q) => `${q.given.target} mod ${q.given.m} = ${q.given.target % q.given.m}, but that slot is already taken when ${q.given.target} arrives, so it has to probe on. It lands in slot ${q.answer}.`,
  },
  {
    id: "counted-collisions",
    label: "counted the collisions in the chain rather than its keys",
    predict: (q) => (q.given.strategy === "chaining" ? q.answer - 1 : null),
    explain: (q) => `The longest chain holds ${q.answer} keys: the first one plus ${q.answer - 1} that collided with it. Its length is the number of keys.`,
  },
]);

// --- Join cost ------------------------------------------------------------------------------

const joins = define("sql-joins", [
  {
    id: "forgot-outer-read",
    label: "forgot to count reading the outer relation once",
    predict: (q) => q.answer - q.given.br,
    explain: (q) => `Every nested-loop join reads all of r once (${q.given.br} blocks) on top of the passes over s. That makes ${q.answer}, not ${q.answer - q.given.br}.`,
  },
  {
    id: "tuple-loop-as-block",
    label: "costed a tuple-at-a-time loop as a block loop",
    predict: (q) => (q.given.variant === "nlj" ? q.given.br * q.given.bs + q.given.br : null),
    explain: (q) => `In a tuple-at-a-time nested loop, s is scanned once for every tuple of r: ${q.given.nr} × ${q.given.bs} + ${q.given.br}. Scanning it once per block of r (${q.given.br} × ${q.given.bs} + ${q.given.br}) is the block nested-loop join.`,
  },
  {
    id: "buffer-m",
    label: "gave all M buffer blocks to the outer relation",
    predict: (q) => (q.given.variant === "bnlj-m" ? Math.ceil(q.given.br / q.given.M) * q.given.bs + q.given.br : null),
    explain: (q) => `Of the ${q.given.M} buffer blocks, one holds the current block of s and one the output, so r is read in chunks of M − 2 = ${q.given.M - 2} blocks: ⌈${q.given.br} / ${q.given.M - 2}⌉ passes over s.`,
  },
  {
    id: "buffer-m-minus-1",
    label: "kept a block for s but none for the output",
    predict: (q) => (q.given.variant === "bnlj-m" ? Math.ceil(q.given.br / (q.given.M - 1)) * q.given.bs + q.given.br : null),
    explain: (q) => `The textbook formula keeps one block for s and one for the output, so r is read in chunks of M − 2 = ${q.given.M - 2} blocks, not M − 1.`,
  },
  {
    id: "swapped-outer",
    label: "used s as the outer relation",
    predict: (q) => {
      const { variant, nr, br, ns, bs, M } = q.given;
      return variant === "nlj" ? ns * br + bs : variant === "bnlj" ? bs * br + bs : Math.ceil(bs / (M - 2)) * br + bs;
    },
    explain: () => "The question fixes r as the outer relation. The cost depends on which one is outer, so swapping them changes the answer.",
  },
]);

export const DBMS = [...normalization, ...serializability, ...hashing, ...joins];
