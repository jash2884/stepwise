// IPv4 fragmentation. Every fragment except the last carries a multiple of 8
// data bytes, because the offset field counts in 8-byte units.

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
    return { fragments: [{ offset: 0, data, length: totalLength, mf: 0, first: 0, last: data - 1 }], perFragment: data, data, steps: [{ note: `${totalLength} bytes fit in the MTU of ${mtu}: no fragmentation needed.` }] };
  }
  const perFragment = Math.floor((mtu - header) / 8) * 8;
  steps.push({ note: `Room for data per fragment: MTU ${mtu} − header ${header} = ${mtu - header} bytes, rounded down to a multiple of 8 = ${perFragment} bytes.` });
  steps.push({ note: `Original data: ${totalLength} − ${header} = ${data} bytes, so ${Math.ceil(data / perFragment)} fragments.` });
  const fragments = [];
  for (let start = 0; start < data; start += perFragment) {
    const size = Math.min(perFragment, data - start);
    const last = start + size >= data;
    const f = { offset: start / 8, data: size, length: size + header, mf: last ? 0 : 1, first: start, last: start + size - 1 };
    fragments.push(f);
    steps.push({ note: `Fragment ${fragments.length}: data bytes ${start}–${start + size - 1}, offset ${start} ÷ 8 = ${f.offset}, total length ${f.length}, MF = ${f.mf}${last ? " (last fragment)" : ""}.` });
  }
  return { fragments, perFragment, data, steps };
}
