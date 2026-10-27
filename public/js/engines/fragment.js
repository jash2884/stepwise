// IPv4 fragmentation. Every fragment except the last carries a multiple of 8
// data bytes, because the offset field counts in 8-byte units. Every step
// names its pseudocode line (`line`) and the variables at that point (`vars`).

export const FRAGMENT_CODE = [
  "if total ≤ MTU then forward the datagram unchanged",
  "room ← ⌊(MTU − header) / 8⌋ × 8  // data per fragment",
  "data ← total − header; start ← 0",
  "while start < data",
  "  size ← min(room, data − start)",
  "  MF ← 1 if more data follows, else 0",
  "  emit: length = size + header, offset = start / 8, MF",
  "  start ← start + size",
];

export function fragment(totalLength, mtu, header = 20) {
  for (const [v, name] of [[totalLength, "Datagram length"], [mtu, "MTU"], [header, "Header length"]]) {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`${name} must be a positive whole number.`);
  }
  if (header < 20 || header > 60 || header % 4) throw new Error("The IPv4 header is 20 to 60 bytes, in steps of 4.");
  if (totalLength <= header) throw new Error("The datagram must be longer than its header.");
  if (totalLength > 65535) throw new Error("An IPv4 datagram is at most 65,535 bytes.");
  if (mtu < header + 8) throw new Error(`The MTU must leave room for the header plus at least 8 data bytes (≥ ${header + 8}).`);
  const data = totalLength - header;
  const steps = [];
  if (totalLength <= mtu) {
    return { fragments: [{ offset: 0, data, length: totalLength, mf: 0, first: 0, last: data - 1 }], perFragment: data, data,
      steps: [{ line: 1, made: 1, vars: { total: totalLength, MTU: mtu }, note: `${totalLength} bytes fit in the MTU of ${mtu}: no fragmentation needed.` }] };
  }
  const perFragment = Math.floor((mtu - header) / 8) * 8;
  steps.push({ line: [1, 2], made: 0, vars: { total: totalLength, MTU: mtu, header, room: perFragment }, note: `${totalLength} bytes won't fit in an MTU of ${mtu}, so the router must fragment. Each fragment repeats the ${header}-byte header, leaving ${mtu} − ${header} = ${mtu - header} bytes; offsets count in 8-byte units, so round down to a multiple of 8: ${perFragment} bytes of data per fragment.` });
  steps.push({ line: 3, made: 0, vars: { total: totalLength, MTU: mtu, header, room: perFragment, data, start: 0 }, note: `The original carries ${totalLength} − ${header} = ${data} bytes of data (the header isn't fragmented, it's copied), so ⌈${data} / ${perFragment}⌉ = ${Math.ceil(data / perFragment)} fragments.` });
  const fragments = [];
  for (let start = 0; start < data; start += perFragment) {
    const size = Math.min(perFragment, data - start);
    const last = start + size >= data;
    const f = { offset: start / 8, data: size, length: size + header, mf: last ? 0 : 1, first: start, last: start + size - 1 };
    fragments.push(f);
    steps.push({ line: [4, 5, 6, 7, 8], made: fragments.length, vars: { room: perFragment, data, start, size, MF: f.mf, offset: f.offset, length: f.length },
      note: `Fragment ${fragments.length}: data bytes ${start}–${start + size - 1} (${size} bytes${last && size < perFragment ? ", whatever is left" : ""}), offset ${start} ÷ 8 = ${f.offset}, total length ${size} + ${header} = ${f.length}, MF = ${f.mf}${last ? " because it's the last fragment" : " because more follow"}.` });
  }
  steps.push({ line: 4, made: fragments.length, done: true, vars: { data, fragments: fragments.length, "bytes sent": fragments.reduce((s, f) => s + f.length, 0) }, note: `All ${data} data bytes are covered. Only the destination reassembles: it uses the identification field to group the fragments, the offsets to order them, and MF = 0 to know it has the end. Overhead: ${fragments.length - 1} extra header${fragments.length === 2 ? "" : "s"} = ${(fragments.length - 1) * header} bytes.` });
  return { fragments, perFragment, data, steps };
}
