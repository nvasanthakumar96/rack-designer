// Working drawing as an SVG string: front elevation, end elevation, plan and a detail of
// the board seat. Generated from the same plates, bolts and boards as the 3D view, so the
// two can never disagree. Labels with data-key are click-to-edit (wired up in main.js).

import { fmt } from './units.js';

const INK = '#1d1d1f';
const DIMC = '#0a6cdb';
const FILL = { post: '#6b7480', centre: '#565e69', rail: '#8a929d', cross: '#aab1ba', brace: '#c3c8cf' };
const BOARD = '#e9d3ad';
const DIM = { x: 'w', y: 'h', z: 'd' };

export function drawSheet(model, unit) {
  const { p, ys, B } = model;
  const { L, D, H, railA: ar, railT: tr, postT: tp } = p;
  const u = Math.max(L + D, 1400) / 70;      // drawing module: paddings and text scale with it
  const fs = 1.25 * u, sw = 0.065 * u;

  const fx0 = 15 * u, top = 11 * u, gy = top + H;
  const sx0 = fx0 + L + 15 * u;
  const colW = Math.max(D, 30 * u);
  const W = sx0 + colW + 6 * u;
  const py0 = gy + 16 * u;
  const rowH = Math.max(D, 25 * u);
  const Ht = py0 + rowH + 13 * u;

  const out = [];
  const f = (v) => fmt(v, unit);
  const n = (v) => +v.toFixed(2);
  const line = (x1, y1, x2, y2, c = DIMC, w = sw * 0.8, extra = '') =>
    out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(w)}" ${extra}/>`);
  const rect = (x, y, w, h, fill, extra = '') =>
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.01))}" height="${n(Math.max(h, 0.01))}" fill="${fill}" stroke="${INK}" stroke-width="${n(sw)}" ${extra}/>`);
  const text = (x, y, s, a = '') => out.push(`<text x="${n(x)}" y="${n(y)}" ${a}>${s}</text>`);
  const tick = (x, y) => line(x - 0.32 * u, y + 0.32 * u, x + 0.32 * u, y - 0.32 * u, DIMC, sw * 1.3);
  const attrs = (key) => (key ? ` class="dim ed" data-key="${key}" tabindex="0" role="button"` : ' class="dim"');
  const title = (cx, y, s, sub) => {
    text(cx, y, s, 'text-anchor="middle" class="title"');
    if (sub) text(cx, y + 1.5 * fs, sub, 'text-anchor="middle" class="sub"');
  };

  const hdim = (segs, yRef, yLine) => {
    const dir = Math.sign(yLine - yRef) || 1;
    const xs = [...new Set(segs.flatMap((s) => [s.a, s.b]))];
    for (const x of xs) { line(x, yRef + dir * 0.5 * u, x, yLine + dir * 0.6 * u); tick(x, yLine); }
    line(Math.min(...xs), yLine, Math.max(...xs), yLine);
    for (const s of segs) text((s.a + s.b) / 2, yLine - 0.5 * u, s.label ?? f(s.mm), `text-anchor="middle"${attrs(s.key)}`);
  };
  const vdim = (ya, yb, label, key, xRef, xLine) => {
    const dir = Math.sign(xLine - xRef) || 1;
    for (const y of [ya, yb]) { line(xRef + dir * 0.5 * u, y, xLine + dir * 0.6 * u, y); tick(xLine, y); }
    line(xLine, ya, xLine, yb);
    const cx = xLine - 0.5 * u, cy = (ya + yb) / 2;
    text(cx, cy, label, `text-anchor="middle" transform="rotate(-90 ${n(cx)} ${n(cy)})"${attrs(key)}`);
  };
  // Vertical chain with labels on leaders, so short segments stay readable.
  const vchain = (segs, xRef, xLine, side = -1) => {
    const ysAll = [...new Set(segs.flatMap((s) => [s.a, s.b]))];
    for (const y of ysAll) { line(xRef + side * 0.5 * u, y, xLine + side * 0.6 * u, y); tick(xLine, y); }
    line(xLine, Math.min(...ysAll), xLine, Math.max(...ysAll));
    let prev = -Infinity;
    for (const s of [...segs].sort((a, b) => a.a + a.b - b.a - b.b)) {
      const mid = (s.a + s.b) / 2;
      const ty = Math.max(mid, prev + 1.6 * fs);
      prev = ty;
      line(xLine, mid, xLine + side * 1.1 * u, ty, DIMC, sw * 0.6);
      text(xLine + side * 1.5 * u, ty + 0.35 * fs, s.label ?? f(s.mm), `text-anchor="${side < 0 ? 'end' : 'start'}"${attrs(s.key)}`);
    }
  };

  // ----- projection of plates, boards and braces into a view -----
  const views = {
    front: { h: 'x', v: 'y', depth: 'z', X: (m) => fx0 + m.x, Y: (m) => gy - m.y - m.h, far: (a, b) => a.z - b.z },
    side: { h: 'z', v: 'y', depth: 'x', X: (m) => sx0 + m.z, Y: (m) => gy - m.y - m.h, far: (a, b) => b.x - a.x },
    plan: { h: 'x', v: 'z', depth: 'y', X: (m) => fx0 + m.x, Y: (m) => py0 + m.z, far: (a, b) => a.y - b.y },
  };
  const items = [];
  for (const part of model.parts) for (const pl of part.plates) items.push({ ...pl, kind: 'steel', fill: FILL[part.group], pl });
  for (const b of model.boards) items.push({ ...b, kind: 'board' });

  function holes(view, it) {
    const pl = it.pl;
    if (!pl.holes.length || pl.thick !== view.depth) return;
    const along = pl.len === view.h;
    let d = '';
    for (const h of pl.holes) {
      const pos = { [pl.len]: pl[pl.len] + h.u, [pl.wid]: pl[pl.wid] + h.v };
      const cx = view.h === 'x' ? fx0 + pos.x : sx0 + pos.z;
      const cy = view.v === 'y' ? gy - pos.y : py0 + pos.z;
      const r = h.d / 2, s = Math.max(0, (h.l || 0) - h.d) / 2;
      d += along
        ? `M${n(cx - s)} ${n(cy - r)}h${n(2 * s)}a${r} ${r} 0 0 1 0 ${2 * r}h${n(-2 * s)}a${r} ${r} 0 0 1 0 ${-2 * r}z`
        : `M${n(cx - r)} ${n(cy - s)}a${r} ${r} 0 0 1 ${2 * r} 0v${n(2 * s)}a${r} ${r} 0 0 1 ${-2 * r} 0z`;
    }
    out.push(`<path d="${d}" fill="#fff" stroke="${INK}" stroke-width="${n(sw * 0.45)}"/>`);
  }
  function drawView(name, { boards = true, boardOpacity = 1 } = {}) {
    const view = views[name];
    for (const part of model.braces) {
      const b = part.bar;
      if (name === 'front') {
        const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1), cx = fx0 + (b.x1 + b.x2) / 2, cy = gy - (b.y1 + b.y2) / 2;
        rect(-part.len / 2, -b.w / 2, part.len, b.w, FILL.brace, `transform="translate(${n(cx)} ${n(cy)}) rotate(${n((-ang * 180) / Math.PI)})" stroke-dasharray="${n(0.5 * u)} ${n(0.3 * u)}"`);
      } else if (name === 'side') rect(sx0 + b.z, gy - Math.max(b.y1, b.y2) - b.w / 2, b.t, Math.abs(b.y2 - b.y1) + b.w, FILL.brace);
      else rect(fx0 + Math.min(b.x1, b.x2) - b.em, py0 + b.z, Math.abs(b.x2 - b.x1) + 2 * b.em, b.t, FILL.brace);
    }
    for (const it of [...items].sort(view.far)) {
      if (it.kind === 'board') {
        if (boards) rect(view.X(it), view.Y(it), it[DIM[view.h]], it[DIM[view.v]], BOARD, `fill-opacity="${boardOpacity}"`);
        continue;
      }
      rect(view.X(it), view.Y(it), it[DIM[view.h]], it[DIM[view.v]], it.fill);
      holes(view, it);
    }
    if (name !== 'plan') {
      for (const ft of model.feet) {
        const c = name === 'front' ? fx0 + ft.x : sx0 + ft.z;
        out.push(`<path d="M${n(c - 5)} ${n(gy - ft.h)}h10v${n(ft.h * 0.6)}h14v${n(ft.h * 0.4)}h-38v${n(-ft.h * 0.4)}h14z" fill="${INK}"/>`);
      }
    }
  }

  // ---------- Front elevation ----------
  line(fx0 - 4 * u, gy, fx0 + L + 4 * u, gy, INK, sw * 0.6);
  drawView('front');
  hdim([{ a: fx0, b: fx0 + L, mm: L, key: 'L' }], top, top - 4 * u);
  const yl0 = ys[0] - ar;
  const chain = [{ a: gy - yl0, b: gy, mm: yl0, key: 'floorClear' }];
  if (ys.length > 1) chain.push({ a: gy - ys[0], b: gy - yl0, mm: ar });
  for (let i = 0; i < ys.length - 1; i++) chain.push({ a: gy - ys[i + 1], b: gy - ys[i], mm: ys[i + 1] - ys[i] });
  if (ys.length === 1) chain.push({ a: gy - H, b: gy - yl0, mm: ar });
  vchain(chain, fx0, fx0 - 3.2 * u);
  if (model.centres.length) {
    const xs = [0, ...model.centres.map((c) => c.c), L];
    hdim(xs.slice(0, -1).map((x, k) => ({ a: fx0 + x, b: fx0 + xs[k + 1], mm: xs[k + 1] - x })), gy, gy + 3.6 * u);
  }
  title(fx0 + L / 2, gy + 8 * u, 'FRONT ELEVATION', [model.braces.length ? 'back braces shown dashed' : '', model.split ? 'long rails spliced on the centre bars' : ''].filter(Boolean).join('  ·  '));

  // ---------- End elevation ----------
  line(sx0 - 3 * u, gy, sx0 + D + 5 * u, gy, INK, sw * 0.6);
  drawView('side');
  hdim([{ a: sx0, b: sx0 + D, mm: D, key: 'D' }], top, top - 4 * u);
  vdim(gy - H, gy, f(H), 'H', sx0 + D + 1.2 * u, sx0 + D + 4.2 * u);
  if (model.tiers.length) {
    vchain(model.tiers.map((t) => ({ a: gy - (ys[t.from + 1] - ar), b: gy - (ys[t.from] - Math.max(0, model.flush)), label: `${f(t.railClear)} clear` })),
      sx0 + D + 4.2 * u, sx0 + D + 7.6 * u, 1);
  }
  title(sx0 + D / 2, gy + 8 * u, 'END ELEVATION');

  // ---------- Plan ----------
  drawView('plan', { boardOpacity: 0.55, boards: true });
  const cs = model.stations.map((s) => s.c);
  if (cs.length > 2) hdim(cs.slice(0, -1).map((x, k) => ({ a: fx0 + x, b: fx0 + cs[k + 1], mm: cs[k + 1] - x })), py0, py0 - 3.6 * u);
  vdim(py0, py0 + D, f(D), 'D', fx0, fx0 - 3.6 * u);
  if (p.boards) {
    const bw = model.boards.filter((b) => b.level === ys.length - 1);
    for (const b of bw) {
      text(fx0 + b.x + b.w / 2, py0 + D / 2 + 0.4 * fs, `BOARD ${f(b.w)} × ${f(b.d)} × ${f(b.h)}`, 'text-anchor="middle" class="note strong"');
    }
  }
  title(fx0 + L / 2, py0 + D + 4.5 * u, 'PLAN', p.boards ? 'boards drop into the rail seats, no fixings' : 'frame only');

  // ---------- Detail: board seat ----------
  {
    const g = p.edgeGap, T = p.boardT, pk = p.packer;
    const zMax = tp + ar + Math.max(18, T * 0.9);
    const yMin = -Math.max(8, model.stations.length > 2 ? p.crossA - p.crossT - tr : 0) - 6, yMax = ar + 9;
    const k = Math.min((colW * 0.42) / (zMax + 8), ((rowH - 4 * u) * 0.8) / (yMax - yMin));
    const ox = sx0 + colW * 0.04, oy = py0 + (rowH - 4 * u) * 0.5 + ((yMax + yMin) / 2) * k;
    const X = (z) => ox + z * k, Y = (y) => oy - y * k;
    const box = (z0, y0, z1, y1, fill, extra = '') => rect(X(z0), Y(y1), (z1 - z0) * k, (y1 - y0) * k, fill, extra);
    out.push(`<defs><pattern id="hatch" width="${n(0.9 * u)}" height="${n(0.9 * u)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${n(0.9 * u)}" height="${n(0.9 * u)}" fill="${BOARD}"/><line x1="0" y1="0" x2="0" y2="${n(0.9 * u)}" stroke="#a98a55" stroke-width="${n(sw)}"/></pattern></defs>`);
    box(0, yMin + 2, tp, yMax - 2, FILL.post);
    if (model.stations.length > 2) {
    }
    box(tp, 0, tp + tr, ar, FILL.rail);
    box(tp + tr, 0, tp + ar, tr, FILL.rail);
    if (model.stations.length > 2) {
      box(tp + ar + 2, tr - (p.crossA - p.crossT), tp + ar + 2 + Math.max(3, zMax - tp - ar - 2), tr, FILL.cross, 'fill-opacity="0.55"');
      box(tp + tr + 1, tr, zMax, tr + p.crossT, FILL.cross);
    }
    if (p.boards) {
      if (pk > p.crossT || model.stations.length <= 2) { if (pk > 0) box(tp + tr + g, tr, tp + ar, tr + pk, '#3a3d42'); }
      box(tp + tr + g, tr + pk, zMax, tr + pk + T, 'url(#hatch)');
    }
    // bolt through post flange and rail upright
    const by = (ar + tr) / 2, inH = model.headIn, outH = p.head === 'button' ? B.nut : B.hex;
    box(-outH, by - B.af / 2, 0, by + B.af / 2, '#d0d4d9');
    box(tp + tr, by - B.d * 0.9, tp + tr + inH, by + B.d * 0.9, '#d0d4d9', `rx="${n(inH * k * 0.4)}"`);
    line(X(-outH - 2), Y(by), X(tp + tr + inH + 2), Y(by), INK, sw * 0.5, `stroke-dasharray="${n(0.5 * u)} ${n(0.25 * u)}"`);
    // labels on leaders to the right
    const lx = X(zMax) + 1.6 * u;
    const lab = (z, y, row, s) => {
      const ty = py0 + 1.5 * u + row * 2.1 * fs;
      line(X(z), Y(y), lx - 0.4 * u, ty - 0.35 * fs, DIMC, sw * 0.6);
      out.push(`<circle cx="${n(X(z))}" cy="${n(Y(y))}" r="${n(0.16 * u)}" fill="${DIMC}"/>`);
      text(lx, ty, s, 'class="dim"');
    };
    let row = 0;
    if (p.boards) {
      const fl = model.flush;
      lab(tp + tr / 2, ar, row++, Math.abs(fl) < 0.6 ? 'Board flush with rail top' : fl > 0 ? `Rail lip ${f(fl)} above board` : `Board ${f(-fl)} proud`);
      lab(zMax - 6, tr + pk + T / 2, row++, `${p.boardMat.toUpperCase()} board ${f(T)}`);
      lab(tp + tr + g / 2, tr + pk + T * 0.75, row++, `Edge gap ${f(g)}`);
      if (pk > 0) lab(tp + ar - 4, tr + pk / 2, row++, `Seat strip ${f(pk)}`);
    }
    lab(tp + ar - 2, tr / 2, row++, `Rail ${ar} × ${ar} × ${tr} angle`);
    lab(tp + tr + inH / 2, by, row++, `M${B.d} ${p.head === 'button' ? 'button head inside, nut outside' : 'hex head outside, nut inside'}`);
    lab(tp / 2, yMin + 6, row++, `Post ${p.postA} × ${p.postA} × ${tp} angle`);
    if (model.stations.length > 2) lab(zMax - 4, tr + p.crossT / 2, row++, `Cross bearer ${p.crossA} × ${p.crossA} × ${p.crossT}, drops in`);
    title(sx0 + colW / 2, py0 + rowH + 0.5 * u, 'DETAIL A  ·  BOARD SEAT', 'section through a long rail');
  }

  // ---------- Title block ----------
  const by0 = Ht - 5.2 * u;
  line(3 * u, by0, W - 3 * u, by0, INK, sw * 0.8);
  text(3 * u, by0 + 2.2 * fs, esc(p.name).toUpperCase(), 'class="title"');
  text(3 * u, by0 + 3.8 * fs, `${f(L)} × ${f(D)} × ${f(H)}  (L × D × H)   ·   ${ys.length} ${ys.length === 1 ? 'level' : 'levels'}   ·   steel ${model.steelKg.toFixed(1)} kg   ·   boards ${model.boardKg.toFixed(1)} kg`, 'class="note"');
  text(W - 3 * u, by0 + 2.2 * fs, `Posts ${p.postA}×${p.postA}×${tp}${p.slotPosts ? ' slotted' : ''}  ·  Rails ${ar}×${ar}×${tr}${p.slotRails ? ' slotted' : ''}  ·  M${B.d} bolts`, 'class="note" text-anchor="end"');
  text(W - 3 * u, by0 + 3.8 * fs, `Dimensions in ${unit === 'in' ? 'inches' : unit}  ·  ${new Date().toISOString().slice(0, 10)}`, 'class="note" text-anchor="end"');

  return `<svg class="rd" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(Ht)}" font-family="ui-sans-serif, -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif" font-size="${n(fs)}">
<style>
  .rd text{fill:${INK}}
  .rd .dim{fill:${DIMC};paint-order:stroke;stroke:#fff;stroke-width:${n(0.34 * u)}px;stroke-linejoin:round;font-variant-numeric:tabular-nums}
  .rd .ed{cursor:pointer;font-weight:650;text-decoration:underline;text-decoration-style:dotted}
  .rd .ed:hover,.rd .ed:focus{fill:#d6336c;outline:none}
  .rd .title{font-weight:700;letter-spacing:${n(0.09 * u)}px;font-size:${n(fs * 1.02)}px}
  .rd .sub{fill:#6e6e73;font-size:${n(fs * 0.86)}px}
  .rd .note{font-size:${n(fs * 0.92)}px;fill:#3a3a3c}
  .rd .strong{font-weight:650;paint-order:stroke;stroke:#fff;stroke-opacity:.7;stroke-width:${n(0.3 * u)}px}
</style>
<rect width="${n(W)}" height="${n(Ht)}" fill="#fff"/>
${out.join('\n')}
</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
