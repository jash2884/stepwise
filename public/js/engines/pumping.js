// The pumping lemma for regular languages, played as a game against an
// adversary. If L is regular, there is a p such that every s ∈ L with |s| ≥ p
// can be split s = xyz with |xy| ≤ p and |y| ≥ 1 so that xyⁱz ∈ L for every
// i ≥ 0. To prove L is NOT regular, you win the game: whatever p the adversary
// picks, you choose s, and for EVERY split the adversary could make, you find
// an i that pumps the string out of L.

const count = (s, c) => [...s].filter((x) => x === c).length;
const rep = (s, n) => s.repeat(Math.max(0, n));
const isPrime = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
const isSquare = (n) => Number.isInteger(Math.sqrt(n));
const nextPrime = (n) => { let k = Math.max(2, n); while (!isPrime(k)) k++; return k; };
const isPal = (s) => s === [...s].reverse().join("");

export const LANGUAGES = {
  anbn: {
    name: "aⁿbⁿ", set: "{ aⁿbⁿ | n ≥ 0 }", regular: false, alphabet: ["a", "b"],
    member: (s) => /^a*b*$/.test(s) && count(s, "a") === count(s, "b"),
    suggest: (p) => [rep("a", p) + rep("b", p), rep("a", p + 1) + rep("b", p + 1)],
    why: "A DFA would have to count the a's with no upper limit, but it only has finitely many states.",
    hint: "Take s = aᵖbᵖ. Since |xy| ≤ p, y is all a's. Pumping changes the number of a's but not the b's.",
  },
  wwr: {
    name: "wwᴿ (even palindromes)", set: "{ wwᴿ | w ∈ {a, b}* }", regular: false, alphabet: ["a", "b"],
    member: (s) => s.length % 2 === 0 && /^[ab]*$/.test(s) && isPal(s),
    suggest: (p) => [rep("a", p) + "bb" + rep("a", p), rep("a", 2 * Math.ceil(p / 2)), rep("ab", Math.ceil(p / 2)) + rep("ba", Math.ceil(p / 2))],
    why: "To check the second half mirrors the first, a machine must remember the whole first half.",
    hint: "Take s = aᵖbbaᵖ. y lies in the first block of a's; pumping unbalances the two sides. (aᵖ⁺ᵖ is a bad choice: it stays a palindrome.)",
  },
  equal: {
    name: "Equal a's and b's", set: "{ w ∈ {a, b}* | #a(w) = #b(w) }", regular: false, alphabet: ["a", "b"],
    member: (s) => /^[ab]*$/.test(s) && count(s, "a") === count(s, "b"),
    suggest: (p) => [rep("a", p) + rep("b", p), rep("ab", Math.ceil(p / 2) + 1), rep("b", p) + rep("a", p)],
    why: "The machine would need to track the difference #a − #b, which can grow without limit.",
    hint: "Take s = aᵖbᵖ again: y is only a's. (abab… is a trap: the adversary picks y = ab and you can't win.)",
  },
  lessthan: {
    name: "0ⁿ1ᵐ with n < m", set: "{ 0ⁿ1ᵐ | n < m }", regular: false, alphabet: ["0", "1"],
    member: (s) => /^0*1*$/.test(s) && count(s, "0") < count(s, "1"),
    suggest: (p) => [rep("0", p) + rep("1", p + 1), "0" + rep("1", p + 1), rep("0", p) + rep("1", 2 * p)],
    why: "Comparing two unbounded counts needs unbounded memory.",
    hint: "Take s = 0ᵖ1ᵖ⁺¹, which only just fits. y is all 0s, so pumping up once (i = 2) makes n ≥ m.",
  },
  squares: {
    name: "a^(n²) (perfect squares)", set: "{ a^(n²) | n ≥ 0 }", regular: false, alphabet: ["a"],
    member: (s) => /^a*$/.test(s) && isSquare(s.length),
    suggest: (p) => [rep("a", p * p), rep("a", (p + 1) * (p + 1))],
    why: "The gaps between squares keep growing, but pumping adds a fixed amount each time.",
    hint: "Take s = a^(p²). With i = 2 the length is p² + |y|, between p² and (p+1)² = p² + 2p + 1, so not a square.",
  },
  primes: {
    name: "a^q, q prime", set: "{ a^q | q is prime }", regular: false, alphabet: ["a"],
    member: (s) => /^a*$/.test(s) && isPrime(s.length),
    suggest: (p) => [rep("a", nextPrime(p)), rep("a", nextPrime(nextPrime(p) + 1))],
    why: "Pumping produces lengths q + (i−1)|y|, an arithmetic progression, and no progression stays prime.",
    hint: "Take s = a^q for a prime q ≥ p. With i = q + 1 the length is q + q|y| = q(1 + |y|): not prime.",
  },
  abstar: {
    name: "(ab)*", set: "{ (ab)ⁿ | n ≥ 0 }", regular: true, alphabet: ["a", "b"], p: 3,
    member: (s) => /^(ab)*$/.test(s),
    suggest: (p) => [rep("ab", Math.ceil(p / 2) + 1), rep("ab", p)],
    why: "It's regular: the regex (ab)* describes it, and a 3-state DFA accepts it.",
    hint: "You can't win: the adversary takes y = ab, and repeating ab any number of times stays in (ab)*.",
  },
  even: {
    name: "Even-length strings", set: "{ w ∈ {a, b}* | |w| is even }", regular: true, alphabet: ["a", "b"], p: 2,
    member: (s) => /^[ab]*$/.test(s) && s.length % 2 === 0,
    suggest: (p) => [rep("ab", p), rep("a", p) + rep("b", p), rep("ba", p)],
    why: "It's regular: a 2-state DFA tracks whether the length so far is even or odd.",
    hint: "You can't win: the adversary picks y as the first two symbols, and adding pairs keeps the length even.",
  },
  astarbstar: {
    name: "a*b*", set: "{ aⁿbᵐ | n, m ≥ 0 }", regular: true, alphabet: ["a", "b"], p: 3,
    member: (s) => /^a*b*$/.test(s),
    suggest: (p) => [rep("a", p) + rep("b", p), rep("b", p + 1)],
    why: "It's regular (the regex is a*b*). It looks like aⁿbⁿ, but nothing has to match.",
    hint: "You can't win: the adversary picks y = a single a (or b), and any number of a's then b's is still in a*b*.",
  },
};

export const GAME_CODE = [
  "adversary: pick the pumping length p ≥ 1",
  "you: pick s ∈ L with |s| ≥ p",
  "adversary: split s = xyz with |xy| ≤ p and |y| ≥ 1",
  "you: pick i ≥ 0",
  "if xyⁱz ∉ L then",
  "  contradiction: L is not regular  // you win",
  "else the adversary survives  // try another i or s",
];

export const pump = ({ x, y, z }, i) => x + y.repeat(i) + z;

// Every legal split of s for pumping length p.
export function splits(s, p) {
  const out = [];
  for (let xl = 0; xl < Math.min(p, s.length); xl++) for (let yl = 1; xl + yl <= Math.min(p, s.length); yl++) out.push({ x: s.slice(0, xl), y: s.slice(xl, xl + yl), z: s.slice(xl + yl) });
  return out;
}

// How far to look for a breaking i: far enough for the prime-length trick.
export const maxI = (s) => Math.max(8, s.length + 2);

// The i's (0 … max) that pump a split out of the language.
export function breakers(lang, split, max = maxI(split.x + split.y + split.z)) {
  const out = [];
  for (let i = 0; i <= max; i++) if (!lang.member(pump(split, i))) out.push(i);
  return out;
}

// The adversary plays to survive: it picks the split that the most values of i
// fail to break (a split that never breaks if there is one), preferring a
// short y near the start.
export function adversary(lang, s, p) {
  let best = null, bestScore = -1;
  const max = maxI(s);
  for (const sp of splits(s, p)) {
    const b = breakers(lang, sp, max), score = max + 1 - b.length;
    if (score > bestScore) { best = { ...sp, breakers: b }; bestScore = score; }
  }
  return best;
}

// For one string: every split and the i's that break it. You win with s only if
// every split breaks.
export function analyse(lang, s, p) {
  const all = splits(s, p).map((sp) => ({ ...sp, breakers: breakers(lang, sp) }));
  return { all, winning: all.every((sp) => sp.breakers.length > 0) };
}

export function validate(lang, s, p) {
  const bad = [...s].find((c) => !lang.alphabet.includes(c));
  if (bad) return `"${bad}" isn't in the alphabet {${lang.alphabet.join(", ")}}.`;
  if (!lang.member(s)) return `"${s || "ε"}" isn't in ${lang.set}. Pick a string in the language.`;
  if (s.length < p) return `"${s}" has length ${s.length}, but it must be at least p = ${p}.`;
  return null;
}

const show = (w) => (w === "" ? "ε" : w);
const shorten = (w) => (w.length > 40 ? `${w.slice(0, 18)}…${w.slice(-18)} (length ${w.length})` : show(w));

// The game so far as steps (one per move), each with its pseudocode line,
// variables and an explanation. Pass s and i as they become known.
export function play(lang, p, s = null, i = null) {
  const steps = [];
  steps.push({ phase: "p", line: 1, vars: { p }, note: `The adversary picks p = ${p}. ${lang.regular ? `(For a regular language, p can be the number of states of a DFA for it.)` : "Your proof must work for any p, so treat it as an unknown number."}` });
  if (s == null) return { steps };
  const err = validate(lang, s, p);
  if (err) { steps.push({ phase: "s", line: 2, vars: { p, s }, bad: true, note: err }); return { steps, error: err }; }
  steps.push({ phase: "s", line: 2, vars: { p, s: shorten(s), "|s|": s.length }, note: `You pick s = ${shorten(s)}: it's in the language and |s| = ${s.length} ≥ p = ${p}.` });
  const sp = adversary(lang, s, p);
  steps.push({ phase: "split", line: 3, vars: { p, s: shorten(s), x: show(sp.x), y: sp.y, z: shorten(sp.z), "|xy|": sp.x.length + sp.y.length, "|y|": sp.y.length },
    note: `The adversary splits s into x = ${show(sp.x)}, y = ${sp.y}, z = ${shorten(sp.z)}. |xy| = ${sp.x.length + sp.y.length} ≤ ${p} and |y| = ${sp.y.length} ≥ 1, so it's allowed. ${sp.breakers.length ? "It chose the split that's hardest to break." : "No value of i breaks this split."}` });
  if (i == null) return { steps, split: sp };
  const w = pump(sp, i), inL = lang.member(w);
  const vars = { p, x: show(sp.x), y: sp.y, z: shorten(sp.z), i, "xyⁱz": shorten(w), "in L": inL };
  steps.push({ phase: "i", line: 4, vars, note: `You pick i = ${i}: ${i === 0 ? "remove y entirely" : i === 1 ? "leave s as it is (i = 1 never helps)" : `repeat y ${i} times`}, giving ${shorten(w)}.` });
  steps.push(inL
    ? { phase: "result", line: [5, 7], vars, bad: true, note: `${shorten(w)} is still in the language, so the adversary survives. ${sp.breakers.length ? `Try another i: ${sp.breakers.length === 1 ? "one value" : "some values"} in 0 … ${maxI(s)} would work.` : lang.regular ? "In fact no i breaks this split: the language is regular, so the adversary can always win." : "No i breaks this split, so this s can't win. Try a different s."}` }
    : { phase: "result", line: [5, 6], vars, good: true, note: `${shorten(w)} is NOT in the language. But the pumping lemma says it should be. ${analyse(lang, s, p).winning ? `And every other split of s breaks too, so this s wins whatever the adversary does: ${lang.name} is not regular.` : "This split broke, but careful: another split of this s survives every i, so a proof needs a better s."}` });
  return { steps, split: sp, pumped: w, inL };
}

// A ready-made proof for the textbook string (the first suggestion).
export function proof(lang, p) {
  const s = lang.suggest(p)[0], { all, winning } = analyse(lang, s, p);
  return { s, winning, all };
}
