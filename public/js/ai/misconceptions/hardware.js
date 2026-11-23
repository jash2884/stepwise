// Digital logic and computer organisation misconceptions: number systems,
// K-maps, cache mapping, pipelining and IEEE 754.
import { addTwos, convert, decode, represent } from "../../engines/numbers.js";
import { minimise } from "../../engines/kmap.js";
import { amat, geometry, simulate } from "../../engines/cache.js";
import { parseProgram, schedule, timing } from "../../engines/pipeline.js";
import { decode as fpDecode, encode, spec, toHex } from "../../engines/ieee754.js";
import { define, num, opt, optSet, round2 } from "./kit.js";

// --- Number systems -------------------------------------------------------------------------

const toDecimal = (x, base) => Number(convert(x, base, 10).result);
const SCHEME = { twos: "2's complement", sm: "signed magnitude", ones: "1's complement" };
const numbers = define("number-systems", [
  {
    id: "digits-reversed",
    label: "gave the digits the wrong place values (read right to left)",
    predict: (q) => {
      const g = q.given;
      if (g.variant !== "convert" || g.to !== 10 || g.x.includes(".") || g.x.length < 2) return null;
      try { return toDecimal([...g.x].reverse().join(""), g.from); } catch { return null; }
    },
    explain: (q) => `The rightmost digit has place value ${q.given.from}⁰ = 1, the next ${q.given.from}¹ and so on leftwards. (${q.given.x}) in base ${q.given.from} is ${num(q.answer)}.`,
  },
  {
    id: "weights-from-one",
    label: "started the place values at the base instead of 1",
    predict: (q) => {
      const g = q.given;
      return g.variant === "convert" && g.to === 10 && !g.x.includes(".") ? q.answer * g.from : null;
    },
    explain: (q) => `The units digit is worth ${q.given.from}⁰ = 1, not ${q.given.from}. Starting at ${q.given.from}¹ multiplies the whole value by ${q.given.from}.`,
  },
  {
    id: "twos-symmetric",
    label: "took the 2's complement range to be symmetric",
    predict: (q) => (q.given.variant === "range" && q.given.scheme === "twos" && q.given.ask === "min" ? -(2 ** (q.given.bits - 1) - 1) : null),
    explain: (q) => `2's complement has one zero, so the extra pattern 1 followed by zeros is −2^${q.given.bits - 1} = ${q.answer}. The range is ${q.answer} to ${2 ** (q.given.bits - 1) - 1}.`,
  },
  {
    id: "count-zero-twice",
    label: "counted two zeros in 2's complement",
    predict: (q) => (q.given.variant === "range" && q.given.scheme === "twos" && q.given.ask === "count" ? 2 ** q.given.bits - 1 : null),
    explain: (q) => `Only signed magnitude and 1's complement have a +0 and a −0. In 2's complement all 2^${q.given.bits} patterns are different values: ${q.answer}.`,
  },
  {
    id: "forgot-negative-zero",
    label: "forgot that +0 and −0 are two patterns for one value",
    predict: (q) => (q.given.variant === "range" && q.given.scheme !== "twos" && q.given.ask === "count" ? 2 ** q.given.bits : null),
    explain: (q) => `${SCHEME[q.given.scheme]} has two patterns for zero, so ${q.given.bits} bits hold 2^${q.given.bits} − 1 = ${q.answer} distinct values.`,
  },
  {
    id: "unsigned-range",
    label: "used the unsigned range",
    predict: (q) => (q.given.variant === "range" && q.given.ask === "max" ? 2 ** q.given.bits - 1 : q.given.variant === "range" && q.given.ask === "min" ? 0 : null),
    explain: (q) => `One bit is the sign, so only ${q.given.bits - 1} bits are left for the magnitude: the largest value is 2^${q.given.bits - 1} − 1 = ${2 ** (q.given.bits - 1) - 1}.`,
  },
  {
    id: "carry-out-is-overflow",
    label: "took a carry out of the sign bit to mean overflow",
    predict: (q) => (q.given.variant === "overflow" ? optSet(q, (_, i) => !!addTwos(q.given.pairs[i].a, q.given.pairs[i].b, q.given.bits).carryOut) : null),
    explain: () => "In 2's complement a carry out of the sign bit is normal and is dropped. Overflow is when the carry into the sign bit differs from the carry out, which happens when two numbers of the same sign give a result of the other sign.",
  },
  {
    id: "ones-for-twos",
    label: "flipped the bits but didn't add 1",
    predict: (q) => (q.given.variant === "twos" ? opt(q, represent(q.given.v, q.given.bits).ones) : null),
    explain: (q) => `Flipping every bit gives the 1's complement. 2's complement adds 1 to that: ${represent(q.given.v, q.given.bits).twos}.`,
  },
  {
    id: "sign-magnitude-for-twos",
    label: "set the sign bit and kept the magnitude (signed magnitude)",
    predict: (q) => (q.given.variant === "twos" ? opt(q, represent(q.given.v, q.given.bits).sm) : null),
    explain: () => "Putting a 1 in front of the magnitude is signed magnitude. For 2's complement, write the positive value, flip every bit and add 1.",
  },
  {
    id: "read-as-unsigned",
    label: "read the pattern as an unsigned number",
    predict: (q) => (q.given.variant === "decode" ? parseInt(q.given.pat, 2) : null),
    explain: (q) => `The leading 1 is a sign bit in ${SCHEME[q.given.scheme]}, so the value is negative: ${q.answer}.`,
  },
  {
    id: "wrong-scheme",
    label: "decoded it with the wrong signed scheme",
    predict: (q) => (q.given.variant === "decode" ? decode(q.given.pat, q.given.scheme === "twos" ? "sm" : "twos") : null),
    explain: () => "Signed magnitude: the rest is the magnitude. 1's complement: flip every bit to get the magnitude. 2's complement: the sign bit is worth −2^(n − 1) and the rest add on as usual.",
  },
]);

// --- K-maps -------------------------------------------------------------------------------

const min = (g, dcs = g.dcs) => minimise(g.n, g.ones, dcs);
const kmap = define("k-map", [
  {
    id: "ignored-dont-cares",
    label: "didn't use the don't-cares",
    predict: (q) => (q.given.variant === "literals" && q.given.dcs.length ? min(q.given, []).literals : null),
    explain: () => "A don't-care can be taken as 1 when that makes a bigger group, so use them to make groups larger (fewer literals). You never have to cover them.",
  },
  {
    id: "counted-terms",
    label: "counted the terms instead of the literals",
    predict: (q) => (q.given.variant === "literals" ? min(q.given).chosen.length : null),
    explain: (q) => `A literal is each appearance of a variable, complemented or not. The minimal SOP ${min(q.given).expr} has ${min(q.given).chosen.length} terms and ${q.answer} literals.`,
  },
  {
    id: "pi-as-epi",
    label: "counted only the essential prime implicants",
    predict: (q) => (q.given.variant === "pi" ? min(q.given).essential.length : null),
    explain: (q) => `Every group that can't be made any bigger is a prime implicant (${min(q.given).primes.length} here). The essential ones (${min(q.given).essential.length}) are only those that cover some minterm nothing else covers.`,
  },
  {
    id: "pi-as-cover",
    label: "counted the implicants in the minimal cover instead of all prime implicants",
    predict: (q) => (q.given.variant === "pi" ? min(q.given).chosen.length : q.given.variant === "epi" ? min(q.given).chosen.length : null),
    explain: (q) => `The minimal SOP uses ${min(q.given).chosen.length} implicants, but that is a choice among the ${min(q.given).primes.length} prime implicants, of which ${min(q.given).essential.length} are essential.`,
  },
  {
    id: "epi-as-pi",
    label: "counted every prime implicant as essential",
    predict: (q) => (q.given.variant === "epi" ? min(q.given).primes.length : null),
    explain: (q) => `A prime implicant is essential only if it covers a minterm that no other prime implicant covers. Of the ${min(q.given).primes.length} prime implicants, ${q.answer} are.`,
  },
]);

// --- Cache mapping ----------------------------------------------------------------------------

const bitsAnswer = (g, geo) => (g.ask === "tag" ? geo.tagBits : g.ask === "index" ? geo.indexBits : geo.lines * (geo.tagBits + 2));
const asDirect = (g) => geometry({ addressBits: g.addressBits, blockSize: g.blockSize, cacheSize: g.cacheSize, mapping: "direct" });
const traceOf = (g, cfg = g.cfg) => {
  const res = simulate(g.refs.map((addr) => ({ addr, write: false })), cfg);
  return g.ask === "misses" ? res.misses : g.ask === "hits" ? res.hits : round2(res.hitRatio);
};
const cache = define("cache-mapping", [
  {
    id: "index-from-lines",
    label: "took the set index from the number of lines, not sets",
    predict: (q) => (q.given.kind === "bits" && q.given.mapping === "set" ? bitsAnswer(q.given, asDirect(q.given)) : null),
    explain: (q) => `In a ${q.given.ways}-way cache the lines are grouped into sets of ${q.given.ways}, so the index picks one of lines ÷ ${q.given.ways} sets: ${Math.log2(q.given.ways)} fewer index bits than a direct-mapped cache, and ${Math.log2(q.given.ways)} more tag bits.`,
  },
  {
    id: "full-has-index",
    label: "gave a fully associative cache an index field",
    predict: (q) => (q.given.kind === "bits" && q.given.mapping === "full" ? bitsAnswer(q.given, asDirect(q.given)) : null),
    explain: () => "A fully associative cache is one set: a block can go in any line, so there are no index bits and everything except the offset is tag.",
  },
  {
    id: "directory-tag-only",
    label: "counted only the tag bits per line",
    predict: (q) => (q.given.kind === "bits" && q.given.ask === "dir" ? q.answer - 2 * (q.given.cacheSize / q.given.blockSize) : null),
    explain: (q) => `Each of the ${q.given.cacheSize / q.given.blockSize} lines also stores its valid and dirty bits, so add 2 bits per line.`,
  },
  {
    id: "policy-swapped",
    label: "replaced blocks with the other policy (LRU and FIFO mixed up)",
    predict: (q) => (q.given.kind === "trace" && q.given.cfg.mapping !== "direct" ? traceOf(q.given, { ...q.given.cfg, policy: q.given.cfg.policy === "lru" ? "fifo" : "lru" }) : null),
    explain: (q) => (q.given.cfg?.policy === "lru" ? "LRU evicts the block used longest ago; a hit refreshes it. FIFO evicts the block loaded earliest, and hits don't change that." : "FIFO evicts the block that was loaded earliest, even if it was just used. LRU would keep a recently used block."),
  },
  {
    id: "hits-misses-swapped",
    label: "counted hits when the question asked for misses, or the other way round",
    predict: (q) => (q.given.kind !== "trace" ? null : q.given.ask === "ratio" ? round2(1 - q.answer) : q.given.refs.length - q.answer),
    explain: (q) => `There are ${q.given.refs?.length ?? 0} references; every one is either a hit or a miss. Check which of the two the question asks for.`,
  },
  {
    id: "hierarchical-as-simultaneous",
    label: "charged a miss only the next level's time (simultaneous access)",
    predict: (q) => (q.given.kind === "amat" && q.given.mode === "hier" ? round2(amat(q.given.levels, q.given.mem, "simul").value) : null),
    explain: () => "With hierarchical access a miss has already spent the time looking in the faster level, so the next level's time is added on top: T = t1 + (1 − h1)(t2 + …).",
  },
  {
    id: "simultaneous-as-hierarchical",
    label: "added the cache's time to every miss (hierarchical access)",
    predict: (q) => (q.given.kind === "amat" && q.given.mode === "simul" ? round2(amat(q.given.levels, q.given.mem, "hier").value) : null),
    explain: () => "With simultaneous access every level is searched at once, so an access costs only the time of the level that satisfies it: T = h1·t1 + (1 − h1)h2·t2 + … .",
  },
]);

// --- Pipelining ----------------------------------------------------------------------------------

const pipe = (g, forwarding = g.forwarding) => schedule(parseProgram(g.program.join("\n")), { forwarding });
const speed = (g, t) => (g.ask === "speedup" ? round2(t.speedup) : t.pipelined);
const pipelining = define("pipelining", [
  {
    id: "forwarding-flipped",
    label: "worked the stalls out as if forwarding were the other way round",
    predict: (q) => {
      if (q.given.kind !== "cycles") return null;
      const r = pipe(q.given, !q.given.forwarding);
      return q.given.ask === "total" ? r.total : r.stallCycles;
    },
    explain: (q) => (q.given.forwarding ? "With forwarding an ALU result reaches the next instruction's EX straight away, so only a load followed by its use stalls (one cycle)." : "Without forwarding a value can be read only after it is written back (in the first half of WB), so a dependent instruction stalls until then."),
  },
  {
    id: "no-fill-cycles",
    label: "left out the cycles to fill the pipeline",
    predict: (q) => (q.given.kind === "cycles" && q.given.ask === "total" ? pipe(q.given).n + pipe(q.given).stallCycles : null),
    explain: (q) => `The first instruction takes 5 cycles to get through; each later one finishes a cycle after the one before. So n instructions need n + 4 cycles plus stalls: ${q.answer}.`,
  },
  {
    id: "ignored-stalls",
    label: "counted the ideal cycles without the stalls",
    predict: (q) => (q.given.kind === "cycles" && q.given.ask === "total" ? pipe(q.given).ideal : null),
    explain: (q) => `${pipe(q.given).ideal} is the time with no hazards; the dependences here add ${pipe(q.given).stallCycles} stall cycle${pipe(q.given).stallCycles === 1 ? "" : "s"}.`,
  },
  {
    id: "ignored-latch",
    label: "left the pipeline register delay out of the clock period",
    predict: (q) => (q.given.kind === "speedup" && q.given.latch > 0 ? speed(q.given, timing(q.given.d, 0, q.given.n)) : null),
    explain: (q) => (q.given.kind === "speedup" ? `Every stage ends in a pipeline register, so the clock period is the slowest stage plus the register delay: ${Math.max(...q.given.d)} + ${q.given.latch} = ${Math.max(...q.given.d) + q.given.latch} ps.` : ""),
  },
  {
    id: "no-pipeline-fill",
    label: "timed the pipeline as one cycle per instruction, without filling it",
    predict: (q) => {
      const g = q.given;
      if (g.kind !== "speedup") return null;
      return speed(g, timing(g.d, g.latch, g.n, g.n));
    },
    explain: (q) => `The first instruction needs all 5 stages, so n instructions take 5 + n − 1 = ${q.given.n + 4} cycles, not ${q.given.n}.`,
  },
  {
    id: "speedup-is-stages",
    label: "took the speedup to be the number of stages",
    predict: (q) => (q.given.kind === "speedup" && q.given.ask === "speedup" ? 5 : null),
    explain: () => "A 5-stage pipeline approaches a speedup of 5 only for very many instructions with perfectly balanced stages and no register delay. Unequal stages, the register delay and the fill time all cut it.",
  },
]);

// --- IEEE 754 ------------------------------------------------------------------------------------

const fp = (g) => { const S = spec(g.fmt), e = encode(g.value, g.fmt); return { S, e }; };
const hex = (bits, S) => `0x${toHex(bits, S)}`;
const ieee = define("ieee-754", [
  {
    id: "bias-power-of-two",
    label: "used a bias of 2^(k − 1) instead of 2^(k − 1) − 1",
    predict: (q) => {
      const { S, e } = fp(q.given);
      if (q.given.kind === "exponent") return e.E + 2 ** (S.e - 1);
      if (q.given.kind === "value") return q.answer / 2;
      return opt(q, hex(e.bits + (1n << BigInt(S.m)), S));
    },
    explain: (q) => { const { S } = fp(q.given); return `With a ${S.e}-bit exponent the bias is 2^${S.e - 1} − 1 = ${S.bias}, not ${2 ** (S.e - 1)}.`; },
  },
  {
    id: "single-bias-for-half",
    label: "used the single precision bias (127) for half precision",
    predict: (q) => (q.given.kind === "exponent" && q.given.fmt === "half" ? fp(q.given).e.E + 127 : null),
    explain: () => "Half precision has a 5-bit exponent, so its bias is 2⁴ − 1 = 15. 127 is the bias for single precision's 8-bit exponent.",
  },
  {
    id: "unbiased-exponent",
    label: "gave the true exponent without adding the bias",
    predict: (q) => (q.given.kind === "exponent" ? fp(q.given).e.E : null),
    explain: (q) => { const { S, e } = fp(q.given); return `The field stores the exponent plus the bias: ${e.E} + ${S.bias} = ${e.E + S.bias}.`; },
  },
  {
    id: "no-hidden-one",
    label: "left out the hidden leading 1",
    predict: (q) => {
      if (q.given.kind !== "value") return null;
      const { e } = fp(q.given), v = Number(fpDecode(e.bits, q.given.fmt).value);
      return Math.sign(v) * (Math.abs(v) - 2 ** e.E);
    },
    explain: () => "A normal number is 1.fraction × 2^exponent: the leading 1 isn't stored but is always there. Without it the value is too small by 2^exponent.",
  },
]);

export const HARDWARE = [...numbers, ...kmap, ...cache, ...pipelining, ...ieee];
