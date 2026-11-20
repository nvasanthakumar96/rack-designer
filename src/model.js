// Parametric model of a bolted steel rack with drop-in boards.
//
// Construction (what the fabricator and the carpenter actually build):
//   - Corner posts are L-angles, flanges on the two outside faces.
//   - Rails are L-angles turned into a seat: upright flange bolted to the inside of the
//     post flange, the other flange pointing inwards. The board drops into that seat and
//     is held by the upright flanges on all four sides. No screws, no bolts in the board.
//   - Centre supports are flat bars on the outside face of the long rails, in the same
//     plane as the post flanges, so nothing passes through the board.
//   - Cross bearers are angles that simply drop onto the rail seats under the board.
//   - The rack ships as a kit: no welding, one bolt size, and with sizes snapped to the
//     slot pitch every bolt meets a punched slot, so nothing is drilled on site. Bars
//     longer than the dispatch length are split at a centre support, which doubles as
//     the splice plate.
//
// Everything (3D view, drawings, cut list, checks) is generated from buildModel(params).
// Units: mm. Axes: X = length, Y = up, Z = depth (back is z = 0, front is z = D).

export const BOLTS = {
  6: { d: 6, hole: 7, nut: 5, af: 10, button: 3.3, hex: 4, csk: 3.3, washer: 1.6 },
  8: { d: 8, hole: 9, nut: 6.5, af: 13, button: 4.4, hex: 5.3, csk: 4.4, washer: 1.6 },
  10: { d: 10, hole: 11, nut: 8, af: 17, button: 5.5, hex: 6.4, csk: 5.5, washer: 2 },
};
const BOLT_LENGTHS = [10, 12, 16, 20, 25, 30, 35, 40, 50];

export const BOARD_MATS = {
  hdmr: { label: 'HDMR', rho: 850e-9 },
  ply: { label: 'Plywood', rho: 650e-9 },
  mdf: { label: 'MDF', rho: 750e-9 },
};
export const STEEL_COLORS = {
  black: { label: 'Black', hex: '#2a2c30' },
  graphite: { label: 'Graphite', hex: '#565c66' },
  white: { label: 'White', hex: '#e6e7ea' },
  blue: { label: 'Blue', hex: '#234f8c' },
  zinc: { label: 'Zinc', hex: '#a9afb8' },
};
export const BOARD_COLORS = {
  natural: { label: 'Natural', hex: '#d9bb8d' },
  white: { label: 'White', hex: '#efede7' },
  walnut: { label: 'Walnut', hex: '#6f4d36' },
  grey: { label: 'Grey', hex: '#8e9299' },
};

export const DEFAULTS = {
  name: 'Printer workstation',
  L: 2400, D: 700, H: 1220,
  levels: 2, floorClear: 100, spacing: 'even', customLevels: [], snap: true,
  postA: 40, postT: 3, slotPosts: true,
  railA: 30, railT: 3, slotRails: true,
  bays: 2, flatW: 40, flatT: 8, slotCentre: true,
  crossPerBay: 1, crossType: 'angle', crossA: 30, crossT: 2, slotCross: true,
  bolt: 6, head: 'button', pitch: 19,
  boards: true, boardMat: 'hdmr', boardT: 25, packer: 2, edgeGap: 4, sheetL: 2440, sheetW: 1220,
  footType: 'leveller', footH: 30,
  brace: 'knee', braceW: 25, braceT: 3,
  stockLen: 3000, kerf: 3, load: 80, maxPiece: 1250,
  steelColor: 'black', boardColor: 'natural',
};

export const PRESETS = [
  { id: 'workstation', label: 'Printer workstation', note: '240 × 70 × 122 cm, 2 shelves', params: {} },
  { id: 'bench', label: 'Compact bench', note: '120 × 60 × 90 cm, 2 shelves',
    params: { name: 'Compact bench', L: 1200, D: 600, H: 900, bays: 1, crossPerBay: 1, floorClear: 120 } },
  { id: 'storage', label: 'Storage rack', note: '90 × 45 × 183 cm, 5 shelves',
    params: { name: 'Storage rack', L: 900, D: 450, H: 1830, levels: 5, bays: 1, crossPerBay: 1, floorClear: 120,
              boardT: 18, railA: 25, packer: 4, load: 60, boardMat: 'ply', maxPiece: 1850 } },
  { id: 'garage', label: 'Heavy garage rack', note: '180 × 60 × 180 cm, 4 shelves, M8',
    params: { name: 'Garage rack', L: 1800, D: 600, H: 1800, levels: 4, bays: 2, crossPerBay: 1, floorClear: 150,
              postA: 50, postT: 5, railA: 40, railT: 5, crossA: 40, crossT: 5, flatW: 50, flatT: 8, bolt: 8,
              boardT: 30, packer: 5, edgeGap: 5, load: 200, steelColor: 'blue', boardMat: 'ply', maxPiece: 1850 } },
];

export const LIMITS = {
  L: [300, 6000], D: [250, 1500], H: [300, 3000], levels: [1, 8], floorClear: [0, 600],
  postA: [20, 100], postT: [1.5, 10], railA: [20, 100], railT: [1.5, 10],
  bays: [1, 8], flatW: [20, 100], flatT: [2, 12], crossPerBay: [0, 4], crossA: [20, 80], crossT: [1.5, 8],
  pitch: [12, 60], boardT: [6, 50], packer: [0, 30], edgeGap: [0, 15], sheetL: [600, 3660], sheetW: [300, 1830],
  footH: [0, 150], braceW: [15, 60], braceT: [2, 8], stockLen: [1000, 12000], kerf: [0, 6], load: [0, 1000], maxPiece: [600, 6000],
};
const INTS = ['levels', 'bays', 'crossPerBay'];
const BOOLS = ['snap', 'slotPosts', 'slotRails', 'slotCentre', 'slotCross', 'boards'];
const ENUMS = {
  spacing: ['even', 'custom'], crossType: ['angle', 'flat'], head: ['button', 'hex'], footType: ['leveller', 'cap', 'none'],
  brace: ['knee', 'x', 'single', 'none'], boardMat: Object.keys(BOARD_MATS),
  steelColor: Object.keys(STEEL_COLORS), boardColor: Object.keys(BOARD_COLORS),
};

const minGapOf = (q) => q.railA + q.boardT + 80;
const snapOn = (q) => q.snap && q.slotPosts;

// Top-of-rail height of every level, lowest first. The top level is always at H.
export function levelHeights(q) {
  const n = q.levels, lowest = q.floorClear + q.railA, gap = minGapOf(q);
  const ys = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) ys.push(q.H);
    else if (i === 0) ys.push(lowest);
    else if (q.spacing === 'custom' && Number.isFinite(q.customLevels[i - 1])) ys.push(q.customLevels[i - 1]);
    else ys.push(lowest + ((q.H - lowest) * i) / (n - 1));
  }
  const step = snapOn(q) ? q.pitch : 0;
  const floorMin = Math.max(q.footH, interiorStations(q) > 0 ? q.crossA + 5 : 0) + q.railA;
  for (let i = n - 2; i >= 0; i--) {
    let y = Math.min(ys[i], ys[i + 1] - gap);
    if (step) {
      y = q.H - Math.round((q.H - y) / step) * step;
      while (y > ys[i + 1] - gap) y -= step;
    }
    ys[i] = y;
  }
  if (step) while (n > 1 && ys[0] < floorMin) ys[0] += step;
  return ys;
}

const interiorStations = (q) => q.bays * (q.crossPerBay + 1) - 1;

// Clamp a parameter set so the geometry is always buildable.
export function sanitize(input) {
  const q = { ...DEFAULTS, ...input };
  for (const k in LIMITS) {
    const [lo, hi] = LIMITS[k];
    q[k] = Number(q[k]);
    if (!Number.isFinite(q[k])) q[k] = DEFAULTS[k];
    q[k] = Math.min(hi, Math.max(lo, q[k]));
  }
  for (const k of INTS) q[k] = Math.round(q[k]);
  for (const k of BOOLS) q[k] = !!q[k];
  for (const k in ENUMS) if (!ENUMS[k].includes(q[k])) q[k] = DEFAULTS[k];
  q.bolt = BOLTS[q.bolt] ? Number(q.bolt) : DEFAULTS.bolt;
  q.name = String(q.name ?? '').slice(0, 60) || DEFAULTS.name;

  q.postT = Math.min(q.postT, q.postA / 4);
  q.railT = Math.min(q.railT, q.railA / 4);
  q.crossT = Math.min(q.crossT, q.crossA / 4);
  q.bays = Math.min(q.bays, Math.max(1, Math.floor(q.L / 250)));
  q.pitch = Math.max(q.pitch, BOLTS[q.bolt].hole + 6);
  q.D = Math.max(q.D, 2 * (q.postT + q.railA) + 120);
  // Kit sizes: the bolt gauge lines of opposite posts sit a whole number of pitches apart,
  // so both ends of every rail meet a punched slot.
  if (q.snap && q.slotRails) {
    const g = q.postA + q.postT;
    q.L = g + Math.round((q.L - g) / q.pitch) * q.pitch;
    q.D = g + Math.round((q.D - g) / q.pitch) * q.pitch;
  }
  if (q.footType === 'none') q.footH = 0;
  else q.footH = Math.max(q.footH, q.footType === 'cap' ? 3 : 15);

  q.floorClear = Math.max(q.floorClear, q.footH, interiorStations(q) > 0 ? q.crossA + 5 : 0);
  const lowest = q.floorClear + q.railA, gap = minGapOf(q);
  q.H = Math.max(q.H, lowest);
  q.levels = Math.max(1, Math.min(q.levels, 1 + Math.floor((q.H - lowest) / gap)));
  if (q.levels < 3) q.spacing = 'even';

  // Custom spacing keeps one height per intermediate level.
  const mids = q.levels - 2;
  const even = (i) => lowest + ((q.H - lowest) * i) / (q.levels - 1);
  const src = Array.isArray(q.customLevels) ? q.customLevels : [];
  const out = [];
  for (let i = 0; i < mids; i++) {
    let v = Number(src[i]);
    if (q.spacing !== 'custom' || !Number.isFinite(v)) v = even(i + 1);
    const lo = (i ? out[i - 1] : lowest) + gap, hi = q.H - gap * (mids - i);
    out.push(Math.min(hi, Math.max(lo, v)));
  }
  q.customLevels = out;
  return q;
}

// ---------------------------------------------------------------------------

const DIM = { x: 'w', y: 'h', z: 'd' };
const AXES = ['x', 'y', 'z'];
const mod = (a, n) => ((a % n) + n) % n;

// Section properties of an equal angle about the axis parallel to a leg (mm units).
export function angleProps(a, t) {
  const A = t * (2 * a - t);
  const c = (a * a + a * t - t * t) / (2 * (2 * a - t));
  const I = (t * a ** 3 + (a - t) * t ** 3) / 3 - A * c * c;
  return { A, c, I, Z: I / (a - c) };
}

export function buildModel(input) {
  const p = sanitize(input);
  const B = BOLTS[p.bolt];
  const { L, D, H, postA: ap, postT: tp, railA: ar, railT: tr, crossA: ac, crossT: tc, pitch } = p;
  const ys = levelHeights(p);
  const parts = [], bolts = [], boards = [], feet = [], checks = [];

  // Slot punching: a round hole and an elongated slot alternate at every pitch.
  let slotLen = Math.min(B.hole * 2.4, 2 * pitch - B.hole - 8);
  if (slotLen < B.hole + 2) slotLen = 0;

  const steel = (group, name, profile, dims, len, lenAxis, s0, slotted) => {
    const part = { group, name, profile, ...dims, len, lenAxis, s0, slotted, plates: [], drill: [], notes: [] };
    parts.push(part);
    return part;
  };
  // One flat piece of steel. `row` is the gauge line (across the width) and `off` the
  // position of one slot centre along the length, both measured from the plate's corner.
  const plate = (part, box, thick, row, off) => {
    const len = part.lenAxis;
    const wid = AXES.find((a) => a !== len && a !== thick);
    const pl = { ...box, len, wid, thick, row, off, joints: [], holes: [], part };
    part.plates.push(pl);
    return pl;
  };
  // A bolt through a stack of plates. `out` is the direction (+1 / -1 along the axis)
  // that faces away from the rack, which is where the nut goes.
  const boltKeys = new Map();
  const joint = (pos, axis, plates, { out, kind, extra = 0 }) => {
    const lo = Math.min(...plates.map((pl) => pl[axis])) - (out < 0 ? extra : 0);
    const hi = Math.max(...plates.map((pl) => pl[axis] + pl[DIM[axis]])) + (out > 0 ? extra : 0);
    const key = [axis, pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1)].join();
    const seen = boltKeys.get(key);
    if (seen) { seen.lo = Math.min(seen.lo, lo); seen.hi = Math.max(seen.hi, hi); return; }
    for (const pl of plates) {
      pl.joints.push({ u: pos[pl.len] - pl[pl.len], v: pos[pl.wid] - pl[pl.wid], csk: kind === 'csk' && pl === plates[0] });
    }
    const b = { x: pos.x, y: pos.y, z: pos.z, axis, lo, hi, out, kind };
    boltKeys.set(key, b);
    bolts.push(b);
  };

  // ---------- corner posts ----------
  const yb = p.footH, postLen = H - yb;
  const gaugeY = (yTop) => yTop - (ar - tr) / 2;           // bolt height in a rail's upright flange
  const postOff = mod(gaugeY(H) - yb, pitch);
  const gx = (sx) => (sx ? L - (ap + tp) / 2 : (ap + tp) / 2);   // gauge line of a post flange
  const gz = (sz) => (sz ? D - (ap + tp) / 2 : (ap + tp) / 2);
  const posts = [[], []];
  for (const sx of [0, 1]) for (const sz of [0, 1]) {
    const part = steel('post', 'Corner post', 'angle', { a: ap, t: tp }, postLen, 'y', yb, p.slotPosts);
    const fz = plate(part, { x: sx ? L - ap : 0, y: yb, z: sz ? D - tp : 0, w: ap, h: postLen, d: tp }, 'z',
      sx ? (ap - tp) / 2 : (ap + tp) / 2, postOff);
    const fx = plate(part, { x: sx ? L - tp : 0, y: yb, z: sz ? D - ap : tp, w: tp, h: postLen, d: ap - tp }, 'x',
      (ap - tp) / 2, postOff);
    posts[sx][sz] = { fz, fx };
    if (p.footType !== 'none') feet.push({ x: sx ? L - ap / 2 : ap / 2, z: sz ? D - ap / 2 : ap / 2, h: yb, type: p.footType });
  }

  // ---------- centre supports (flat bar, outside face of the long rails) ----------
  // Long rails are split at every centre support when they are too long to dispatch.
  const split = p.bays > 1 && L - 2 * tp > p.maxPiece;
  const onGrid = p.snap && p.slotRails;
  const centres = [];
  for (let k = 1; k < p.bays; k++) {
    let c = (L * k) / p.bays;
    // A splice needs a bolt each side of the joint, so the joint sits half a pitch off the grid.
    if (onGrid) c = gx(0) + (Math.round((c - gx(0)) / pitch - (split ? 0.5 : 0)) + (split ? 0.5 : 0)) * pitch;
    const pair = [];
    for (const sz of [0, 1]) {
      const part = steel('centre', 'Centre support', 'flat', { w: p.flatW, t: p.flatT }, postLen, 'y', yb, p.slotCentre);
      const bar = plate(part, { x: c - p.flatW / 2, y: yb, z: sz ? D - tp : tp - p.flatT, w: p.flatW, h: postLen, d: p.flatT },
        'z', p.flatW / 2, postOff);
      // A splice bar carries two bolts side by side, so it is punched in two rows.
      if (split) { const o = onGrid ? pitch / 2 : p.flatW / 4; bar.rows = [p.flatW / 2 - o, p.flatW / 2 + o]; }
      pair.push(bar);
      if (p.footType !== 'none') feet.push({ x: c, z: sz ? D - tp - 12 : tp + 12, h: yb, type: p.footType });
    }
    centres.push({ c, pair, bolts: split ? [c - (onGrid ? pitch / 2 : p.flatW / 4), c + (onGrid ? pitch / 2 : p.flatW / 4)] : [c] });
  }

  // ---------- stations: every place a member crosses the depth ----------
  const nSt = p.bays * (p.crossPerBay + 1);
  const stations = [];
  const legX = [0, ...centres.map((c) => c.c), L];
  for (let i = 0; i <= nSt; i++) {
    const k = Math.floor(i / (p.crossPerBay + 1)), r = i % (p.crossPerBay + 1);
    const c = r === 0 ? legX[k] : legX[k] + ((legX[k + 1] - legX[k]) * r) / (p.crossPerBay + 1);
    stations.push({ i, c, end: i === 0 || i === nSt, leg: r === 0 });
  }
  const interior = stations.filter((s) => !s.end);

  // ---------- rails, cross supports, boards, level by level ----------
  const railOff = mod((ap - tp) / 2, pitch);
  const seatW = ar - tr;
  const cope = seatW + 1;
  const xi = tp + tr + p.edgeGap;                // board edge, measured from the outside of the post
  const boardL = L - 2 * xi, boardD = D - 2 * xi;
  const nPieces = Math.max(1, Math.ceil(boardL / p.sheetL));
  const cuts = [];                               // board joints, each one over a cross support
  for (let j = 1; j < nPieces; j++) {
    const target = xi + (boardL * j) / nPieces;
    const st = interior.reduce((best, s) => (!best || Math.abs(s.c - target) < Math.abs(best.c - target) ? s : best), null);
    if (st && !cuts.includes(st.c)) cuts.push(st.c);
  }
  cuts.sort((a, b) => a - b);

  const rails = [];                              // back long-rail uprights per level, for the braces
  ys.forEach((yTop, li) => {
    const yl = yTop - ar;
    const backUp = [];
    for (const sz of [0, 1]) {
      const ends = split ? [tp, ...centres.flatMap((c) => [c.c - 1, c.c + 1]), L - tp] : [tp, L - tp];
      const out = { out: sz ? 1 : -1, kind: 'frame' }, zf = sz ? D - tp : tp;
      for (let k = 0; k < ends.length; k += 2) {
        const x0 = ends[k], len = ends[k + 1] - x0;
        const xb = [gx(0), ...centres.flatMap((c) => c.bolts), gx(1)].filter((x) => x > x0 && x < x0 + len);
        const off = mod(xb[0] - x0, pitch);
        const part = steel('rail', 'Long rail', 'angle', { a: ar, t: tr }, len, 'x', x0, p.slotRails);
        const up = plate(part, { x: x0, y: yl, z: sz ? D - tp - tr : tp, w: len, h: ar, d: tr }, 'z', (ar + tr) / 2, off);
        plate(part, { x: x0, y: yl, z: sz ? D - tp - ar : tp + tr, w: len, h: tr, d: seatW }, 'y', seatW / 2, off);
        if (!sz) backUp.push(up);
        for (const x of xb) {
          const ci = centres.findIndex((c) => c.bolts.includes(x));
          const other = ci >= 0 ? centres[ci].pair[sz] : posts[x > L / 2 ? 1 : 0][sz].fz;
          joint({ x, y: gaugeY(yTop), z: zf }, 'z', [other, up], out);
        }
      }
    }
    for (const sx of [0, 1]) {
      const z0 = tp + tr, len = D - 2 * z0;
      const part = steel('rail', 'End rail', 'angle', { a: ar, t: tr }, len, 'z', z0, p.slotRails);
      part.notes.push(`Notch the seat flange ${cope.toFixed(0)} mm back at both ends`);
      const endOff = mod((ap - tp) / 2 - tr, pitch);
      const up = plate(part, { x: sx ? L - tp - tr : tp, y: yl, z: z0, w: tr, h: ar, d: len }, 'x', (ar + tr) / 2, endOff);
      plate(part, { x: sx ? L - tp - ar : tp + tr, y: yl, z: z0 + cope, w: seatW, h: tr, d: len - 2 * cope }, 'y', seatW / 2, endOff - cope);
      for (const sz of [0, 1]) {
        joint({ x: sx ? L - tp : tp, y: gaugeY(yTop), z: gz(sz) }, 'x', [posts[sx][sz].fx, up], { out: sx ? 1 : -1, kind: 'frame' });
      }
    }
    for (const st of interior) {
      // Bearer: lies on the two seats under the board. No bolts; the board and the rail uprights trap it.
      const z0 = tp + tr + 1, len = D - 2 * z0, back = seatW + 1;
      const x0 = st.c - ac / 2;
      if (p.crossType === 'flat') {
        // Flat bar: nothing to notch and it packs flat, but it adds almost no stiffness.
        const part = steel('cross', 'Cross bearer', 'flat', { w: ac, t: tc }, len, 'z', z0, false);
        part.notes.push('Drops onto the seats, no bolts');
        plate(part, { x: x0, y: yl + tr, z: z0, w: ac, h: tc, d: len }, 'y', ac / 2, pitch / 2);
        continue;
      }
      const part = steel('cross', 'Cross bearer', 'angle', { a: ac, t: tc }, len, 'z', z0, p.slotCross);
      part.notes.push(`Cut the down flange ${back.toFixed(0)} mm back at both ends. Drops onto the seats, no bolts`);
      plate(part, { x: x0, y: yl + tr, z: z0, w: ac, h: tc, d: len }, 'y', (ac + tc) / 2, pitch / 2);
      plate(part, { x: x0, y: yl + tr - (ac - tc), z: z0 + back, w: tc, h: ac - tc, d: len - 2 * back }, 'x', (ac - tc) / 2, pitch / 2 - back);
    }
    rails.push(backUp);
    if (p.boards) {
      const edges = [xi, ...cuts, L - xi];
      for (let k = 0; k < edges.length - 1; k++) {
        const x0 = edges[k] + (k ? 0.5 : 0), x1 = edges[k + 1] - (k < edges.length - 2 ? 0.5 : 0);
        boards.push({
          level: li, name: li === ys.length - 1 ? 'Top board' : `Shelf ${li + 1} board`,
          x: x0, y: yl + tr + p.packer, z: xi, w: x1 - x0, h: p.boardT, d: boardD,
        });
      }
    }
  });

  // ---------- back bracing (flat bar, outside the back face) ----------
  const braces = [];
  if (p.brace === 'knee') {
    // Short diagonals between a back post and the rail beside it. Both ends are a whole
    // number of pitches from the corner bolt, so they pick up existing slots.
    const em = Math.max(15, 2 * B.d);
    ys.forEach((yTop, li) => {
      const yr = gaugeY(yTop);
      const lower = li > 0 ? ys[li - 1] + 15 : yb + 15, upper = li < ys.length - 1 ? ys[li + 1] - ar - 15 : -Infinity;
      for (const sx of [0, 1]) {
        const up = sx ? rails[li][rails[li].length - 1] : rails[li][0];
        const railRoom = sx ? gx(1) - up.x - em : up.x + up.w - gx(0) - em;
        const nMax = Math.min(Math.round(280 / pitch), Math.floor(railRoom / pitch));
        let down = nMax, rise = nMax;
        while (down > 0 && yr - down * pitch < lower) down--;
        while (rise > 0 && yr + rise * pitch > upper) rise--;
        const dir = down >= rise ? -1 : 1, n = Math.max(down, rise);
        if (n < 5) continue;
        const x2 = gx(sx) + (sx ? -1 : 1) * n * pitch, y1 = yr + dir * n * pitch;
        const span = Math.hypot(n * pitch, n * pitch);
        const part = steel('brace', 'Corner brace', 'flat', { w: p.braceW, t: p.braceT }, span + 2 * em, 'x', 0, false);
        part.bar = { x1: gx(sx), y1, x2, y2: yr, z: -p.braceT, w: p.braceW, t: p.braceT, em };
        part.drill.push({ face: 'A', u: em }, { face: 'A', u: span + em });
        braces.push(part);
        joint({ x: gx(sx), y: y1, z: 0 }, 'z', [posts[sx][0].fz], { out: -1, kind: 'frame', extra: p.braceT });
        joint({ x: x2, y: yr, z: 0 }, 'z', [up], { out: -1, kind: 'frame', extra: tp + p.braceT });
      }
    });
  } else if (p.brace !== 'none' && ys.length > 1) {
    const xs = [gx(0), ...centres.map((c) => c.c), gx(1)];
    const backPlate = (k) => (k === 0 ? posts[0][0].fz : k === xs.length - 1 ? posts[1][0].fz : centres[k - 1].pair[0]);
    const yLo = gaugeY(ys[0]) + Math.ceil((seatW / 2 + 12) / pitch) * pitch;
    const yHi = gaugeY(H) - Math.ceil((ar + 12) / pitch) * pitch;
    const proud = centres.length ? Math.max(0, p.flatT - tp) : 0;   // braces clear the centre bars
    const em = Math.max(15, 2 * B.d);
    if (yHi - yLo > 150) {
      for (let k = 0; k < xs.length - 1; k++) {
        const runs = p.brace === 'x' ? [[yLo, yHi, 0], [yHi, yLo, 1]] : [k % 2 ? [yHi, yLo, 1] : [yLo, yHi, 0]];
        for (const [y1, y2, layer] of runs) {
          const span = Math.hypot(xs[k + 1] - xs[k], y2 - y1);
          const part = steel('brace', 'Back brace', 'flat', { w: p.braceW, t: p.braceT }, span + 2 * em, 'x', 0, false);
          part.bar = { x1: xs[k], y1, x2: xs[k + 1], y2, z: -proud - (layer + 1) * p.braceT, w: p.braceW, t: p.braceT, em };
          part.drill.push({ face: 'A', u: em }, { face: 'A', u: span + em });
          braces.push(part);
          for (const [kk, y] of [[k, y1], [k + 1, y2]]) {
            const pl = backPlate(kk);
            joint({ x: xs[kk], y, z: 0 }, 'z', [pl], { out: -1, kind: 'brace', extra: pl.z + proud + (layer + 1) * p.braceT });
          }
        }
      }
    }
  }

  // ---------- punch the holes ----------
  // Slotted stock gets its regular pattern. A joint that lands on the pattern uses the
  // existing slot; one that does not, or any joint in plain bar, is a hole to drill.
  const flangeLen = parts.reduce((s, part) => s + (part.slotted ? part.plates.reduce((a, pl) => a + pl[DIM[pl.len]], 0) : 0), 0);
  const lod = flangeLen / pitch > 9000;
  let drilled = 0, onPattern = 0;
  for (const part of parts) {
    part.plates.forEach((pl, fi) => {
      const len = pl[DIM[pl.len]], feats = [];
      if (part.slotted) {
        const e = B.hole / 2 + 3;
        for (const row of pl.rows || [pl.row]) {
          for (let i = Math.ceil((e - pl.off) / pitch); pl.off + i * pitch <= len - e; i++) {
            feats.push({ u: pl.off + i * pitch, v: row, d: B.hole, l: mod(i, 2) ? slotLen : 0 });
          }
        }
      }
      for (const j of pl.joints) {
        const hit = !j.csk && feats.find((f) => Math.abs(f.v - j.v) < 0.8 && Math.abs(f.u - j.u) <= (f.l ? (f.l - f.d) / 2 : 0) + 1.05);
        if (hit) { onPattern++; continue; }
        for (let k = feats.length - 1; k >= 0; k--) {
          const f = feats[k];
          if (Math.abs(f.v - j.v) < f.d + 3 && Math.abs(f.u - j.u) < ((f.l || f.d) + B.hole) / 2 + 3) feats.splice(k, 1);
        }
        feats.push({ u: j.u, v: j.v, d: B.hole, l: 0, drilled: true, csk: j.csk });
        part.drill.push({ face: 'AB'[fi] || 'A', u: pl[pl.len] + j.u - part.s0 });
        drilled++;
      }
      pl.holes = lod ? feats.filter((f) => f.drilled) : feats;
    });
    part.drill.sort((a, b) => a.face.localeCompare(b.face) || a.u - b.u);
  }

  // ---------- derived numbers ----------
  const flush = ar - tr - p.packer - p.boardT;          // + = board sits below the rail top
  const headIn = p.head === 'button' ? B.button : B.nut + 2;
  const tiers = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const surface = ys[i] - Math.max(0, flush);
    tiers.push({ from: i, clear: ys[i + 1] - ar - (interior.length && p.crossType === 'angle' ? Math.max(0, ac - tc - tr) : 0) - surface, railClear: ys[i + 1] - ar - surface });
  }
  const bayPitch = L / p.bays, stationPitch = L / nSt;
  const mat = BOARD_MATS[p.boardMat];
  const boardKg = boards.reduce((s, b) => s + b.w * b.h * b.d * mat.rho, 0);
  const STEEL = 7.85e-6;
  for (const part of parts) {
    const area = part.profile === 'angle' ? part.t * (2 * part.a - part.t) : part.w * part.t;
    part.kg = area * part.len * STEEL;
  }
  const steelKg = parts.reduce((s, part) => s + part.kg, 0);
  const grip = (b) => b.hi - b.lo;
  for (const b of bolts) {
    const need = grip(b) + (b.kind === 'csk' ? 0 : B.washer) + B.nut + 2;
    b.len = BOLT_LENGTHS.find((l) => l >= need) ?? Math.ceil(need / 5) * 5;
  }

  // ---------- checks: what a fabricator or carpenter would ask before cutting ----------
  const mm = (v) => `${+v.toFixed(1)} mm`;
  const ok = (title, detail) => checks.push({ level: 'ok', title, detail });
  const note = (title, detail, fix) => checks.push({ level: 'info', title, detail, fix });
  const warn = (title, detail, fix) => checks.push({ level: 'warn', title, detail, fix });

  if (p.boards) {
    if (Math.abs(flush) < 0.6) ok('Boards sit flush', `Board top is level with the top of the rails (${mm(p.boardT)} board on a ${mm(p.packer)} seat strip in ${ar} × ${tr} angle).`);
    else {
      const want = ar - tr - p.boardT;
      const fix = want >= 0 && want <= LIMITS.packer[1] ? { label: `Set seat strip to ${mm(want)}`, patch: { packer: +want.toFixed(1) } }
        : { label: `Use ${Math.ceil((p.boardT + tr + p.packer) / 5) * 5} mm rails`, patch: { railA: Math.ceil((p.boardT + tr + p.packer) / 5) * 5 } };
      if (flush > 0) note(`Boards sit ${mm(flush)} below the rail top`, 'The rails form a raised lip around each board. Pack the seat or use a thicker board for a flush top.', fix);
      else warn(`Boards stand ${mm(-flush)} proud of the rails`, 'The upright flange no longer covers the full board edge, so the board is less well located.', fix);
    }
    const needGap = headIn + 0.5;
    if (p.edgeGap >= needGap) ok('Boards clear the bolts', `${mm(p.edgeGap)} edge gap all round clears the ${p.head === 'button' ? 'button heads' : 'nuts'} inside the rails (${mm(headIn)}). Boards stay plain rectangles, no notches.`);
    else warn('Boards will foul the bolts', `${p.head === 'button' ? 'Bolt heads' : 'Nuts'} stand ${mm(headIn)} inside the rails but the board edge gap is ${mm(p.edgeGap)}.`,
      p.head === 'hex' && BOLTS[p.bolt].button + 0.5 <= p.edgeGap
        ? { label: 'Put button heads inside', patch: { head: 'button' } }
        : { label: `Set edge gap to ${mm(Math.ceil(needGap))}`, patch: { edgeGap: Math.ceil(needGap) } });
    const bearing = seatW - p.edgeGap;
    if (bearing < 12) warn(`Only ${mm(bearing)} of board rests on the seat`, 'Aim for at least 12 mm of bearing on each rail. Use a wider rail or a smaller edge gap.');
    if (interior.length && p.packer < tc - 0.05) warn('Cross bearers stand above the seat strip', `Bearers are ${mm(tc)} thick and lie on the seats, so the seat strip must be at least ${mm(tc)} for the board to rest evenly.`,
      { label: `Set seat strip to ${mm(tc)}`, patch: { packer: tc } });
    const maxSpan = 32 * p.boardT;
    // The board rests on the rails all round, so it spans the depth unless stiff (angle) bearers are closer than that.
    const stiff = interior.length && p.crossType === 'angle';
    const span = Math.min(boardD, stiff ? stationPitch : boardL);
    if (span > maxSpan) warn(`Board spans ${mm(span)} unsupported`, `A ${mm(p.boardT)} board should be carried about every ${mm(maxSpan)} or closer.${p.crossType === 'flat' && interior.length ? ' Flat-bar bearers do not count: they are too thin to carry it.' : ''}`,
      p.crossType === 'flat' ? { label: 'Use L-angle bearers', patch: { crossType: 'angle', crossPerBay: Math.max(1, p.crossPerBay) } }
        : p.crossPerBay < LIMITS.crossPerBay[1] ? { label: 'Add a cross bearer per bay', patch: { crossPerBay: p.crossPerBay + 1 } } : undefined);
    else if (p.crossType === 'flat' && interior.length) note('Flat-bar bearers add little stiffness', `Lying flat, a ${ac} × ${tc} bar is far more flexible than the board, so the board carries the load across the ${mm(boardD)} depth by itself. That is fine here. Use L-angle bearers for heavy loads or thin boards.`);
    if (boardD > p.sheetW) warn('Board is deeper than the sheet', `Boards are ${mm(boardD)} deep but the sheet is ${mm(p.sheetW)} wide.`);
    const longest = Math.max(...boards.map((b) => b.w));
    if (longest > p.sheetL + 0.5) warn('Board is longer than the sheet', `A ${mm(longest)} piece does not fit a ${mm(p.sheetL)} sheet and there is no cross support to join it over.`,
      { label: 'Add a cross support per bay', patch: { crossPerBay: Math.min(LIMITS.crossPerBay[1], p.crossPerBay + 1) } });
    else if (nPieces > 1) note(`Each shelf is ${nPieces} boards`, 'The joint sits on a cross support so both board ends are carried.');
    if (ys.length > 1) {
      const endOpen = D - 2 * ap, minClear = Math.min(...tiers.map((t) => t.railClear));
      if (Math.hypot(endOpen, minClear) > boardD + 10) note('Lower boards go in from an end', 'Tilt the board along its length, pass it between the two end posts and lay it into the seat. The top board drops straight in.');
      else warn('Lower boards cannot be passed in', 'The end opening is too small to tilt a full board through. Split the lower boards or raise the shelf spacing.');
    }
  }

  const edgeChecks = [['rail', seatW / 2], ['post', (ap - tp) / 2], ['end rail', (ap - tp) / 2 - tr]];
  if (split) edgeChecks.push(['rail end at a splice', (onGrid ? pitch / 2 : p.flatW / 4) - 1], ['centre bar', p.flatW / 2 - (onGrid ? pitch / 2 : p.flatW / 4)]);
  const tight = edgeChecks.filter(([, e]) => e < 1.4 * B.d);
  if (tight.length) warn(`M${B.d} bolts sit close to the edge`, `Edge distance is ${tight.map(([n, e]) => `${mm(e)} in the ${n}`).join(', ')}. Keep at least ${mm(1.5 * B.d)}.`,
    p.bolt > 6 ? { label: `Use M${p.bolt === 10 ? 8 : 6} bolts`, patch: { bolt: p.bolt === 10 ? 8 : 6 } } : undefined);
  else ok('Bolt edge distances are fine', `M${B.d} bolts keep at least ${mm(Math.min(...edgeChecks.map(([, e]) => e)))} to the nearest edge.`);

  const slottedAny = parts.some((part) => part.slotted);
  if (lod) note('Slot pattern hidden', 'There are too many slots to draw at this size and pitch. Joint holes are still shown.');
  const braceHoles = braces.length * 2;
  if (slottedAny && !drilled) ok('Bolt-together kit', `All ${bolts.length} bolts are M${B.d} and meet a punched slot. No welding and nothing to drill on site${braceHoles ? `; the ${braces.length} brace bars come with ${braceHoles} end holes` : ''}.`);
  else if (slottedAny) warn(`${drilled} holes miss the slot pattern`, `${onPattern} of ${onPattern + drilled} bolt holes meet a punched slot. The others must be punched before dispatch (see the extra-holes list) or the customer has to drill.`,
    !p.snap ? { label: 'Snap sizes to the slots', patch: { snap: true } } : undefined);
  else note(`${drilled} holes to punch before dispatch`, 'All bars are plain stock. Every hole is in the extra-holes list so the kit still bolts together without drilling on site.');
  if (split) note('Long rails are spliced at the centre supports', `Each rail ships as ${p.bays} pieces of about ${mm((L - 2 * tp) / p.bays)}. The flat bar is the splice plate, with one bolt into each rail end.`);
  const longest = parts.reduce((a, b) => (b.len > a.len ? b : a));
  if (longest.len > p.maxPiece + 0.5) {
    const fix = longest.group === 'rail' && longest.name === 'Long rail' && p.bays < LIMITS.bays[1] && Math.ceil(L / p.maxPiece) > p.bays
      ? { label: `Use ${Math.ceil(L / p.maxPiece)} bays`, patch: { bays: Math.ceil(L / p.maxPiece) } }
      : longest.group === 'brace' ? { label: 'Use corner braces', patch: { brace: 'knee' } }
      : { label: `Allow ${mm(Math.ceil(longest.len / 50) * 50)} pieces`, patch: { maxPiece: Math.ceil(longest.len / 50) * 50 } };
    warn('A piece is too long to dispatch', `${longest.name} is ${mm(longest.len)} but the longest piece to ship is set to ${mm(p.maxPiece)}.`, fix);
  } else ok('Every piece fits the parcel', `The longest steel piece is ${mm(longest.len)} (${longest.name.toLowerCase()}), within the ${mm(p.maxPiece)} dispatch length.`);
  if (longest.len > p.stockLen) warn('A bar is longer than the stock length', `The longest bar is ${mm(longest.len)} but stock is ${mm(p.stockLen)}.`, { label: 'Use 6 m stock', patch: { stockLen: 6000 } });

  // Rail bending between legs. A guide only: simply supported, uniform load, half the shelf per rail.
  const props = angleProps(ar, tr);
  const I = props.I * (p.slotRails ? 0.8 : 1), Z = props.Z * (p.slotRails ? 0.8 : 1);
  const shelfN = (p.load + (boardKg / Math.max(1, ys.length))) * 9.81;
  const w = shelfN / 2 / L;
  const defl = (5 * w * bayPitch ** 4) / (384 * 200000 * I);
  const stress = (w * bayPitch ** 2) / 8 / Z;
  const ratio = defl > 0 ? bayPitch / defl : Infinity;
  const loadTxt = `${p.load} kg per shelf: rails deflect about ${mm(defl)} over a ${mm(bayPitch)} bay (span / ${Math.round(Math.min(ratio, 9999))}), bending stress about ${Math.round(stress)} MPa.`;
  if (ratio < 250 || stress > 140) warn('Rails are light for this load', `${loadTxt} Use a heavier rail or more centre supports.`,
    p.bays < LIMITS.bays[1] ? { label: 'Add a centre support', patch: { bays: p.bays + 1 } } : undefined);
  else ok('Rails carry the shelf load', `${loadTxt} Estimate only, not a structural certificate.`);

  if (centres.length) {
    // Each flat bar is a strut pinned at the rail bolts. Euler buckling about its thin axis, safety factor 3.
    const stops = [yb, ...ys.map(gaugeY)];
    const free = Math.max(...stops.slice(1).map((y, i) => y - stops[i]));
    const demand = ((p.load * ys.length + boardKg) * 9.81) / p.bays / 2;
    const allow = (t) => (Math.PI ** 2 * 200000 * ((p.flatW * t ** 3) / 12)) / free ** 2 / 3;
    const txt = `Each centre bar carries about ${Math.round(demand / 9.81)} kg. ${p.flatW} × ${p.flatT} flat bar, ${mm(free)} between rail bolts, is good for about ${Math.round(allow(p.flatT) / 9.81)} kg before it bows.`;
    if (allow(p.flatT) < demand) {
      const t = [5, 6, 8, 10, 12].find((v) => allow(v) >= demand);
      warn('Centre flat bars are too thin', `${txt} Use thicker bar, add a shelf level, or reduce the load.`,
        t ? { label: `Use ${p.flatW} × ${t} flat bar`, patch: { flatT: t } } : ys.length < 8 ? { label: 'Add a shelf level', patch: { levels: ys.length + 1 } } : undefined);
    } else ok('Centre flat bars carry the load', `${txt} Estimate only.`);
    if (p.flatT > tp) note(`Centre bars stand ${mm(p.flatT - tp)} proud`, 'The flat bar is thicker than the post flange, so it projects slightly beyond the front and back faces.');
  }
  if (p.brace === 'none' && H > 900) warn('No bracing', 'A bolted frame this tall can rack sideways. Add corner braces or fix it to a wall.', { label: 'Add corner braces', patch: { brace: 'knee' } });
  if (braces.length) note('Braces sit outside the back', p.brace === 'knee' ? `Corner braces add ${mm(p.braceT)} behind the rack. Each takes a ${mm(tp)} spacer washer at its rail end.` : `Flat-bar braces add ${mm((p.brace === 'x' ? 2 : 1) * p.braceT + (centres.length ? Math.max(0, p.flatT - tp) : 0))} behind the rack. Use spacer washers where they cross.`);
  if (H / D > 3) warn('Tall and shallow', `Height is ${(H / D).toFixed(1)} times the depth. Fix the rack to a wall.`);

  const order = { warn: 0, info: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);

  return {
    p, B, ys, parts, bolts, boards, feet, braces, stations, centres, checks,
    slotLen, seatW, flush, headIn, tiers, bayPitch, stationPitch, split,
    board: { x: xi, L: boardL, D: boardD, pieces: nPieces },
    floorClear: ys[0] - ar,
    steelKg, boardKg, drilled,
    warnings: checks.filter((c) => c.level === 'warn').length,
    strips: {
      seat: ys.length * (2 * (L - 2 * tp) + 2 * (D - 2 * (tp + tr) - 2 * cope)),
      cross: p.packer > tc + 0.05 ? ys.length * interior.length * (D - 2 * (tp + ar + 1)) : 0,
    },
  };
}
