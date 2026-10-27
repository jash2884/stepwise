import assert from "node:assert/strict";
import { test } from "node:test";
import { adversary, analyse, GAME_CODE, LANGUAGES, play, pump, splits, validate } from "../public/js/engines/pumping.js";

const L = LANGUAGES;
const strings = (alphabet, n) => { const out = [""]; for (let k = 0; k < out.length; k++) if (out[k].length < n) for (const a of alphabet) out.push(out[k] + a); return out; };

test("membership predicates", () => {
  assert.ok(L.anbn.member("") && L.anbn.member("aabb") && !L.anbn.member("abab") && !L.anbn.member("aab"));
  assert.ok(L.wwr.member("abba") && L.wwr.member("") && !L.wwr.member("aba") && !L.wwr.member("ab"));
  assert.ok(L.equal.member("abba") && L.equal.member("baab") && !L.equal.member("aab"));
  assert.ok(L.lessthan.member("011") && L.lessthan.member("1") && !L.lessthan.member("01") && !L.lessthan.member("101"));
  assert.ok(L.squares.member("") && L.squares.member("a") && L.squares.member("aaaa") && !L.squares.member("aa"));
  assert.ok(L.primes.member("aa") && L.primes.member("aaaaa") && !L.primes.member("aaaa") && !L.primes.member("a"));
  assert.ok(L.abstar.member("abab") && !L.abstar.member("aba"));
  assert.ok(L.even.member("ab") && !L.even.member("aba"));
  assert.ok(L.astarbstar.member("aabbb") && !L.astarbstar.member("aba"));
});

test("suggested strings are valid moves, and the adversary always picks a legal split", () => {
  for (const lang of Object.values(L)) for (let p = lang.p ?? 1; p <= (lang.p ?? 1) + 5; p++) for (const s of lang.suggest(p)) {
    assert.equal(validate(lang, s, p), null, `${lang.name} p=${p} ${s}`);
    const sp = adversary(lang, s, p);
    assert.equal(sp.x + sp.y + sp.z, s);
    assert.ok(sp.x.length + sp.y.length <= p && sp.y.length >= 1);
  }
  assert.ok(splits("aaaa", 2).every((sp) => sp.x.length + sp.y.length <= 2 && sp.y.length >= 1));
  assert.equal(splits("aaaa", 2).length, 3); // (ε,a) (ε,aa) (a,a)
});

// For a regular language the lemma holds: the adversary always has a split that
// survives every i. Checked for every string in L of length p … 9.
test("regular languages: the adversary's split pumps for every i in 0 … 4", () => {
  for (const lang of Object.values(L).filter((l) => l.regular)) {
    for (const s of strings(lang.alphabet, 9).filter((w) => w.length >= lang.p && lang.member(w))) {
      const sp = adversary(lang, s, lang.p);
      for (let i = 0; i <= 4; i++) assert.ok(lang.member(pump(sp, i)), `${lang.name}: ${s} with i=${i}`);
      assert.equal(analyse(lang, s, lang.p).winning, false);
    }
  }
});

// Sipser Examples 1.73 (0ⁿ1ⁿ), 1.74 (equal 0s and 1s), 1.75 (ww), 1.76 (1^(n²));
// HMU Example 4.3 (primes). The textbook string wins for every p.
test("non-regular languages: the textbook string beats every split, for every p", () => {
  for (const lang of Object.values(L).filter((l) => !l.regular)) for (let p = 1; p <= 7; p++) {
    const s = lang.suggest(p)[0];
    const { all, winning } = analyse(lang, s, p);
    assert.ok(winning, `${lang.name} p=${p} s=${s}`);
    for (const sp of all) assert.ok(!lang.member(pump(sp, sp.breakers[0])));
  }
  // The classic traps: (ab)… for equal counts, aᵐ for palindromes.
  assert.equal(analyse(L.equal, "ababab", 4).winning, false);
  assert.equal(analyse(L.wwr, "aaaa", 4).winning, false);
  // a^q with q prime: i = q + 1 always breaks it.
  for (const sp of splits("aaaaa", 5)) assert.ok(!L.primes.member(pump(sp, 6)));
});

test("play() follows the proof template with lines, variables and notes", () => {
  const g = play(L.anbn, 3, "aaabbb", 2);
  assert.deepEqual(g.steps.map((s) => s.phase), ["p", "s", "split", "i", "result"]);
  for (const s of g.steps) {
    for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= GAME_CODE.length);
    assert.ok(s.vars && s.note.length > 10);
  }
  assert.equal(g.inL, false);
  assert.ok(g.steps.at(-1).good);
  assert.equal(play(L.anbn, 3, "ab").error.includes("at least p"), true);
  assert.equal(play(L.anbn, 3, "abab").error.includes("isn't in"), true);
  assert.equal(play(L.abstar, 3, "abab", 0).inL, true);
});
