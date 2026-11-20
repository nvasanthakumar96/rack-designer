// Everything the workshop needs to buy and cut, derived from the model:
// steel cut list, a stock cutting plan, boards, fixings and a drilling schedule.

import { BOARD_MATS } from './model.js';

export function sectionLabel(part) {
  if (part.profile === 'flat') return `${part.w} × ${part.t} flat bar`;
  return `${part.a} × ${part.a} × ${part.t} ${part.slotted ? 'slotted ' : ''}angle`;
}

// First-fit decreasing: good enough for a handful of bars and easy to follow at the saw.
function nest(lengths, stock, kerf) {
  const bars = [];
  for (const len of [...lengths].sort((a, b) => b - a)) {
    let bar = bars.find((b) => b.used + kerf + len <= stock + 1e-6);
    if (!bar) { bar = { cuts: [], used: -kerf }; bars.push(bar); }
    bar.cuts.push(len);
    bar.used += kerf + len;
  }
  return bars.map((b) => ({ cuts: b.cuts, used: Math.max(0, b.used), left: Math.max(0, stock - b.used) }));
}

export function billOfMaterials(model) {
  const { p, B } = model;

  // ---- steel ----
  const rows = new Map();
  for (const part of model.parts) {
    const drillSig = part.drill.map((d) => `${d.face}${d.u.toFixed(0)}${d.csk ? 'c' : ''}`).join(' ');
    const key = [part.name, sectionLabel(part), part.len.toFixed(1), drillSig].join('|');
    const row = rows.get(key);
    if (row) { row.qty++; continue; }
    rows.set(key, { name: part.name, group: part.group, section: sectionLabel(part), len: part.len, qty: 1,
                    kg: part.kg, slotted: part.slotted, drill: part.drill, notes: part.notes });
  }
  const steel = [...rows.values()];
  // Identical-looking rows that only differ by drilling get a mark so the schedule can refer to them.
  const seen = new Map();
  for (const r of steel) {
    const k = `${r.name}|${r.section}|${r.len.toFixed(1)}`;
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    r.variant = n;
  }
  steel.forEach((r, i) => { r.mark = `S${i + 1}`; });

  const bySection = new Map();
  for (const r of steel) {
    const s = bySection.get(r.section) || { section: r.section, lengths: [] };
    for (let i = 0; i < r.qty; i++) s.lengths.push(r.len);
    bySection.set(r.section, s);
  }
  const stock = [...bySection.values()].map((s) => {
    const bars = nest(s.lengths, p.stockLen, p.kerf);
    return { section: s.section, total: s.lengths.reduce((a, b) => a + b, 0), bars,
             oversize: s.lengths.some((l) => l > p.stockLen) };
  });

  // ---- boards ----
  const mat = BOARD_MATS[p.boardMat];
  const bRows = new Map();
  for (const b of model.boards) {
    const key = `${b.w.toFixed(1)}|${b.d.toFixed(1)}|${b.h}`;
    const row = bRows.get(key);
    if (row) { row.qty++; row.names.add(b.name); continue; }
    bRows.set(key, { names: new Set([b.name]), len: b.w, wid: b.d, t: b.h, qty: 1, kg: b.w * b.d * b.h * mat.rho });
  }
  const boards = [...bRows.values()].map((r, i) => ({ ...r, mark: `B${i + 1}`, name: r.names.size > 2 ? 'Shelf board' : [...r.names].join(', ') }));
  let sheets = 0;
  for (const r of boards) {
    const perSheet = Math.max(1, Math.floor((p.sheetW + p.kerf) / (r.wid + p.kerf))) * Math.max(1, Math.floor((p.sheetL + p.kerf) / (r.len + p.kerf)));
    sheets += Math.ceil(r.qty / perSheet);
  }

  // ---- fixings ----
  const count = (kind) => model.bolts.filter((b) => b.kind === kind);
  const byLen = (list) => {
    const m = new Map();
    for (const b of list) m.set(b.len, (m.get(b.len) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  };
  const hardware = [];
  const frame = count('frame'), csk = count('csk'), brace = count('brace');
  for (const [len, qty] of byLen(frame)) {
    hardware.push({ item: `M${B.d} × ${len} ${p.head === 'button' ? 'button-head' : 'hex'} bolt`, use: p.head === 'button' ? 'Frame joints, head inside' : 'Frame joints, head outside', qty });
  }
  for (const [len, qty] of byLen(csk)) hardware.push({ item: `M${B.d} × ${len} countersunk bolt`, use: 'Rail seats', qty });
  for (const [len, qty] of byLen(brace)) hardware.push({ item: `M${B.d} × ${len} hex bolt`, use: 'Back braces', qty });
  const nuts = model.bolts.length;
  if (nuts) {
    hardware.push({ item: `M${B.d} nyloc nut`, use: 'One per bolt', qty: nuts });
    hardware.push({ item: `M${B.d} flat washer`, use: 'Under every nut, and under hex heads', qty: nuts + brace.length + (p.head === 'hex' ? frame.length : 0) });
  }
  if (p.brace === 'x' && model.braces.length) hardware.push({ item: `M${B.d} spacer washer, ${p.braceT} mm`, use: 'Behind the outer brace of each X', qty: model.braces.length });
  if (p.brace === 'knee' && model.braces.length) hardware.push({ item: `M${B.d} spacer washer, ${p.postT} mm`, use: 'Between each corner brace and the rail', qty: model.braces.length });
  if (model.feet.length) {
    hardware.push(p.footType === 'leveller'
      ? { item: 'M10 levelling foot on a bolt-on foot plate', use: 'Under every post and centre bar, fixed with one frame bolt', qty: model.feet.length }
      : { item: `Plastic end cap, ${p.postA} mm angle`, use: 'Under every post and centre bar', qty: model.feet.length });
  }
  if (p.boards && p.packer > 0) {
    hardware.push({ item: `Rubber or EVA seat strip, ${model.seatW.toFixed(0)} × ${p.packer} mm`, use: 'Along every rail seat', qty: +(model.strips.seat / 1000).toFixed(1), unit: 'm' });
  }
  if (p.boards && model.strips.cross > 0) {
    hardware.push({ item: `Pad strip, ${p.crossA} × ${(p.packer + p.railT).toFixed(0)} mm`, use: 'On top of every cross bearer', qty: +(model.strips.cross / 1000).toFixed(1), unit: 'm' });
  }

  const boardKg = boards.reduce((s, r) => s + r.kg * r.qty, 0);

  // ---- dispatch: what goes in the box and how it goes together ----
  const longest = Math.max(...steel.map((r) => r.len));
  const section = Math.max(p.postA, p.railA, p.crossA, p.flatW);
  const side = Math.ceil((Math.sqrt(model.parts.length) * section * 0.75) / 10) * 10;   // nested angles, roughly square bundle
  const steelParcels = Math.max(1, Math.ceil(model.steelKg / 25));
  const hexKey = { 6: 4, 8: 5, 10: 6 }[B.d];
  const kit = {
    longest, steelParcels,
    parcel: [Math.ceil((longest + 40) / 10) * 10, side, side],
    bagged: hardware.filter((h) => !h.unit).map((h) => ({ ...h, pack: /bolt|nut|washer/.test(h.item) && !/foot/.test(h.item) ? Math.ceil(h.qty * 1.1) : h.qty })),
    tools: [`${hexKey} mm hex key`, `${B.af} mm spanner`, 'Spirit level', 'Rubber mallet'],
    steps: [
      'Lay the two back posts on the floor. Bolt the back rails between them at each level, finger tight.' + (model.split ? ' Join each pair of rail halves on a centre flat bar.' : ''),
      'Build the front frame the same way.',
      'Stand both frames up and bolt in the end rails, lowest level first.',
      ...(model.braces.length ? ['Bolt the braces across the back.'] : []),
      ...(model.feet.length ? ['Fit the feet and level the rack.'] : []),
      'Check the frame is square (both diagonals equal), then tighten every bolt.',
      ...(p.boards ? [`${p.packer > 0 ? 'Stick the seat strip along the rail seats. ' : ''}${model.stations.length > 2 ? 'Drop the cross bearers onto the seats. ' : ''}Lay the lower boards in from an end, then drop the top board in.`] : []),
    ],
  };
  return {
    steel, stock, boards, sheets, hardware, kit,
    drill: steel.filter((r) => r.drill.length),
    totals: { steelKg: model.steelKg, boardKg, kg: model.steelKg + boardKg,
              steelPieces: model.parts.length, bolts: model.bolts.length, holes: model.drilled + model.braces.length * 2 },
  };
}

export function toCSV(model, bom, fmt) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [[q(model.p.name)], [], ['Mark', 'Part', 'Section', 'Length', 'Qty', 'kg total', 'Notes'].map(q)];
  for (const r of bom.steel) lines.push([r.mark, r.name, r.section, fmt(r.len), r.qty, (r.kg * r.qty).toFixed(2), r.notes.join('; ')].map(q));
  lines.push([], ['Mark', 'Board', 'Length', 'Width', 'Thickness', 'Qty', 'kg total'].map(q));
  for (const r of bom.boards) lines.push([r.mark, r.name, fmt(r.len), fmt(r.wid), fmt(r.t), r.qty, (r.kg * r.qty).toFixed(2)].map(q));
  lines.push([], ['Fixing', 'Use', 'Qty'].map(q));
  for (const r of bom.hardware) lines.push([r.item, r.use, `${r.qty}${r.unit ? ' ' + r.unit : ''}`].map(q));
  lines.push([], ['Stock', 'Bars', 'Cutting plan'].map(q));
  for (const s of bom.stock) lines.push([s.section, s.bars.length, s.bars.map((b, i) => `Bar ${i + 1}: ${b.cuts.map((c) => fmt(c)).join(' + ')}`).join(' | ')].map(q));
  lines.push([], ['Mark', 'Extra holes to punch before dispatch, from one end (face A / B)'].map(q));
  for (const r of bom.drill) lines.push([r.mark, r.drill.map((d) => `${d.face} ${d.u.toFixed(0)}`).join(', ')].map(q));
  lines.push([], ['Dispatch'].map(q), ['Longest piece', fmt(bom.kit.longest)].map(q), ['Steel parcels (25 kg each or less)', bom.kit.steelParcels].map(q), ['Tools', bom.kit.tools.join('; ')].map(q));
  bom.kit.steps.forEach((st, i) => lines.push([`Step ${i + 1}`, st].map(q)));
  return lines.map((l) => l.join(',')).join('\n');
}
