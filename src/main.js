import { DEFAULTS, PRESETS, LIMITS, BOARD_MATS, STEEL_COLORS, BOARD_COLORS, buildModel, sanitize } from './model.js';
import { billOfMaterials, toCSV } from './bom.js';
import { fmt, toField, parseLen } from './units.js';
import { drawSheet } from './draw2d.js';
import { createView } from './view3d.js';
import { createSheet } from './sheet.js';

const STORE = 'rack-designer-v2';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${new Intl.PluralRules('en').select(n) === 'one' ? one : many}`;

// ---------- state ----------
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* first run or storage blocked */ }
const fromHash = () => {
  const m = location.hash.match(/^#d=(.+)$/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return null; }
};
const shared = fromHash();
// Projects are kept in this browser. Each one can also be saved to a file and opened anywhere.
const PROJECTS = 'rack-designer-projects';
let projects = {};
try { projects = JSON.parse(localStorage.getItem(PROJECTS)) || {}; } catch { /* first run or storage blocked */ }
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let currentId = !shared && projects[saved.current] ? saved.current : newId();
let collapsed = !!saved.collapsed;
let params = sanitize({ ...DEFAULTS, ...(shared || projects[currentId]?.params || saved.params) });
let unit = ['mm', 'cm', 'in'].includes(saved.unit) ? saved.unit : 'cm';
let view = shared ? '3d' : ['3d', '2d', 'parts', 'checks'].includes(saved.view) ? saved.view : '3d';
let openGroups = new Set(saved.open || ['size', 'shelves', 'frame']);
let model, bom;
let hideBoards = false, explode = false;
const undoStack = [], redoStack = [];
if (shared) history.replaceState(null, '', location.pathname + location.search);

// ---------- parameter schema ----------
// len = length in the chosen unit, mm = always millimetres, sec = steel section (size × thickness, mm).
const opts = (obj) => Object.entries(obj).map(([v, o]) => [v, o.label]);
const GROUPS = [
  { id: 'size', title: 'Size', fields: [
    { key: 'L', label: 'Length', type: 'len' },
    { key: 'D', label: 'Depth', type: 'len' },
    { key: 'H', label: 'Height', type: 'len', hint: 'Floor to the top of the frame' },
  ] },
  { id: 'shelves', title: 'Shelves', fields: [
    { key: 'levels', label: 'Shelf levels', type: 'step' },
    { key: 'floorClear', label: 'Floor clearance', type: 'len', hint: 'Floor to the underside of the lowest rail' },
    { key: 'spacing', label: 'Spacing', type: 'seg', options: [['even', 'Even'], ['custom', 'Custom']], when: (p) => p.levels > 2 },
    { type: 'levels' },
    { key: 'snap', label: 'Snap sizes to the slots', type: 'bool', hint: 'So every bolt meets a punched slot', when: (p) => p.slotPosts || p.slotRails },
  ] },
  { id: 'frame', title: 'Steel frame', fields: [
    { type: 'sub', label: 'Corner posts', note: 'L-angle', part: 'post' },
    { keys: ['postA', 'postT'], label: 'Section', type: 'sec' },
    { key: 'slotPosts', label: 'Slotted', type: 'bool' },
    { type: 'sub', label: 'Rails', note: 'L-angle, board seat', part: 'rail' },
    { keys: ['railA', 'railT'], label: 'Section', type: 'sec' },
    { key: 'slotRails', label: 'Slotted', type: 'bool' },
    { type: 'sub', label: 'Centre supports', note: 'flat bar', part: 'centre' },
    { key: 'bays', label: 'Bays', type: 'step', hint: 'One flat bar front and back between bays' },
    { keys: ['flatW', 'flatT'], label: 'Section', type: 'sec', when: (p) => p.bays > 1 },
    { key: 'slotCentre', label: 'Slotted', type: 'bool', when: (p) => p.bays > 1 },
    { type: 'sub', label: 'Cross bearers', note: 'L-angle, drop onto the seats', part: 'cross' },
    { key: 'crossPerBay', label: 'Extra per bay', type: 'step' },
    { keys: ['crossA', 'crossT'], label: 'Section', type: 'sec', when: (p) => p.bays * (p.crossPerBay + 1) > 1 },
    { key: 'slotCross', label: 'Slotted', type: 'bool', when: (p) => p.bays * (p.crossPerBay + 1) > 1 },
  ] },
  { id: 'fix', title: 'Bolts and slots', fields: [
    { key: 'bolt', label: 'Bolt size', type: 'seg', options: [[6, 'M6'], [8, 'M8'], [10, 'M10']] },
    { key: 'head', label: 'Inside the rail', type: 'seg', options: [['button', 'Button head'], ['hex', 'Nut']] },
    { key: 'pitch', label: 'Slot pitch', type: 'mm' },
  ] },
  { id: 'boards', title: 'Boards', fields: [
    { type: 'sub', label: 'Shelf boards', note: 'cut to drop in', part: 'board' },
    { key: 'boards', label: 'Drop-in boards', type: 'bool' },
    { key: 'boardMat', label: 'Material', type: 'seg', options: opts(BOARD_MATS), when: (p) => p.boards },
    { key: 'boardT', label: 'Thickness', type: 'mm', when: (p) => p.boards },
    { key: 'packer', label: 'Seat strip', type: 'mm', hint: 'Rubber or EVA under the board', when: (p) => p.boards },
    { key: 'edgeGap', label: 'Edge gap', type: 'mm', hint: 'Clearance to the rails all round', when: (p) => p.boards },
    { type: 'sub', label: 'Sheet you buy', note: 'boards are cut from it', when: (p) => p.boards },
    { key: 'sheetL', label: 'Stock sheet length', type: 'len', hint: 'Not the shelf size', when: (p) => p.boards },
    { key: 'sheetW', label: 'Stock sheet width', type: 'len', hint: 'Not the shelf size', when: (p) => p.boards },
  ] },
  { id: 'feet', title: 'Feet and bracing', fields: [
    { key: 'footType', label: 'Feet', type: 'seg', options: [['leveller', 'Leveller'], ['cap', 'Cap'], ['none', 'None']] },
    { key: 'footH', label: 'Foot height', type: 'mm', when: (p) => p.footType !== 'none' },
    { type: 'sub', label: 'Braces', note: 'flat bar', part: 'brace' },
    { key: 'brace', label: 'Back brace', type: 'seg', options: [['knee', 'Corner'], ['x', 'Cross'], ['single', 'Single'], ['none', 'None']] },
    { keys: ['braceW', 'braceT'], label: 'Brace bar', type: 'sec', when: (p) => p.brace !== 'none' },
  ] },
  { id: 'stock', title: 'Dispatch, stock and load', fields: [
    { key: 'maxPiece', label: 'Longest piece to ship', type: 'len', hint: 'Longer rails are spliced at a centre support' },
    { key: 'stockLen', label: 'Steel stock length', type: 'len' },
    { key: 'kerf', label: 'Saw kerf', type: 'mm' },
    { key: 'load', label: 'Load per shelf', type: 'num', unit: 'kg' },
  ] },
  { id: 'finish', title: 'Finish', fields: [
    { key: 'steelColor', label: 'Steel', type: 'swatch', options: STEEL_COLORS },
    { key: 'boardColor', label: 'Boards', type: 'swatch', options: BOARD_COLORS, when: (p) => p.boards },
  ] },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);
const byKey = new Map();
for (const f of FIELDS) for (const k of f.keys || (f.key ? [f.key] : [])) byKey.set(k, f);

// ---------- form ----------
const box = (id, key, suffix, extra = '') =>
  `<span class="field"><input id="${id}" data-key="${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" ${extra}><em data-unit="${suffix}"></em></span>`;

function fieldHTML(f, pre = 'f-') {
  const id = `${pre}${f.key || f.keys?.[0]}`;
  const hint = f.hint ? `<small>${f.hint}</small>` : '';
  const label = `<label for="${id}">${f.label}${hint}</label>`;
  switch (f.type) {
    case 'sub': return `<div class="sub"><span>${f.label}</span><em>${f.note || ''}</em>${f.part ? `<span class="marks" data-marks="${f.part}"></span>` : ''}</div>`;
    case 'levels': return '<div class="levels" id="levels"></div>';
    case 'len': case 'mm': case 'num':
      return `<div class="row" data-row="${f.key}">${label}${box(id, f.key, f.type === 'num' ? f.unit : f.type)}</div>`;
    case 'sec':
      return `<div class="row" data-row="${f.keys[0]}">${label}<span class="pair">${box(id, f.keys[0], '', 'aria-label="Size, mm"')}<i>×</i>${box(`${pre}${f.keys[1]}`, f.keys[1], 'mm', 'aria-label="Thickness, mm"')}</span></div>`;
    case 'step':
      return `<div class="row" data-row="${f.key}">${label}<span class="stepper"><button type="button" data-step="-1" data-key="${f.key}" aria-label="Fewer">−</button><output id="${id}"></output><button type="button" data-step="1" data-key="${f.key}" aria-label="More">+</button></span></div>`;
    case 'bool':
      return `<div class="row" data-row="${f.key}">${label}<input class="switch" type="checkbox" role="switch" id="${id}" data-key="${f.key}"></div>`;
    case 'seg':
      return `<div class="row stack" data-row="${f.key}"><span class="lbl">${f.label}${hint}</span><div class="seg" data-seg="${f.key}" role="group" aria-label="${f.label}" style="--n:${f.options.length}"><span class="thumb"></span>${f.options.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div></div>`;
    case 'swatch':
      return `<div class="row" data-row="${f.key}"><span class="lbl">${f.label}</span><div class="swatches" data-seg="${f.key}" role="group" aria-label="${f.label} colour">${Object.entries(f.options).map(([v, o]) => `<button type="button" data-v="${v}" style="--c:${o.hex}" aria-label="${o.label}" title="${o.label}"></button>`).join('')}</div></div>`;
    default: return '';
  }
}

function buildForm() {
  const form = $('#fields');
  form.innerHTML = GROUPS.map((g) => `
    <details class="group" data-group="${g.id}" ${openGroups.has(g.id) ? 'open' : ''}>
      <summary><span>${g.title}</span><em data-gsum="${g.id}"></em><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary>
      <div class="card">${g.fields.map((f) => fieldHTML(f)).join('')}</div>
    </details>`).join('');

  form.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.group;
    if (!id) return;
    e.target.open ? openGroups.add(id) : openGroups.delete(id);
    persist();
  }, true);
  bindFields(form);
}

// Wires up any container of parameter rows: the side panel and the part editor share it.
function bindFields(form) {
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur(); });
  form.addEventListener('focusin', (e) => { if (e.target.matches('input[type=text]')) e.target.select(); });
  form.addEventListener('change', (e) => {
    const el = e.target, key = el.dataset.key;
    if (!key) return;
    if (el.type === 'checkbox') return setParams({ [key]: el.checked });
    if (key.startsWith('lvl:')) {
      const v = parseLen(el.value, unit);
      if (v === null) return syncForm();
      const next = [...params.customLevels];
      next[+key.slice(4)] = v;
      return setParams({ customLevels: next, spacing: 'custom' });
    }
    const f = byKey.get(key);
    const v = f.type === 'num' ? parseFloat(el.value) : parseLen(el.value, f.type === 'len' ? unit : 'mm');
    if (v === null || Number.isNaN(v)) return syncForm();
    setParams({ [key]: v });
  });
  form.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) return setParams({ [step.dataset.key]: params[step.dataset.key] + +step.dataset.step });
    const b = e.target.closest('[data-seg] button');
    if (b) {
      const key = b.parentElement.dataset.seg;
      setParams({ [key]: typeof DEFAULTS[key] === 'number' ? +b.dataset.v : b.dataset.v });
    }
  });
}

const setSeg = (el, value) => {
  const btns = $$('button', el);
  const i = btns.findIndex((b) => b.dataset.v === String(value));
  btns.forEach((b, k) => b.setAttribute(b.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-pressed', k === i));
  el.style.setProperty('--i', Math.max(0, i));
};

// Writes the current values into a set of rows. `pre` is the id prefix of that container.
function syncFields(root, pre, fields) {
  for (const f of fields) {
    const keys = f.keys || (f.key ? [f.key] : []);
    if (!keys.length) continue;
    const row = $(`[data-row="${keys[0]}"]`, root);
    row.hidden = !!f.when && !f.when(params);
    for (const key of keys) {
      const v = params[key], el = $(`#${pre}${key}`);
      if (f.type === 'bool') el.checked = v;
      else if (f.type === 'step') {
        el.textContent = v;
        const [lo, hi] = LIMITS[key];
        $(`[data-step="-1"][data-key="${key}"]`, root).disabled = v <= lo;
        $(`[data-step="1"][data-key="${key}"]`, root).disabled = v >= hi;
      } else if (f.type === 'seg' || f.type === 'swatch') setSeg($(`[data-seg="${key}"]`, root), v);
      else if (document.activeElement === el) continue;
      else if (f.type === 'len') el.value = toField(key === 'floorClear' ? model.floorClear : v, unit);
      else el.value = String(+(+v).toFixed(2));
    }
  }
  $$('[data-unit]', root).forEach((u) => { const t = u.dataset.unit; u.textContent = t === 'len' ? unit : t; });
}

// The cut-list marks (S1, S2, B1 ...) of one kind of part, as shown in the Parts view.
function marksHTML(kind) {
  const rows = kind === 'board' ? bom.boards : bom.steel.filter((r) => r.group === kind);
  return rows.map((r) => `<span class="mark${kind === 'board' ? ' wood' : ''}" title="${esc(r.name)}, ${fmt(r.len, unit)}, ${r.qty} off">${r.mark}</span>`).join('');
}

function syncForm() {
  for (const el of $$('[data-marks]')) el.innerHTML = marksHTML(el.dataset.marks);
  // custom level rows are rebuilt only when their count changes, so focus is kept while typing
  const host = $('#levels');
  const want = params.spacing === 'custom' ? params.levels - 2 : 0;
  if (host.childElementCount !== want) {
    host.innerHTML = Array.from({ length: want }, (_, i) =>
      `<div class="row"><label for="f-lvl${i}">Shelf ${i + 2} height<small>Floor to the top of its rail</small></label>${box(`f-lvl${i}`, `lvl:${i}`, 'len')}</div>`).join('');
  }
  for (let i = 0; i < want; i++) $(`#f-lvl${i}`).value = toField(model.ys[i + 1], unit);

  syncFields($('#fields'), 'f-', FIELDS);
  // a sub-heading disappears with the rows beneath it
  for (const sub of $$('.sub')) {
    let n = sub.nextElementSibling, any = false;
    while (n && !n.classList.contains('sub')) { if (!n.hidden) any = true; n = n.nextElementSibling; }
    sub.hidden = !any;
  }
  $$('[data-unit]').forEach((u) => { const t = u.dataset.unit; u.textContent = t === 'len' ? unit : t; });

  const p = params, f = (v) => fmt(v, unit);
  const sums = {
    size: `${f(p.L)} × ${f(p.D)} × ${f(p.H)}`,
    shelves: plural(p.levels, 'level'),
    frame: `${p.postA} × ${p.postT} posts`,
    fix: `M${p.bolt}`,
    boards: p.boards ? `${p.boardT} mm ${BOARD_MATS[p.boardMat].label}` : 'None',
    feet: p.footType === 'none' ? 'No feet' : p.footType === 'cap' ? 'Caps' : 'Levellers',
    stock: `${p.load} kg per shelf`,
    finish: STEEL_COLORS[p.steelColor].label,
  };
  for (const [id, s] of Object.entries(sums)) $(`[data-gsum="${id}"]`).textContent = s;
}

// ---------- state changes ----------
function setParams(patch, { record = true } = {}) {
  const next = sanitize({ ...params, ...patch });
  if (JSON.stringify(next) === JSON.stringify(params)) return syncForm();
  if (record) { undoStack.push(params); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
  params = next;
  render();
}
function undo() { if (undoStack.length) { redoStack.push(params); params = undoStack.pop(); render(); } }
function redo() { if (redoStack.length) { undoStack.push(params); params = redoStack.pop(); render(); } }

function persist() {
  const before = projects[currentId];
  const changed = !before || JSON.stringify(before.params) !== JSON.stringify(params);
  projects[currentId] = { id: currentId, name: params.name, params, updated: changed ? Date.now() : before.updated };
  try {
    localStorage.setItem(PROJECTS, JSON.stringify(projects));
    localStorage.setItem(STORE, JSON.stringify({ current: currentId, unit, view, open: [...openGroups], collapsed }));
  } catch { /* storage blocked */ }
}

// ---------- projects ----------
function uniqueName(base) {
  const names = new Set(Object.values(projects).map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
// Switches to a project (new or existing). Undo history belongs to one project, so it starts empty.
function loadProject(id, p, message) {
  currentId = id;
  params = sanitize({ ...DEFAULTS, ...p });
  undoStack.length = redoStack.length = 0;
  selectPart(null);
  render();
  three.setView('iso');
  setSeg($('#cam'), 'iso');
  if (message) toast(message);
}
function projectFile() {
  return JSON.stringify({ app: 'rack-designer', version: 2, name: params.name, unit, saved: new Date().toISOString(), params }, null, 2);
}
function openProjectFile(text, fileName) {
  const data = JSON.parse(text);
  const p = data && typeof data.params === 'object' ? data.params : data;
  if (!p || typeof p !== 'object' || !Number.isFinite(Number(p.L))) throw new Error('not a project');
  if (['mm', 'cm', 'in'].includes(data.unit)) unit = data.unit;
  const name = uniqueName(String(p.name || fileName.replace(/(\.rack)?\.json$/i, '') || 'Opened rack'));
  loadProject(newId(), { ...p, name }, `Opened “${name}”`);
}
function renderProjects() {
  const f = (v) => fmt(v, unit);
  const list = Object.values(projects).sort((a, b) => b.updated - a.updated);
  $('#projects').innerHTML = list.map((p) => `<button role="menuitem" data-project="${p.id}" ${p.id === currentId ? 'aria-current="true"' : ''}>${esc(p.name)}<small>${f(p.params.L)} × ${f(p.params.D)} × ${f(p.params.H)}</small></button>`).join('');
  $('[data-act="delete"]').textContent = `Delete “${params.name}”`;
}
function setCollapsed(on) {
  collapsed = on;
  $('#app').classList.toggle('collapsed', on);
  $('#collapse').setAttribute('aria-expanded', String(!on));
  $('#collapse').setAttribute('aria-label', on ? 'Show settings panel' : 'Hide settings panel');
  persist();
}

// ---------- render ----------
const three = createView($('#three'), { onPick: (kind) => selectPart(kind) });

// ---------- tap a part to edit it ----------
// Plain-language description of each kind of part and the settings that belong to it.
const PARTS = {
  post: { title: 'Corner posts', what: 'The four upright legs. They carry the whole rack down to the floor, and the rails bolt to them.',
          keys: ['H', 'postA', 'slotPosts'] },
  rail: { title: 'Rails', what: 'The horizontal bars around every shelf. The board drops inside them and sits flush with their top edge.',
          keys: ['L', 'D', 'railA', 'slotRails'] },
  centre: { title: 'Centre supports', what: 'Flat bars in the middle of the long sides. They stop long rails sagging and join the rail halves. More bays means more of them.',
            keys: ['bays', 'flatW', 'slotCentre'] },
  cross: { title: 'Cross bearers', what: 'Bars that lie under the board from front to back and stiffen it. They drop into place, no bolts.',
           keys: ['crossPerBay', 'crossA', 'slotCross'] },
  brace: { title: 'Braces', what: 'Diagonal bars on the back. They stop the rack swaying sideways.', keys: ['brace', 'braceW'] },
  board: { title: 'Boards', what: 'The shelves. Each one is a plain rectangle that drops into the rails. No screws.',
           keys: ['levels', 'floorClear', 'boardMat', 'boardT', 'packer', 'edgeGap', 'boardColor'] },
  foot: { title: 'Feet', what: 'They keep the steel off the floor. Levellers screw up and down so the rack stands straight on an uneven floor.',
          keys: ['footType', 'footH', 'floorClear'] },
  bolt: { title: 'Bolts', what: 'They hold the frame together. One size is used everywhere, and they go through the slots in the bars.',
          keys: ['bolt', 'head', 'pitch', 'snap'] },
};
let picked = null;

function partFacts(kind) {
  const f = (v) => fmt(v, unit);
  if (kind === 'board') return bom.boards.length ? bom.boards.map((r) => `${plural(r.qty, 'board')}, ${f(r.len)} × ${f(r.wid)} × ${f(r.t)}`).join('  ·  ') : 'No boards';
  if (kind === 'bolt') return `${plural(model.bolts.length, 'bolt')}, all M${params.bolt}`;
  if (kind === 'foot') return plural(model.feet.length, 'foot', 'feet');
  const rows = bom.steel.filter((r) => r.group === kind);
  if (!rows.length) return 'None in this design';
  const lens = [...new Set(rows.map((r) => f(r.len)))];
  return `${plural(rows.reduce((s, r) => s + r.qty, 0), 'piece')}  ·  ${rows[0].section}  ·  ${lens.length > 2 ? `${lens[0]} and others` : lens.join(' and ')}`;
}

function selectPart(kind) {
  const el = $('#inspector');
  if (!kind || !PARTS[kind]) {
    if (picked) { picked = null; three.setSelected(null); $('#app').classList.remove('picking'); el.classList.remove('open'); setTimeout(() => { if (!picked) el.hidden = true; }, 160); }
    return;
  }
  const fresh = !picked;
  picked = kind;
  three.setSelected(kind);
  $('#app').classList.add('picking');
  $('#tip').classList.add('gone');
  try { localStorage.setItem(`${STORE}-tip`, '1'); } catch { /* storage blocked */ }
  const fields = [...new Set(PARTS[kind].keys.map((k) => byKey.get(k)))];
  $('#insp-title').textContent = PARTS[kind].title;
  $('#insp-what').textContent = PARTS[kind].what;
  $('#insp-fields').innerHTML = fields.map((fd) => fieldHTML(fd, 'i-')).join('');
  syncInspector();
  el.hidden = false;
  if (fresh) requestAnimationFrame(() => el.classList.add('open')); else el.classList.add('open');
}
function syncInspector() {
  if (!picked) return;
  $('#insp-facts').textContent = partFacts(picked);
  $('#insp-marks').innerHTML = ['bolt', 'foot'].includes(picked) ? '' : marksHTML(picked);
  syncFields($('#insp-fields'), 'i-', [...new Set(PARTS[picked].keys.map((k) => byKey.get(k)))]);
}

function render() {
  model = buildModel(params);
  bom = billOfMaterials(model);
  three.update(model, { hideBoards });
  renderPane();
  syncForm();
  syncInspector();

  const f = (v) => fmt(v, unit);
  if (document.activeElement !== $('#name')) $('#name').value = params.name;
  $('#summary').textContent = `${f(params.L)} × ${f(params.D)} × ${f(params.H)}  ·  ${(model.steelKg + model.boardKg).toFixed(0)} kg  ·  ${plural(model.bolts.length, 'bolt')}`;
  const badge = $('#badge');
  badge.hidden = !model.warnings;
  badge.textContent = model.warnings;
  setSeg($('#view'), view);
  setSeg($('#unit'), unit);
  $('#app').dataset.view = view;
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
  $('#hide-boards').hidden = $('#explode').hidden = !params.boards;
  document.title = `${params.name} · Rack Designer`;
  persist();
}

// Only the pane on screen is rebuilt; the others are rebuilt when they are opened.
function renderPane() {
  if (view === '2d') $('#sheet').innerHTML = drawSheet(model, unit);
  else if (view === 'parts') renderParts();
  else if (view === 'checks') renderChecks();
}

function renderParts() {
  const f = (v) => fmt(v, unit), t = bom.totals;
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const colors = ['#0a84ff', '#30b0c7', '#5e5ce6', '#34c759', '#ff9f0a', '#ff375f', '#a2845e', '#64d2ff'];
  const stock = bom.stock.map((s) => {
    const lens = [...new Set(s.bars.flatMap((b) => b.cuts.map((c) => c.toFixed(1))))];
    const bars = s.bars.map((b, i) => `
      <div class="bar-row"><span class="bar-n">${i + 1}</span>
        <div class="stockbar">${b.cuts.map((c) => `<i style="flex:${c};--c:${colors[lens.indexOf(c.toFixed(1)) % colors.length]}"><span>${f(c)}</span></i>`).join('')}${b.left > 1 ? `<i class="off" style="flex:${b.left}"><span>${f(b.left)}</span></i>` : ''}</div>
      </div>`).join('');
    return `<div class="stock"><h4>${s.section}<em>${plural(s.bars.length, 'bar')} of ${f(model.p.stockLen)}${s.oversize ? ' · a piece is longer than the stock' : ''}</em></h4>${bars}</div>`;
  }).join('');
  $('#parts').innerHTML = `
    <div class="pane-title"><h2>Parts</h2><div class="actions"><button class="btn" data-act="csv">Export CSV</button><button class="btn" data-act="print">Print</button></div></div>
    <div class="stats">${stat(`${t.kg.toFixed(0)} kg`, 'Total weight')}${stat(`${t.steelKg.toFixed(1)} kg`, 'Steel')}${stat(t.steelPieces, 'Steel pieces')}${stat(t.bolts, 'Bolts')}${stat(t.holes, 'Holes to drill')}${stat(bom.sheets || '—', 'Board sheets')}</div>

    <h3>Steel cut list</h3>
    <div class="tablewrap"><table>
      <thead><tr><th>Mark</th><th>Part</th><th class="n">Cut length</th><th class="n">Qty</th><th class="n">kg</th></tr></thead>
      <tbody>${bom.steel.map((r) => `<tr><td><span class="mark">${r.mark}</span></td><td>${r.name}<small>${r.section}${r.notes.length ? ` · ${r.notes.join('; ')}` : ''}</small></td>
        <td class="n">${f(r.len)}</td><td class="n">${r.qty}</td><td class="n">${(r.kg * r.qty).toFixed(1)}</td></tr>`).join('')}</tbody>
    </table></div>

    <h3>Cutting plan</h3>
    <p class="lede">Each strip is one stock bar. Grey is offcut. Saw kerf of ${model.p.kerf} mm is allowed between cuts.</p>
    ${stock}

    ${bom.boards.length ? `<h3>Boards</h3>
    <div class="tablewrap"><table>
      <thead><tr><th>Mark</th><th>Board</th><th class="n">Length × width</th><th class="n">Qty</th><th class="n">kg</th></tr></thead>
      <tbody>${bom.boards.map((r) => `<tr><td><span class="mark wood">${r.mark}</span></td><td>${r.name}<small>${BOARD_MATS[model.p.boardMat].label} ${f(r.t)}, plain rectangle, ease the bottom edges 2 mm</small></td>
        <td class="n">${f(r.len)} × ${f(r.wid)}</td><td class="n">${r.qty}</td><td class="n">${(r.kg * r.qty).toFixed(1)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="lede">About ${plural(bom.sheets, 'sheet')} of ${f(model.p.sheetL)} × ${f(model.p.sheetW)}. Boards are cut ${f(model.p.edgeGap)} short of the rails all round so they drop in and lift out by hand.</p>` : ''}

    <h3>Fixings and fittings</h3>
    <div class="tablewrap"><table>
      <thead><tr><th>Item</th><th class="n">Qty</th></tr></thead>
      <tbody>${bom.hardware.map((r) => `<tr><td>${r.item}<small>${r.use}</small></td><td class="n">${r.qty}${r.unit ? ` ${r.unit}` : ''}</td></tr>`).join('')}</tbody>
    </table></div>

    <h3>Dispatch and assembly</h3>
    <div class="stats">${stat(f(bom.kit.longest), 'Longest piece')}${stat(bom.kit.parcel.map((v) => fmt(v, unit)).join(' × '), 'Steel bundle, about')}${stat(bom.kit.steelParcels, 'Steel parcels up to 25 kg')}${stat(`${t.boardKg.toFixed(0)} kg`, 'Boards, packed flat')}</div>
    <p class="lede">The steel ships cut, notched and punched. Assembly is bolts only: no welding and no drilling. Tools: ${bom.kit.tools.join(', ').toLowerCase()}. The fixings bag below includes 10% spare bolts, nuts and washers.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Fixings bag</th><th class="n">Needed</th><th class="n">Pack</th></tr></thead>
      <tbody>${bom.kit.bagged.map((r) => `<tr><td>${r.item}</td><td class="n">${r.qty}</td><td class="n">${r.pack}</td></tr>`).join('')}</tbody>
    </table></div>
    <ol class="steps">${bom.kit.steps.map((st) => `<li>${st}</li>`).join('')}</ol>

    ${bom.drill.length ? `<h3>Extra holes</h3>
    <p class="lede">Ø${model.B.hole} mm holes to punch before dispatch, measured from one end of the bar along the gauge line (A is the outer or upright flange, B the other).</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Mark</th><th>Part</th><th>Positions</th></tr></thead>
      <tbody>${bom.drill.map((r) => `<tr><td><span class="mark">${r.mark}</span></td><td>${r.name}<small>${plural(r.qty, 'piece')}</small></td>
        <td class="drill">${['A', 'B'].map((face) => { const d = r.drill.filter((x) => x.face === face); return d.length ? `<span><b>${face}</b> ${d.map((x) => f(x.u)).join(', ')}</span>` : ''; }).join('')}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    <p class="fine">Lengths are finished cut sizes. Weights use 7850 kg/m³ for steel and ${Math.round(BOARD_MATS[model.p.boardMat].rho * 1e9)} kg/m³ for ${BOARD_MATS[model.p.boardMat].label}. Check stock sizes with your supplier before ordering.</p>`;
}

function renderChecks() {
  const icon = {
    ok: '<svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 11v6M12 7.2v.1"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 16.8v.1"/></svg>',
  };
  const n = model.warnings;
  $('#checks').innerHTML = `
    <div class="pane-title"><h2>Checks</h2></div>
    <p class="lede">${n ? `${plural(n, 'thing')} to fix before cutting.` : 'Nothing to fix. Ready to cut.'} These are the questions a fabricator and a carpenter would ask.</p>
    <ul class="checks">${model.checks.map((c, i) => `
      <li class="${c.level}"><span class="dot">${icon[c.level]}</span>
        <div><h4>${esc(c.title)}</h4><p>${esc(c.detail)}</p>${c.fix ? `<button class="btn tint" data-fix="${i}">${esc(c.fix.label)}</button>` : ''}</div></li>`).join('')}</ul>
    ${model.tiers.length ? `<h3>Clear heights</h3>
    <div class="tablewrap"><table><thead><tr><th>Space</th><th class="n">Under the rail</th><th class="n">Under cross bearers</th></tr></thead>
      <tbody>${model.tiers.map((t) => `<tr><td>Above shelf ${t.from + 1}</td><td class="n">${fmt(t.railClear, unit)}</td><td class="n">${fmt(t.clear, unit)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="fine">Load figures are estimates for guidance, not a structural certificate.</p>`;
}

// ---------- click-to-edit dimensions on the drawing ----------
function editDimension(node) {
  const key = node.dataset.key;
  const r = node.getBoundingClientRect();
  const input = document.createElement('input');
  input.className = 'dim-editor';
  input.inputMode = 'decimal';
  input.enterKeyHint = 'done';
  input.value = toField(key === 'floorClear' ? model.floorClear : params[key], unit);
  input.style.left = `${Math.max(8, Math.min(window.innerWidth - 148, r.left + r.width / 2 - 70))}px`;
  input.style.top = `${r.top + r.height / 2 - 20}px`;
  document.body.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = commit ? parseLen(input.value, unit) : null;
    input.remove();
    if (v !== null) setParams({ [key]: v });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}
$('#sheet').addEventListener('click', (e) => { const n = e.target.closest('.ed'); if (n) editDimension(n); });
$('#sheet').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList?.contains('ed')) editDimension(e.target); });

// ---------- toolbar, HUD, menu ----------
const segClick = (id, fn) => $(`#${id}`).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); });
segClick('view', (v) => {
  view = v;
  render();
  sheet.refresh();
  if (v === '3d') three.resize(); else selectPart(null);
  $(`#pane-${v}`).scrollTop = 0;
});
segClick('unit', (v) => { unit = v; render(); });
segClick('cam', (v) => { setSeg($('#cam'), v); three.setView(v); });
setSeg($('#cam'), 'iso');
$('#explode').addEventListener('click', (e) => {
  explode = !explode;
  e.currentTarget.setAttribute('aria-pressed', explode);
  three.setExplode(explode);
});
$('#hide-boards').addEventListener('click', (e) => {
  hideBoards = !hideBoards;
  e.currentTarget.setAttribute('aria-pressed', hideBoards);
  three.update(model, { hideBoards });
});
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#name').addEventListener('change', (e) => setParams({ name: e.target.value.trim() }));
$('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input')) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
  if (e.key === 'Escape') { closeMenu(); selectPart(null); }
});

const menu = $('#menu'), menuBtn = $('#menu-btn');
$('#presets').innerHTML = PRESETS.map((pr) => `<button role="menuitem" data-preset="${pr.id}">${pr.label}<small>${pr.note}</small></button>`).join('');
function openMenu() {
  renderProjects();
  const r = menuBtn.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = `${r.bottom + 8}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  menu.style.maxHeight = `${window.innerHeight - r.bottom - 24}px`;
  requestAnimationFrame(() => menu.classList.add('open'));
  menuBtn.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  if (menu.hidden) return;
  menu.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, 160);
}
menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function download(name, href) {
  const a = document.createElement('a');
  a.download = name; a.href = href;
  document.body.appendChild(a); a.click(); a.remove();
}
const blobUrl = (text, type) => URL.createObjectURL(new Blob([text], { type }));
const slug = () => params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rack';
let installEvent = null;

const ACTIONS = {
  svg: () => download(`${slug()}-drawing.svg`, blobUrl(drawSheet(model, unit), 'image/svg+xml')),
  png: () => download(`${slug()}-3d.png`, three.snapshot()),
  csv: () => download(`${slug()}-parts.csv`, blobUrl(toCSV(model, bom, (v) => fmt(v, unit)), 'text/csv')),
  save: () => { download(`${slug()}.rack.json`, blobUrl(projectFile(), 'application/json')); toast('Project file saved to your downloads'); },
  new: () => loadProject(newId(), { name: uniqueName('Untitled rack') }, 'New project'),
  delete: () => {
    if (!window.confirm(`Delete “${params.name}” from this browser? This cannot be undone.`)) return;
    delete projects[currentId];
    const next = Object.values(projects).sort((a, b) => b.updated - a.updated)[0];
    if (next) loadProject(next.id, next.params, 'Project deleted');
    else loadProject(newId(), { name: 'Untitled rack' }, 'Project deleted');
  },
  collapse: () => setCollapsed(!collapsed),
  print: () => {
    // the print stylesheet shows the drawing and the parts list, so both must be current
    $('#sheet').innerHTML = drawSheet(model, unit);
    renderParts();
    window.print();
  },
  share: async () => {
    const diff = Object.fromEntries(Object.entries(params).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(DEFAULTS[k])));
    const url = `${location.origin}${location.pathname}#d=${btoa(unescape(encodeURIComponent(JSON.stringify(diff))))}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { window.prompt('Copy this link', url); }
  },
  reset: () => { setParams({ ...DEFAULTS }); toast('Reset. Undo brings it back.'); },
  install: async () => { if (installEvent) { installEvent.prompt(); installEvent = null; $('#install').hidden = true; } },
};
document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) { closeMenu(); ACTIONS[act.dataset.act]?.(); return; }
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    closeMenu();
    const pr = PRESETS.find((x) => x.id === preset.dataset.preset);
    setParams({ ...DEFAULTS, ...pr.params });
    three.setView('iso');
    setSeg($('#cam'), 'iso');
    return;
  }
  const proj = e.target.closest('[data-project]');
  if (proj) {
    closeMenu();
    const p = projects[proj.dataset.project];
    if (p && p.id !== currentId) loadProject(p.id, p.params, `Opened “${p.name}”`);
    return;
  }
  const fix = e.target.closest('[data-fix]');
  if (fix) { const c = model.checks[+fix.dataset.fix]; if (c?.fix) { setParams(c.fix.patch); toast('Applied. Undo brings it back.'); } }
});
$('#open-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  closeMenu();
  if (!file) return;
  try { openProjectFile(await file.text(), file.name); }
  catch { toast('That file is not a rack project'); }
  e.target.value = '';
});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#install').hidden = false; });

// ---------- phone sheet ----------
const sheet = createSheet($('#panel'), $('#grab'), {
  onSettle: (name, visible) => {
    document.documentElement.style.setProperty('--sheet', `${visible}px`);
    three.resize();
  },
});

buildForm();
$('#app').classList.toggle('collapsed', collapsed);
$('#collapse').setAttribute('aria-expanded', String(!collapsed));
bindFields($('#insp-fields'));
$('#insp-close').addEventListener('click', () => selectPart(null));
try { if (localStorage.getItem(`${STORE}-tip`)) $('#tip').classList.add('gone'); } catch { /* storage blocked */ }
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
