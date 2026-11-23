// Quantitative aptitude: a generator and solver for the standard question
// types, with every step worked. Each topic has variants; a variant knows its
// formulas (shown as the "code"), how to make random inputs, the question text,
// and how to solve it step by step. Exact fractions are used wherever the
// answer is rational, so 20/3 days is shown as 20/3 and as 6.67.
import { Fraction, F } from "./fraction.js";

const rint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, list) => list[Math.floor(r() * list.length)];
export const fmt = (x, d = 2) => {
  const v = typeof x === "number" ? x : x.toNumber();
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)).replace("-", "−");
  return Number(v.toFixed(d)).toString().replace("-", "−");
};
// "20/3 ≈ 6.67" for fractions, plain for integers.
const ex = (f) => (f.isInteger() ? f.toString() : `${f} ≈ ${fmt(f)}`);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Result helper: numeric answers carry an exact Fraction where possible.
const num = (f, unit = "") => ({ answer: Fraction.from(f).toNumber(), exact: Fraction.from(f), display: `${ex(Fraction.from(f))}${unit ? ` ${unit}` : ""}`, unit });

export const TOPICS = {
  percent: {
    name: "Percentages",
    variants: {
      successive: {
        name: "Successive changes",
        params: [["p", "first change %", 20], ["q", "second change %", -10]],
        code: ["net % = p + q + p·q/100  // successive changes compound", "positive = overall increase, negative = decrease"],
        random: (r) => ({ p: pick(r, [10, 20, 25, 30, 40, 50]), q: -pick(r, [10, 20, 25, 30, 40]) }),
        text: ({ p, q }) => `A price is ${p >= 0 ? "increased" : "decreased"} by ${Math.abs(p)}% and then ${q >= 0 ? "increased" : "decreased"} by ${Math.abs(q)}%. What is the net percentage change? (Use a negative number for a decrease.)`,
        solve: ({ p, q }) => {
          const net = F(p).add(F(q)).add(F(p).mul(F(q)).div(F(100)));
          return { ...num(net, "%"), steps: [
            { line: 1, vars: { p, q, "p·q/100": F(p * q, 100) }, note: `Start from 100. After ${p}%: ${100 + p}. Then ${q}% of that changes it by ${fmt((100 + p) * q / 100)}. In one formula: ${p} + (${q}) + (${p})(${q})/100.` },
            { line: 2, vars: { net }, note: `Net change = ${ex(net)}%: ${net.sign() >= 0 ? "an increase" : "a decrease"}. The two changes don't just add, because the second acts on the changed value.` },
          ] };
        },
      },
      consumption: {
        name: "Price rise, cut consumption",
        params: [["r", "price rise %", 25]],
        code: ["cut % = r / (100 + r) × 100  // keep spending the same"],
        random: (r) => ({ r: pick(r, [10, 20, 25, 30, 40, 50, 60]) }),
        text: ({ r }) => `The price of sugar goes up by ${r}%. By what percentage must a family cut its consumption so that its spending stays the same?`,
        solve: ({ r }) => {
          const cut = F(r * 100, 100 + r);
          return { ...num(cut, "%"), steps: [
            { line: 1, vars: { r, "new price": `${100 + r}%` }, note: `Spending = price × quantity. The price becomes ${100 + r}/100 of what it was, so the quantity must become 100/${100 + r} of what it was.` },
            { line: 1, vars: { "cut %": cut }, note: `Cut = 1 − 100/${100 + r} = ${r}/${100 + r} = ${ex(cut)}%.` },
          ] };
        },
      },
    },
  },
  profit: {
    name: "Profit and loss",
    variants: {
      discount: {
        name: "Marked price and discount",
        params: [["m", "marked price", 800], ["d", "discount %", 10], ["g", "profit %", 20]],
        code: ["SP = MP × (1 − d/100)  // discount is on the marked price", "CP = SP ÷ (1 + g/100)  // profit is on the cost price"],
        random: (r) => ({ m: 100 * rint(r, 4, 20), d: pick(r, [5, 10, 15, 20, 25]), g: pick(r, [10, 20, 25, 50]) }),
        text: ({ m, d, g }) => `An article marked at ₹${m} is sold at a ${d}% discount, and the seller still makes a ${g}% profit. What is the cost price?`,
        solve: ({ m, d, g }) => {
          const sp = F(m).mul(F(100 - d, 100)), cp = sp.div(F(100 + g, 100));
          return { ...num(cp, "rupees"), steps: [
            { line: 1, vars: { MP: m, "SP": sp }, note: `Discount comes off the marked price: SP = ${m} × ${100 - d}/100 = ${ex(sp)}.` },
            { line: 2, vars: { SP: sp, CP: cp }, note: `Profit is a percentage of the cost price: SP = CP × ${100 + g}/100, so CP = ${ex(sp)} × 100/${100 + g} = ${ex(cp)}.` },
          ] };
        },
      },
      sameSp: {
        name: "Same price, gain and loss",
        params: [["x", "gain and loss %", 20]],
        code: ["overall loss % = x² / 100  // always a loss"],
        random: (r) => ({ x: pick(r, [5, 10, 12, 15, 20, 25, 30]) }),
        text: ({ x }) => `Two phones are each sold for the same price. One is sold at a ${x}% gain and the other at a ${x}% loss. What is the overall loss percentage?`,
        solve: ({ x }) => {
          const l = F(x * x, 100);
          return { ...num(l, "%"), steps: [
            { line: 1, vars: { "CP gain item": F(10000, 100 + x), "CP loss item": F(10000, 100 - x) }, note: `Say each sells for 100. The gain item cost 100 × 100/${100 + x} = ${ex(F(10000, 100 + x))}; the loss item cost 100 × 100/${100 - x} = ${ex(F(10000, 100 - x))}. The loss item cost more, so the loss outweighs the gain.` },
            { line: 1, vars: { "loss %": l }, note: `Overall loss = x²/100 = ${x}²/100 = ${ex(l)}%.` },
          ] };
        },
      },
      cpsp: {
        name: "Profit % from CP and SP",
        params: [["c", "cost price", 450], ["s", "selling price", 540]],
        code: ["profit = SP − CP", "profit % = profit ÷ CP × 100  // always on CP"],
        random: (r) => { const c = 10 * rint(r, 10, 90); return { c, s: c + 10 * rint(r, -8, 15) }; },
        text: ({ c, s }) => `An article bought for ₹${c} is sold for ₹${s}. What is the profit percentage? (Use a negative number for a loss.)`,
        solve: ({ c, s }) => {
          const p = F(s - c).div(F(c)).mul(F(100));
          return { ...num(p, "%"), steps: [
            { line: 1, vars: { CP: c, SP: s, profit: s - c }, note: `Profit = ${s} − ${c} = ${s - c}${s < c ? " (a loss)" : ""}.` },
            { line: 2, vars: { "profit %": p }, note: `Profit % = ${s - c}/${c} × 100 = ${ex(p)}%.` },
          ] };
        },
      },
    },
  },
  ratio: {
    name: "Ratio and mixtures",
    variants: {
      alligation: {
        name: "Alligation",
        params: [["c1", "cheaper price", 40], ["c2", "dearer price", 60], ["m", "mixture price", 52]],
        code: ["cheaper : dearer = (dearer − mean) : (mean − cheaper)  // the rule of alligation"],
        random: (r) => { const c1 = 5 * rint(r, 4, 12), c2 = c1 + 5 * rint(r, 2, 6); return { c1, c2, m: rint(r, c1 + 1, c2 - 1) }; },
        text: ({ c1, c2, m }) => `Rice at ₹${c1}/kg is mixed with rice at ₹${c2}/kg to get a mixture worth ₹${m}/kg. In what ratio (cheaper : dearer) are they mixed? Give the ratio as a single number, cheaper ÷ dearer.`,
        solve: ({ c1, c2, m }) => {
          const ratio = F(c2 - m, m - c1);
          return { ...num(ratio), steps: [
            { line: 1, vars: { "dearer − mean": c2 - m, "mean − cheaper": m - c1 }, note: `Each kg of cheap rice is ${m - c1} below the mean and each kg of dear rice is ${c2 - m} above it. They balance when cheaper × ${m - c1} = dearer × ${c2 - m}.` },
            { line: 1, vars: { ratio: `${c2 - m} : ${m - c1}`, "as a number": ratio }, note: `Cheaper : dearer = ${c2 - m} : ${m - c1} = ${ex(ratio)}.` },
          ] };
        },
      },
      replace: {
        name: "Repeated replacement",
        params: [["v", "litres of milk", 40], ["x", "litres replaced", 4], ["n", "times", 2]],
        code: ["milk left = V × (1 − x/V)ⁿ  // each round keeps (V − x)/V of the milk"],
        random: (r) => { const v = pick(r, [20, 40, 50, 60, 80, 100]); return { v, x: pick(r, [v / 10, v / 5, v / 4].filter(Number.isInteger)), n: rint(r, 2, 3) }; },
        text: ({ v, x, n }) => `A can holds ${v} litres of milk. ${x} litres are taken out and replaced with water, and this is done ${n} times in all. How many litres of milk are left?`,
        solve: ({ v, x, n }) => {
          const keep = F(v - x, v), left = F(v).mul(keep.pow(n));
          return { ...num(left, "litres"), steps: [
            { line: 1, vars: { V: v, x, keep }, note: `Each time, ${x} of the ${v} litres go, so ${v - x}/${v} = ${keep} of the milk stays.` },
            { line: 1, vars: { n, "milk left": left }, note: `After ${n} rounds: ${v} × (${keep})^${n} = ${ex(left)} litres.` },
          ] };
        },
      },
      share: {
        name: "Divide in a ratio",
        params: [["t", "total", 1200], ["a", "first part", 2], ["b", "second part", 3], ["c", "third part", 5]],
        code: ["share of A = total × a / (a + b + c)"],
        random: (r) => { const a = rint(r, 1, 5), b = rint(r, 1, 6), c = rint(r, 1, 7); return { t: (a + b + c) * 10 * rint(r, 3, 30), a, b, c }; },
        text: ({ t, a, b, c }) => `₹${t} is divided among A, B and C in the ratio ${a} : ${b} : ${c}. How much does C get?`,
        solve: ({ t, a, b, c }) => {
          const share = F(t * c, a + b + c);
          return { ...num(share, "rupees"), steps: [
            { line: 1, vars: { parts: a + b + c }, note: `${a} + ${b} + ${c} = ${a + b + c} equal parts, each worth ${t}/${a + b + c} = ${ex(F(t, a + b + c))}.` },
            { line: 1, vars: { "C gets": share }, note: `C has ${c} parts: ${c} × ${ex(F(t, a + b + c))} = ${ex(share)}.` },
          ] };
        },
      },
    },
  },
  work: {
    name: "Time and work",
    variants: {
      together: {
        name: "Working together",
        params: [["a", "A alone (days)", 12], ["b", "B alone (days)", 15]],
        code: ["one day's work: A = 1/a, B = 1/b  // add rates, not times", "together = 1 ÷ (1/a + 1/b) = ab / (a + b)"],
        random: (r) => ({ a: rint(r, 4, 20), b: rint(r, 5, 30) }),
        text: ({ a, b }) => `A can finish a job in ${a} days and B in ${b} days. Working together, how many days do they take?`,
        solve: ({ a, b }) => {
          const rate = F(1, a).add(F(1, b)), t = rate.inv();
          return { ...num(t, "days"), steps: [
            { line: 1, vars: { "A per day": F(1, a), "B per day": F(1, b), together: rate }, note: `In one day A does 1/${a} of the job and B does 1/${b}. Together: 1/${a} + 1/${b} = ${rate}.` },
            { line: 2, vars: { days: t }, note: `Time = 1 ÷ ${rate} = ${ex(t)} days.` },
          ] };
        },
      },
      leaves: {
        name: "One leaves part-way",
        params: [["a", "A alone (days)", 10], ["b", "B alone (days)", 15], ["k", "days together", 3]],
        code: ["work done together = k × (1/a + 1/b)", "remaining = 1 − that; B's time = remaining × b", "total = k + B's time"],
        random: (r) => { const a = rint(r, 6, 20), b = rint(r, 8, 24); const k = rint(r, 1, Math.max(1, Math.floor((a * b) / (a + b)) - 1)); return { a, b, k }; },
        text: ({ a, b, k }) => `A can do a job in ${a} days and B in ${b} days. They work together for ${k} day${k > 1 ? "s" : ""}, then A leaves. How many days does the whole job take?`,
        solve: ({ a, b, k }) => {
          const done = F(k).mul(F(1, a).add(F(1, b)));
          if (done.cmp(F(1)) >= 0) throw new Error(`They finish within the ${k} days together; pick fewer days.`);
          const rest = F(1).sub(done), tb = rest.mul(F(b)), total = F(k).add(tb);
          return { ...num(total, "days"), steps: [
            { line: 1, vars: { "done together": done }, note: `In ${k} day${k > 1 ? "s" : ""} together they do ${k} × (1/${a} + 1/${b}) = ${done} of the job.` },
            { line: 2, vars: { remaining: rest, "B alone": tb }, note: `${rest} is left. B does 1/${b} a day, so B needs ${rest} × ${b} = ${ex(tb)} days.` },
            { line: 3, vars: { total }, note: `Total = ${k} + ${ex(tb)} = ${ex(total)} days.` },
          ] };
        },
      },
      pipes: {
        name: "Filling and emptying pipes",
        params: [["a", "fill pipe (hours)", 6], ["b", "leak empties in (hours)", 10]],
        code: ["net rate = 1/a − 1/b  // the leak works against the pipe", "time = 1 ÷ net rate = ab / (b − a)"],
        random: (r) => { const a = rint(r, 2, 12); return { a, b: a + rint(r, 2, 12) }; },
        text: ({ a, b }) => `A pipe fills a tank in ${a} hours, but a leak would empty the full tank in ${b} hours. With both working, how long does the tank take to fill?`,
        solve: ({ a, b }) => {
          const rate = F(1, a).sub(F(1, b)), t = rate.inv();
          return { ...num(t, "hours"), steps: [
            { line: 1, vars: { fill: F(1, a), leak: F(1, b), net: rate }, note: `Each hour the pipe adds 1/${a} of the tank and the leak removes 1/${b}: net ${rate}.` },
            { line: 2, vars: { hours: t }, note: `Time = 1 ÷ ${rate} = ${ex(t)} hours.` },
          ] };
        },
      },
    },
  },
  speed: {
    name: "Time, speed and distance",
    variants: {
      average: {
        name: "Average speed",
        params: [["u", "speed going (km/h)", 40], ["v", "speed returning (km/h)", 60]],
        code: ["average speed = total distance ÷ total time", "equal distances: 2uv / (u + v)  // the harmonic mean, not (u + v)/2"],
        random: (r) => ({ u: 10 * rint(r, 2, 8), v: 10 * rint(r, 3, 10) }),
        text: ({ u, v }) => `A car goes from P to Q at ${u} km/h and comes back at ${v} km/h. What is its average speed for the round trip, in km/h?`,
        solve: ({ u, v }) => {
          const avg = F(2 * u * v, u + v);
          return { ...num(avg, "km/h"), steps: [
            { line: 1, vars: { d: "PQ", time: `d/${u} + d/${v}` }, note: `Total distance 2d; total time d/${u} + d/${v}. It spends longer at the slower speed, so the average is below ${(u + v) / 2}.` },
            { line: 2, vars: { "avg speed": avg }, note: `2d ÷ (d/${u} + d/${v}) = 2 × ${u} × ${v} / (${u} + ${v}) = ${ex(avg)} km/h.` },
          ] };
        },
      },
      train: {
        name: "Train past a platform",
        params: [["l", "train length (m)", 150], ["s", "speed (km/h)", 54], ["p", "platform length (m)", 250]],
        code: ["km/h to m/s: × 5/18", "distance = train + platform  // the whole train must clear it", "time = distance ÷ speed"],
        random: (r) => ({ l: 10 * rint(r, 8, 30), s: 18 * rint(r, 2, 5), p: 10 * rint(r, 5, 40) }),
        text: ({ l, s, p }) => `A ${l} m long train running at ${s} km/h crosses a ${p} m platform. How many seconds does it take?`,
        solve: ({ l, s, p }) => {
          const ms = F(s * 5, 18), t = F(l + p).div(ms);
          return { ...num(t, "seconds"), steps: [
            { line: 1, vars: { "speed (m/s)": ms }, note: `${s} km/h = ${s} × 5/18 = ${ex(ms)} m/s.` },
            { line: 2, vars: { distance: l + p }, note: `The front must travel the platform's length and then the train's own length: ${l} + ${p} = ${l + p} m.` },
            { line: 3, vars: { time: t }, note: `${l + p} ÷ ${ex(ms)} = ${ex(t)} seconds.` },
          ] };
        },
      },
      boat: {
        name: "Boats and streams",
        params: [["d", "distance (km)", 24], ["td", "downstream hours", 2], ["tu", "upstream hours", 3]],
        code: ["downstream = boat + stream;  upstream = boat − stream", "stream = (down − up) / 2;  boat = (down + up) / 2"],
        random: (r) => { const b = rint(r, 5, 15), w = rint(r, 1, b - 2), td = rint(r, 1, 4); const d = (b + w) * td; return { d, td, tu: d / (b - w) }; },
        text: ({ d, td, tu }) => `A boat goes ${d} km downstream in ${td} hours and comes back upstream in ${fmt(tu)} hours. What is the speed of the stream in km/h?`,
        solve: ({ d, td, tu }) => {
          const down = F(d).div(Fraction.from(td)), up = F(d).div(Fraction.from(tu)), w = down.sub(up).div(F(2)), b = down.add(up).div(F(2));
          return { ...num(w, "km/h"), steps: [
            { line: 1, vars: { down, up }, note: `Downstream speed = ${d}/${td} = ${ex(down)} km/h; upstream = ${d}/${fmt(tu)} = ${ex(up)} km/h.` },
            { line: 2, vars: { stream: w, boat: b }, note: `The stream adds to one and takes from the other, so stream = (${ex(down)} − ${ex(up)})/2 = ${ex(w)} km/h (and the boat does ${ex(b)} km/h in still water).` },
          ] };
        },
      },
    },
  },
  averages: {
    name: "Averages",
    variants: {
      replace: {
        name: "One member replaced",
        params: [["n", "group size", 8], ["w", "weight leaving (kg)", 65], ["d", "average rises by (kg)", 2.5]],
        code: ["total rises by n × d", "new member = leaving member + n × d"],
        random: (r) => ({ n: rint(r, 5, 12), w: rint(r, 45, 80), d: pick(r, [0.5, 1, 1.5, 2, 2.5, 3]) }),
        text: ({ n, w, d }) => `The average weight of ${n} people goes up by ${d} kg when one of them, weighing ${w} kg, is replaced by a new person. How much does the new person weigh, in kg?`,
        solve: ({ n, w, d }) => {
          const rise = F(n).mul(Fraction.from(d)), nw = F(w).add(rise);
          return { ...num(nw, "kg"), steps: [
            { line: 1, vars: { "total rise": rise }, note: `If the average of ${n} rises by ${d}, the total rises by ${n} × ${d} = ${ex(rise)}.` },
            { line: 2, vars: { "new weight": nw }, note: `So the newcomer is ${ex(rise)} kg heavier than the person who left: ${w} + ${ex(rise)} = ${ex(nw)} kg.` },
          ] };
        },
      },
      consecutive: {
        name: "Consecutive odd numbers",
        params: [["n", "how many", 7], ["m", "their average", 35]],
        code: ["evenly spaced: average = middle value", "largest = average + (n − 1)  // odd numbers are 2 apart, (n − 1)/2 steps above the middle"],
        random: (r) => ({ n: pick(r, [3, 5, 7, 9]), m: 2 * rint(r, 5, 40) + 1 }),
        text: ({ n, m }) => `The average of ${n} consecutive odd numbers is ${m}. What is the largest of them?`,
        solve: ({ n, m }) => {
          const big = m + (n - 1);
          return { ...num(big), steps: [
            { line: 1, vars: { middle: m }, note: `Equally spaced numbers average to the middle one, so the middle number is ${m}.` },
            { line: 2, vars: { largest: big }, note: `There are ${(n - 1) / 2} numbers above it, each 2 more: ${m} + 2 × ${(n - 1) / 2} = ${big}.` },
          ] };
        },
      },
      added: {
        name: "A new member joins",
        params: [["n", "group size", 10], ["a", "average", 30], ["d", "average rises by", 2]],
        code: ["old total = n × a;  new total = (n + 1)(a + d)", "newcomer = new total − old total = a + (n + 1)d"],
        random: (r) => ({ n: rint(r, 4, 20), a: rint(r, 20, 60), d: rint(r, 1, 4) }),
        text: ({ n, a, d }) => `The average age of ${n} students is ${a}. When the teacher's age is included, the average rises by ${d}. How old is the teacher?`,
        solve: ({ n, a, d }) => {
          const t = a + (n + 1) * d;
          return { ...num(t, "years"), steps: [
            { line: 1, vars: { "old total": n * a, "new total": (n + 1) * (a + d) }, note: `Old total = ${n} × ${a} = ${n * a}. New total = ${n + 1} × ${a + d} = ${(n + 1) * (a + d)}.` },
            { line: 2, vars: { teacher: t }, note: `Teacher = ${(n + 1) * (a + d)} − ${n * a} = ${t}. (Shortcut: ${a} + ${n + 1} × ${d}.)` },
          ] };
        },
      },
    },
  },
  interest: {
    name: "Simple and compound interest",
    variants: {
      ci: {
        name: "Compound interest",
        params: [["p", "principal", 10000], ["r", "rate % a year", 10], ["t", "years", 2]],
        code: ["amount = P × (1 + r/100)ᵗ  // interest earns interest", "CI = amount − P"],
        random: (r) => ({ p: 1000 * rint(r, 1, 20), r: pick(r, [5, 10, 20, 4, 8]), t: rint(r, 2, 3) }),
        text: ({ p, r, t }) => `What is the compound interest on ₹${p} at ${r}% a year for ${t} years, compounded annually?`,
        solve: ({ p, r, t }) => {
          const amt = F(p).mul(F(100 + r, 100).pow(t)), ci = amt.sub(F(p));
          return { ...num(ci, "rupees"), steps: [
            { line: 1, vars: { factor: F(100 + r, 100), amount: amt }, note: `Each year multiplies the amount by ${100 + r}/100: ${p} × (${F(100 + r, 100)})^${t} = ${ex(amt)}.` },
            { line: 2, vars: { CI: ci }, note: `CI = ${ex(amt)} − ${p} = ${ex(ci)}.` },
          ] };
        },
      },
      si: {
        name: "Simple interest",
        params: [["p", "principal", 5000], ["r", "rate % a year", 8], ["t", "years", 3]],
        code: ["SI = P × r × t / 100  // interest only on the principal"],
        random: (r) => ({ p: 500 * rint(r, 1, 40), r: rint(r, 3, 15), t: rint(r, 1, 6) }),
        text: ({ p, r, t }) => `What is the simple interest on ₹${p} at ${r}% a year for ${t} years?`,
        solve: ({ p, r, t }) => {
          const si = F(p * r * t, 100);
          return { ...num(si, "rupees"), steps: [
            { line: 1, vars: { P: p, r, t, SI: si }, note: `SI = ${p} × ${r} × ${t} / 100 = ${ex(si)}. Each year earns the same ${ex(F(p * r, 100))}.` },
          ] };
        },
      },
      diff: {
        name: "CI minus SI",
        params: [["p", "principal", 8000], ["r", "rate % a year", 5], ["t", "years (2 or 3)", 2]],
        code: ["2 years: CI − SI = P(r/100)²  // interest on the first year's interest", "3 years: CI − SI = P(r/100)²(3 + r/100)"],
        random: (r) => ({ p: 1000 * rint(r, 1, 20), r: pick(r, [4, 5, 10, 20]), t: rint(r, 2, 3) }),
        text: ({ p, r, t }) => `What is the difference between compound interest and simple interest on ₹${p} at ${r}% a year for ${t} years?`,
        solve: ({ p, r, t }) => {
          if (t !== 2 && t !== 3) throw new Error("Use 2 or 3 years.");
          const k = F(r, 100), dd = t === 2 ? F(p).mul(k.mul(k)) : F(p).mul(k.mul(k)).mul(F(3).add(k));
          return { ...num(dd, "rupees"), steps: [
            { line: t === 2 ? 1 : 2, vars: { "r/100": k }, note: t === 2 ? "Over 2 years, CI beats SI only by the interest earned on the first year's interest." : "Over 3 years, CI also earns interest on the extra interest of the earlier years." },
            { line: t === 2 ? 1 : 2, vars: { "CI − SI": dd }, note: t === 2 ? `${p} × (${k})² = ${ex(dd)}.` : `${p} × (${k})² × (3 + ${k}) = ${ex(dd)}.` },
          ] };
        },
      },
    },
  },
  series: {
    name: "Number series",
    variants: {
      next: {
        name: "Find the next term",
        params: [["s", "terms (comma separated)", "3, 8, 15, 24, 35"]],
        code: ["try differences: constant at some level?", "try ratios: constant? or ×k + c?", "try n² ± c, n³ ± c", "try two series interleaved, or each term = sum of the previous two"],
        random: (r) => ({ s: randomSeries(r).join(", ") }),
        text: ({ s }) => `What comes next in the series ${s}, ?`,
        solve: ({ s }) => solveSeries(String(s).split(/[,\s]+/).filter(Boolean).map(Number)),
      },
    },
  },
  clock: {
    name: "Clocks",
    variants: {
      angle: {
        name: "Angle between the hands",
        params: [["h", "hour", 3], ["m", "minute", 40]],
        code: ["hour hand = 30h + 0.5m degrees  // it moves too", "minute hand = 6m degrees", "angle = |30h − 5.5m|; take 360 − angle if over 180"],
        random: (r) => ({ h: rint(r, 1, 12), m: 5 * rint(r, 1, 11) + rint(r, 0, 1) * 2 }),
        text: ({ h, m }) => `What is the smaller angle between the hands of a clock at ${h}:${String(m).padStart(2, "0")}?`,
        solve: ({ h, m }) => {
          if (!(h >= 1 && h <= 12 && m >= 0 && m < 60)) throw new Error("Use an hour from 1 to 12 and minutes from 0 to 59.");
          const hh = F(30 * (h % 12)).add(F(m, 2)), mm = F(6 * m);
          let a = hh.sub(mm).abs();
          const raw = a;
          if (a.cmp(F(180)) > 0) a = F(360).sub(a);
          return { ...num(a, "degrees"), steps: [
            { line: 1, vars: { "hour hand": hh }, note: `The hour hand moves 30° an hour and 0.5° a minute: 30 × ${h % 12} + 0.5 × ${m} = ${ex(hh)}°.` },
            { line: 2, vars: { "minute hand": mm }, note: `The minute hand moves 6° a minute: 6 × ${m} = ${mm}°.` },
            { line: 3, vars: { difference: raw, angle: a }, note: `Difference = ${ex(raw)}°${raw.cmp(F(180)) > 0 ? `, more than 180°, so the smaller angle is 360 − ${ex(raw)} = ${ex(a)}°` : ""}.` },
          ] };
        },
      },
      together: {
        name: "When do the hands meet?",
        params: [["h", "between h and h + 1 o'clock", 4]],
        code: ["the minute hand gains 5.5° a minute on the hour hand", "at h o'clock it is 30h° behind", "they meet after 30h ÷ 5.5 = 60h/11 minutes"],
        random: (r) => ({ h: rint(r, 1, 10) }),
        text: ({ h }) => `At how many minutes past ${h} o'clock are the hands of a clock together?`,
        solve: ({ h }) => {
          const t = F(60 * h, 11);
          return { ...num(t, "minutes"), steps: [
            { line: [1, 2], vars: { gap: 30 * h }, note: `At ${h}:00 the minute hand is ${30 * h}° behind the hour hand, and it gains 6 − 0.5 = 5.5° every minute.` },
            { line: 3, vars: { minutes: t }, note: `${30 * h} ÷ 5.5 = ${ex(t)} minutes past ${h}, that's ${Math.floor(t.toNumber())} ${t.sub(F(Math.floor(t.toNumber())))} minutes.` },
          ] };
        },
      },
    },
  },
  calendar: {
    name: "Calendars",
    variants: {
      weekday: {
        name: "Day of the week",
        params: [["d", "day", 15], ["m", "month (1 to 12)", 8], ["y", "year", 1947]],
        code: ["odd days = days left over after whole weeks", "400 years: 0; 300 years: 1; 200 years: 3; 100 years: 5", "each ordinary year: 1 odd day; each leap year: 2", "add the odd days of the months and days of this year", "total mod 7: 0 = Sunday, 1 = Monday, …"],
        random: (r) => { const y = rint(r, 1801, 2099), m = rint(r, 1, 12); return { d: rint(r, 1, monthDays(m, y)), m, y }; },
        text: ({ d, m, y }) => `What day of the week was ${d} ${MONTHS[m - 1]} ${y}?`,
        solve: ({ d, m, y }) => weekday(d, m, y),
      },
    },
  },
};

// --- Calendars --------------------------------------------------------------------------

const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthDays = (m, y) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export function weekday(d, m, y) {
  if (!(Number.isInteger(y) && y >= 1 && y <= 9999)) throw new Error("Use a year from 1 to 9999.");
  if (!(m >= 1 && m <= 12)) throw new Error("Use a month from 1 to 12.");
  if (!(d >= 1 && d <= monthDays(m, y))) throw new Error(`${MONTHS[m - 1]} ${y} has ${monthDays(m, y)} days.`);
  const past = y - 1;
  const cent = Math.floor(past / 100) % 4, rest = past % 100;
  const centOdd = [0, 5, 3, 1][cent];
  const leaps = Math.floor(rest / 4) - (rest === 0 ? 0 : 0);
  const restOdd = rest + leaps; // ordinary years 1, leap years 2
  const monthsOdd = Array.from({ length: m - 1 }, (_, i) => monthDays(i + 1, y)).reduce((s, x) => s + x, 0);
  const total = centOdd + restOdd + monthsOdd + d;
  const day = total % 7;
  // Cross-check against the built-in calendar.
  const check = new Date(Date.UTC(2000, 0, 1));
  check.setUTCFullYear(y, m - 1, d);
  if (check.getUTCDay() !== day) throw new Error("Calendar mismatch.");
  return {
    answer: DAYS[day], display: DAYS[day], choices: DAYS,
    steps: [
      { line: [1, 2], vars: { "years before": past, "centuries part": Math.floor(past / 100) * 100, "odd days": centOdd }, note: `Count the odd days in the ${past} complete years before ${y}. Every 400 years has 0 odd days; ${Math.floor(past / 100) * 100} years leaves ${cent * 100} beyond a multiple of 400, which gives ${centOdd} odd day${centOdd === 1 ? "" : "s"}.` },
      { line: 3, vars: { "remaining years": rest, "leap years": leaps, "odd days": restOdd % 7 }, note: `The other ${rest} years have ${leaps} leap year${leaps === 1 ? "" : "s"}: ${rest} + ${leaps} = ${restOdd} odd days, which is ${restOdd % 7} after removing whole weeks.` },
      { line: 4, vars: { "months so far": monthsOdd, "day of month": d }, note: m > 1 ? `In ${y} itself, January to ${MONTHS[m - 2]} have ${monthsOdd} days${leap(y) && m > 2 ? " (a leap year, so February has 29)" : ""}, plus ${d} days of ${MONTHS[m - 1]}.` : `Then the ${d} day${d > 1 ? "s" : ""} of January ${y}.` },
      { line: 5, vars: { total, "mod 7": day, day: DAYS[day] }, note: `Total = ${centOdd} + ${restOdd} + ${monthsOdd} + ${d} = ${total}; ${total} mod 7 = ${day}, which is ${DAYS[day]}.` },
    ],
  };
}

// --- Number series ---------------------------------------------------------------------

export function randomSeries(r) {
  const kind = pick(r, ["ap", "gp", "square", "cube", "diff2", "mulAdd", "alt", "fib"]);
  const n = 6; // five shown, one to find
  const a = rint(r, 1, 9);
  switch (kind) {
    case "ap": { const d = rint(r, 2, 12) * (r() < 0.2 ? -1 : 1); return Array.from({ length: n }, (_, i) => a + i * d); }
    case "gp": { const k = rint(r, 2, 3); return Array.from({ length: n }, (_, i) => a * k ** i); }
    case "square": { const c = rint(r, -3, 3), s = rint(r, 1, 6); return Array.from({ length: n }, (_, i) => (s + i) ** 2 + c); }
    case "cube": { const c = rint(r, -2, 2), s = rint(r, 1, 4); return Array.from({ length: n }, (_, i) => (s + i) ** 3 + c); }
    case "diff2": { const d = rint(r, 1, 5), dd = rint(r, 1, 4); const o = [a]; for (let i = 1; i < n; i++) o.push(o[i - 1] + d + (i - 1) * dd); return o; }
    case "mulAdd": { const k = rint(r, 2, 3), c = rint(r, -3, 4) || 1; const o = [a]; for (let i = 1; i < n; i++) o.push(o[i - 1] * k + c); return o; }
    case "alt": { const d1 = rint(r, 2, 6), d2 = rint(r, 2, 9), b = rint(r, 10, 30); return Array.from({ length: n }, (_, i) => (i % 2 ? b + ((i - 1) / 2) * d2 : a + (i / 2) * d1)); }
    case "fib": { const o = [a, rint(r, 1, 9)]; while (o.length < n) o.push(o.at(-1) + o.at(-2)); return o; }
  }
  return [1, 2, 3, 4, 5];
}

export function solveSeries(t) {
  if (t.length < 4 || t.some((x) => !Number.isFinite(x))) throw new Error("Type at least four numbers, separated by commas.");
  if (t.length > 10) throw new Error("Use at most ten terms.");
  const steps = [];
  const out = (next, line, rule, extra = {}) => {
    steps.push({ line, vars: { rule, next, ...extra }, note: `${rule}. So the next term is ${next}.` });
    return { answer: next, exact: F(next), display: String(next), steps };
  };
  // Differences up to the third level.
  let rows = [t];
  for (let level = 1; level <= 3; level++) {
    const prev = rows.at(-1);
    const dif = prev.slice(1).map((x, i) => x - prev[i]);
    rows.push(dif);
    // One level of differences needs 2 equal values; deeper levels need 3, or any series would fit.
    if (dif.length >= (level === 1 ? 2 : 3) && dif.every((x) => x === dif[0])) {
      steps.push({ line: 1, vars: Object.fromEntries(rows.slice(1).map((r, i) => [`Δ${"¹²³"[i]}`, r])), note: `Take differences between neighbours${level > 1 ? `, then differences of those, ${level} times` : ""}: the level-${level} differences are all ${dif[0]}.` });
      // Extend the table back up.
      let add = dif[0];
      for (let k = rows.length - 2; k >= 0; k--) add = rows[k].at(-1) + add;
      return out(add, 1, level === 1 ? `Add ${dif[0]} each time (arithmetic progression)` : `The ${["", "first", "second", "third"][level]} differences are constant`, { differences: rows[1] });
    }
    if (dif.length < 3) break;
  }
  // Ratios.
  if (t.every((x) => x !== 0)) {
    const k = t[1] / t[0];
    if (Number.isInteger(k) && t.every((x, i) => i === 0 || x === t[i - 1] * k)) {
      steps.push({ line: 2, vars: { ratio: k }, note: `Each term is ${k} times the one before (a geometric progression).` });
      return out(t.at(-1) * k, 2, `Multiply by ${k}`);
    }
  }
  for (let k = 2; k <= 5; k++) {
    const c = t[1] - k * t[0];
    if (t.every((x, i) => i === 0 || x === t[i - 1] * k + c)) {
      steps.push({ line: 2, vars: { k, c }, note: `Each term is ${k} × the previous ${c >= 0 ? "+" : "−"} ${Math.abs(c)}: ${t.slice(1).map((x, i) => `${t[i]} × ${k} ${c >= 0 ? "+" : "−"} ${Math.abs(c)} = ${x}`).join(", ")}.` });
      return out(t.at(-1) * k + c, 2, `×${k} ${c >= 0 ? "+" : "−"} ${Math.abs(c)}`);
    }
  }
  for (const [p, name] of [[2, "square"], [3, "cube"]]) for (let s = 0; s <= 12; s++) {
    const c = t[0] - s ** p;
    if (t.every((x, i) => x === (s + i) ** p + c)) {
      steps.push({ line: 3, vars: { bases: t.map((_, i) => s + i), c }, note: `The terms are ${name}s ${c ? `${c > 0 ? "plus" : "minus"} ${Math.abs(c)}` : ""}: ${t.map((x, i) => `${s + i}${p === 2 ? "²" : "³"}${c ? ` ${c > 0 ? "+" : "−"} ${Math.abs(c)}` : ""}`).join(", ")}.` });
      return out((s + t.length) ** p + c, 3, `n${p === 2 ? "²" : "³"}${c ? ` ${c > 0 ? "+" : "−"} ${Math.abs(c)}` : ""}`);
    }
  }
  if (t.length >= 5) {
    const odd = t.filter((_, i) => i % 2 === 0), even = t.filter((_, i) => i % 2 === 1);
    const ap = (s) => s.length >= 2 && s.every((x, i) => i === 0 || x - s[i - 1] === s[1] - s[0]);
    if (ap(odd) && ap(even)) {
      const which = t.length % 2 === 0 ? odd : even;
      const next = which.at(-1) + (which.length >= 2 ? which[1] - which[0] : 0);
      steps.push({ line: 4, vars: { "1st, 3rd, …": odd, "2nd, 4th, …": even }, note: `Two series are interleaved: ${odd.join(", ")} (step ${odd[1] - odd[0]}) and ${even.join(", ")} (step ${even[1] - even[0]}). The next term belongs to the ${t.length % 2 === 0 ? "first" : "second"}.` });
      return out(next, 4, "Two interleaved series");
    }
  }
  if (t.every((x, i) => i < 2 || x === t[i - 1] + t[i - 2])) {
    steps.push({ line: 4, vars: {}, note: `Each term is the sum of the two before it: ${t.slice(2).map((x, i) => `${t[i]} + ${t[i + 1]} = ${x}`).join(", ")}.` });
    return out(t.at(-1) + t.at(-2), 4, "Add the previous two");
  }
  throw new Error("No simple pattern found (differences, ratios, ×k + c, squares, cubes, interleaved or Fibonacci-like).");
}

// --- Questions --------------------------------------------------------------------------

export function solve(topic, variant, params) {
  const v = TOPICS[topic]?.variants[variant];
  if (!v) throw new Error("Unknown question type.");
  const res = v.solve(params);
  return { ...res, text: v.text(params), code: v.code };
}

export function makeQuestion(r, topic = null, variant = null) {
  const t = topic ?? pick(r, Object.keys(TOPICS));
  const vs = TOPICS[t].variants;
  const k = variant ?? pick(r, Object.keys(vs));
  for (let i = 0; i < 20; i++) {
    const params = vs[k].random(r);
    try { return { topic: t, variant: k, params, ...solve(t, k, params) }; } catch { /* try new numbers */ }
  }
  throw new Error("Couldn't make a question.");
}
