// Single-tape Turing machines.
//   start: q0
//   accept: qa
//   q0 a -> q1 X R      (in q0 reading a: write X, move right, go to q1)
// "_" is the blank. Moves are L, R or S (stay). A machine halts when no rule
// applies; it accepts only if it halts in an accepting state.

export const BLANK = "_";

export const CODE = [
  "state ← q0; head ← 0  // on the first input cell",
  "loop",
  "  a ← tape[head]",
  "  if there is no rule for (state, a) then halt",
  "  (p, b, D) ← δ(state, a)",
  "  tape[head] ← b",
  "  head ← head − 1, head + 1 or head  // D = L, R or S",
  "  state ← p",
  "accept iff it halts in an accepting state",
];

export function parseTM(text) {
  let start = null;
  const accept = new Set(), rules = new Map(), states = [], order = [];
  const addState = (q) => { if (!states.includes(q)) states.push(q); };
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    let m = /^start\s*[:=]\s*(\S+)$/i.exec(line);
    if (m) { start = m[1]; addState(start); continue; }
    m = /^(?:accept|final|halt)\s*[:=]\s*(.+)$/i.exec(line);
    if (m) { for (const q of m[1].split(/[\s,]+/).filter(Boolean)) { accept.add(q); addState(q); } continue; }
    const parts = line.replace(/->|→|,|\(|\)/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length !== 5) throw new Error(`Can't read "${line}". Write rules like "q0 a -> q1 X R".`);
    const [q, read, next, write, move0] = parts, move = move0.toUpperCase();
    if ([...read].length !== 1 || [...write].length !== 1) throw new Error(`"${line}": tape symbols are single characters (use _ for blank).`);
    if (!["L", "R", "S", "N"].includes(move)) throw new Error(`"${line}": the move must be L, R or S.`);
    const k = `${q}\u0000${read}`;
    if (rules.has(k)) throw new Error(`Two rules for state ${q} reading ${read}. A Turing machine here must be deterministic.`);
    rules.set(k, { q, read, next, write, move: move === "N" ? "S" : move });
    order.push(k);
    addState(q); addState(next);
  }
  if (!start) throw new Error('Add a start line, e.g. "start: q0".');
  if (states.length > 30) throw new Error("Use at most 30 states.");
  return { start, accept: [...accept], states, rules: order.map((k) => rules.get(k)), rule: (q, a) => rules.get(`${q}\u0000${a}`) };
}

export function runTM(tm, input, { limit = 2000 } = {}) {
  if ([...String(input)].length > 60) throw new Error("Use an input of at most 60 symbols.");
  const tape = new Map([...String(input)].map((c, i) => [i, c === " " ? BLANK : c]));
  let head = 0, state = tm.start, result = null;
  const steps = [];
  const read = (i) => tape.get(i) ?? BLANK;
  const snap = (note, rule = null) => {
    const keys = [...tape.keys()];
    const lo = Math.min(0, head, ...keys), hi = Math.max(head, String(input).length - 1, ...keys);
    steps.push({ state, head, lo, cells: Array.from({ length: hi - lo + 1 }, (_, i) => read(lo + i)), rule, note });
  };
  snap(`Start in ${tm.start} with the head on the first cell.`);
  Object.assign(steps[0], { line: 1, vars: { state, head, a: read(head), moves: 0 } });
  while (!result) {
    const r = tm.rule(state, read(head));
    if (!r) {
      result = tm.accept.includes(state) ? "accept" : "reject";
      steps.at(-1).note += ` No rule for (${state}, ${read(head)}), so the machine halts in ${state}: ${result === "accept" ? "ACCEPTED" : "REJECTED"}.`;
      steps.at(-1).halt = result;
      steps.at(-1).line = [...[steps.at(-1).line].flat(), 3, 4, 9];
      steps.at(-1).vars = { ...steps.at(-1).vars, a: read(head), halted: result === "accept" ? "accept" : "reject" };
      break;
    }
    if (steps.length > limit) { result = "limit"; steps.at(-1).note += ` Stopped after ${limit} moves: the machine may never halt on this input.`; steps.at(-1).halt = "limit"; steps.at(-1).line = 2; break; }
    const was = read(head);
    if (r.write === BLANK) tape.delete(head); else tape.set(head, r.write);
    const from = state;
    head += r.move === "L" ? -1 : r.move === "R" ? 1 : 0;
    state = r.next;
    snap(`In ${from} reading ${was}: write ${r.write}, move ${r.move === "L" ? "left" : r.move === "R" ? "right" : "nowhere"}, go to ${r.next}.`, r);
    Object.assign(steps.at(-1), { line: [3, 5, 6, 7, 8], vars: { state: from, a: was, p: r.next, b: r.write, D: r.move, head, moves: steps.length - 1 } });
    if (tm.accept.includes(state) && !tm.rule(state, read(head))) {
      result = "accept";
      steps.at(-1).note += " That's an accepting state with no further moves: ACCEPTED.";
      steps.at(-1).halt = "accept";
      steps.at(-1).line = [...steps.at(-1).line, 4, 9];
    }
  }
  const out = steps.at(-1).cells.join("").replace(/^_+|_+$/g, "");
  return { steps, result, output: out, moves: steps.length - 1 };
}

export const MACHINES = {
  anbn: {
    name: "aⁿbⁿ (n ≥ 1)", input: "aaabbb",
    about: "Cross off one a (as X) and one matching b (as Y) per round. Accept when only Ys are left.",
    text: "start: q0\naccept: q4\nq0 a -> q1 X R\nq0 Y -> q3 Y R\nq1 a -> q1 a R\nq1 Y -> q1 Y R\nq1 b -> q2 Y L\nq2 a -> q2 a L\nq2 Y -> q2 Y L\nq2 X -> q0 X R\nq3 Y -> q3 Y R\nq3 _ -> q4 _ R",
  },
  anbncn: {
    name: "aⁿbⁿcⁿ (not context-free)", input: "aabbcc",
    about: "Same idea with three letters: no pushdown automaton can do this, but a Turing machine can.",
    text: "start: q0\naccept: q5\nq0 a -> q1 X R\nq0 Y -> q4 Y R\nq1 a -> q1 a R\nq1 Y -> q1 Y R\nq1 b -> q2 Y R\nq2 b -> q2 b R\nq2 Z -> q2 Z R\nq2 c -> q3 Z L\nq3 a -> q3 a L\nq3 b -> q3 b L\nq3 Y -> q3 Y L\nq3 Z -> q3 Z L\nq3 X -> q0 X R\nq4 Y -> q4 Y R\nq4 Z -> q4 Z R\nq4 _ -> q5 _ R",
  },
  increment: {
    name: "Binary increment", input: "1011",
    about: "Run to the right end, then add 1: turn trailing 1s into 0s until a 0 (or a blank) becomes 1.",
    text: "start: right\naccept: done\nright 0 -> right 0 R\nright 1 -> right 1 R\nright _ -> carry _ L\ncarry 1 -> carry 0 L\ncarry 0 -> done 1 L\ncarry _ -> done 1 L",
  },
  palindrome: {
    name: "Palindromes over {a, b}", input: "abba",
    about: "Erase the first symbol, remember it in the state, run to the end and check the last symbol matches.",
    text: "start: q0\naccept: yes\nq0 a -> qa _ R\nq0 b -> qb _ R\nq0 _ -> yes _ R\nqa a -> qa a R\nqa b -> qa b R\nqa _ -> qa2 _ L\nqa2 a -> back _ L\nqa2 _ -> yes _ R\nqb a -> qb a R\nqb b -> qb b R\nqb _ -> qb2 _ L\nqb2 b -> back _ L\nqb2 _ -> yes _ R\nback a -> back a L\nback b -> back b L\nback _ -> q0 _ R",
  },
  add: {
    name: "Unary addition", input: "111+11",
    about: "1s in unary: turn + into 1, then erase the last 1. 3 + 2 = 5.",
    text: "start: q0\naccept: q3\nq0 1 -> q0 1 R\nq0 + -> q1 1 R\nq1 1 -> q1 1 R\nq1 _ -> q2 _ L\nq2 1 -> q3 _ L",
  },
  busy: {
    name: "3-state busy beaver", input: "",
    about: "On a blank tape it writes six 1s in 14 moves (counting the halting one): the most any 3-state, 2-symbol machine can write.",
    text: "start: A\naccept: H\nA _ -> B 1 R\nA 1 -> H 1 R\nB _ -> C _ R\nB 1 -> B 1 R\nC _ -> C 1 L\nC 1 -> A 1 L",
  },
};
