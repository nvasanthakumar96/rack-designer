// three.js view. Steel is drawn plate by plate with every slot and drilled hole cut out,
// bolts are instanced, and boards are separate meshes so they can be lifted out of their
// seats to show how the rack goes together.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STEEL_COLORS, BOARD_COLORS } from './model.js';

const MM = 0.001;
const VEC = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const DIM = { x: 'w', y: 'h', z: 'd' };

function holePath(h) {
  const path = new THREE.Path();
  const r = h.d / 2, half = Math.max(0, (h.l || 0) - h.d) / 2;
  const n = 5;
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; pts.push([h.u + half + r * Math.cos(a), h.v + r * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; pts.push([h.u - half + r * Math.cos(a), h.v + r * Math.sin(a)]); }
  path.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) path.lineTo(...pts[i]);
  path.closePath();
  return path;
}

function plateGeometry(pl) {
  const U = pl[DIM[pl.len]], V = pl[DIM[pl.wid]], T = pl[DIM[pl.thick]];
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(U, 0); shape.lineTo(U, V); shape.lineTo(0, V); shape.closePath();
  for (const h of pl.holes) shape.holes.push(holePath(h));
  const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  // Keep the basis right-handed so face winding (and lighting) stays correct.
  const w = new THREE.Vector3().crossVectors(VEC[pl.len], VEC[pl.wid]);
  const o = new THREE.Vector3(pl.x, pl.y, pl.z);
  if (w[pl.thick] < 0) o[pl.thick] += T;
  g.applyMatrix4(new THREE.Matrix4().makeBasis(VEC[pl.len], VEC[pl.wid], w).setPosition(o));
  return g;
}

function barGeometry(part) {
  const b = part.bar;
  const g = new THREE.BoxGeometry(part.len, b.w, b.t).toNonIndexed();
  g.rotateZ(Math.atan2(b.y2 - b.y1, b.x2 - b.x1));
  g.translate((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, b.z + b.t / 2);
  return g;
}

const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const easeOut = (t) => 1 - (1 - t) ** 3;

export function createView(container, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.zoomToCursor = true;

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 0.5));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  let grid;
  const setGrid = () => {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = darkScene() ? new THREE.GridHelper(30, 60, 0x4a4a4f, 0x343437) : new THREE.GridHelper(30, 60, 0xc5c8ce, 0xdfe1e5);
    grid.position.y = -0.0006;
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    grid.visible = gridOn;
    scene.add(grid);
    floor.material.opacity = darkScene() ? 0.45 : 0.2;
    dirty = true;
  };
  // Background colour of the 3D view. null follows the light or dark theme.
  let bgHex = null, gridOn = true;
  const darkScene = () => {
    if (!bgHex) return dark();
    const c = new THREE.Color(bgHex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.18;   // linear luminance
  };
  function setBackground(hex, showGrid = true) {
    bgHex = hex || null;
    gridOn = showGrid;
    container.style.background = bgHex || '';
    container.dataset.dark = darkScene();
    setGrid();
  }
  scene.add(floor);

  const mats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.42 }),
    board: new THREE.MeshStandardMaterial({ color: 0xd9bb8d, roughness: 0.78, metalness: 0 }),
    zinc: new THREE.MeshStandardMaterial({ color: 0xc3c7cd, metalness: 0.9, roughness: 0.3 }),
    foot: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.55, metalness: 0.2 }),
    edge: new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  };

  // The rack lives in a group scaled mm -> m and centred on the origin.
  const rack = new THREE.Group();
  rack.scale.setScalar(MM);
  const boardGroup = new THREE.Group();
  rack.add(boardGroup);
  scene.add(rack);

  const size = new THREE.Vector3(2.4, 1.2, 0.7);
  let dirty = true, userMoved = false, framed = false;
  let lift = 0, liftTarget = 0, liftBy = 160;
  let fly = null;
  const dirs = {
    iso: new THREE.Vector3(0.52, 0.36, 0.78), front: new THREE.Vector3(0, 0.02, 1),
    side: new THREE.Vector3(1, 0.02, 0), top: new THREE.Vector3(0, 1, 0.001), back: new THREE.Vector3(-0.45, 0.3, -0.84),
  };
  let lastDir = 'iso';

  function frameFor(name) {
    const dir = dirs[name].clone().normalize();
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    const dist = (size.length() / 2 / Math.sin(Math.min(v, h))) * 1.04;
    const target = new THREE.Vector3(0, size.y * 0.5, 0);
    return { target, position: target.clone().addScaledVector(dir, dist) };
  }
  // Move the camera to a named view. The move is short, eases out and can be interrupted by a drag.
  function setView(name = lastDir, animate = true) {
    lastDir = name;
    const to = frameFor(name);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce || !framed) {
      controls.target.copy(to.target); camera.position.copy(to.position); controls.update();
      fly = null;
    } else {
      fly = { t0: performance.now(), dur: 380, fromT: controls.target.clone(), fromP: camera.position.clone(), ...to };
    }
    framed = true; userMoved = false; dirty = true;
  }
  controls.addEventListener('start', () => { fly = null; userMoved = true; });
  controls.addEventListener('change', () => { dirty = true; });

  // One material per kind of part, so a tapped part can light up on its own.
  const KINDS = ['post', 'centre', 'rail', 'cross', 'brace'];
  const kindMats = Object.fromEntries(KINDS.map((k) => [k, mats.steel.clone()]));
  const litMats = { ...kindMats, board: mats.board, bolt: mats.zinc, foot: mats.foot };
  let selected = null, boardHex = '#d9bb8d';
  function setSelected(kind) {
    selected = kind;
    for (const [k, m] of Object.entries(litMats)) {
      m.emissive.set(k === kind ? 0x0a84ff : 0x000000);
      m.emissiveIntensity = k === kind ? (k === 'board' ? 0.12 : 0.6) : 0;
    }
    // wood is pale, so a selected board is tinted as well as lit
    mats.board.color.set(boardHex);
    if (kind === 'board') mats.board.color.lerp(new THREE.Color(0x0a84ff), 0.42);
    dirty = true;
  }
  let pickables = [];
  const raycaster = new THREE.Raycaster();
  let press = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const p0 = press;
    press = null;
    // a tap, not the end of an orbit drag
    if (!p0 || Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 6 || e.timeStamp - p0.t > 600) return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(pickables.filter((o) => o.parent.visible), false)[0];
    onPick?.(hit ? hit.object.userData.pick : null);
  });

  let disposables = [];
  function clear() {
    for (const o of disposables) { o.geometry?.dispose(); o.parent?.remove(o); o.dispose?.(); }
    disposables = [];
  }
  const add = (o, parent = rack, shadow = true) => {
    o.castShadow = shadow; o.receiveShadow = shadow;
    parent.add(o); disposables.push(o);
    return o;
  };

  function update(model, opts = {}) {
    clear();
    const { p, B } = model;
    mats.steel.color.set(STEEL_COLORS[p.steelColor].hex);
    mats.steel.metalness = p.steelColor === 'zinc' ? 0.9 : 0.55;
    mats.steel.roughness = p.steelColor === 'zinc' ? 0.34 : 0.45;
    boardHex = BOARD_COLORS[p.boardColor].hex;
    setSelected(selected);

    pickables = [];
    const pick = (o, kind) => { o.userData.pick = kind; pickables.push(o); return o; };
    const byKind = {};
    for (const part of model.parts) {
      const geos = (byKind[part.group] ||= []);
      if (part.bar) geos.push(barGeometry(part));
      for (const pl of part.plates) geos.push(plateGeometry(pl));
    }
    for (const [kind, geos] of Object.entries(byKind)) {
      for (const g of geos) g.deleteAttribute('uv');
      const m = kindMats[kind];
      m.color.copy(mats.steel.color); m.metalness = mats.steel.metalness; m.roughness = mats.steel.roughness;
      pick(add(new THREE.Mesh(mergeGeometries(geos, false), m)), kind);
      geos.forEach((g) => g.dispose());
    }

    boardGroup.visible = !opts.hideBoards;
    for (const b of model.boards) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      g.translate(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2);
      const mesh = pick(add(new THREE.Mesh(g, mats.board), boardGroup), 'board');
      mesh.userData.level = b.level;
      const lines = add(new THREE.LineSegments(new THREE.EdgesGeometry(g), mats.edge), boardGroup, false);
      lines.userData.level = b.level;
    }
    liftBy = Math.min(220, Math.max(90, (model.tiers.length ? Math.min(...model.tiers.map((t) => t.railClear)) : 400) * 0.35));

    // Bolts: round parts (button heads) and hexagonal parts (hex heads, nuts) as two instanced meshes.
    const round = [], hex = [];
    for (const b of model.bolts) {
      const inner = b.out > 0 ? b.lo : b.hi, outer = b.out > 0 ? b.hi : b.lo;
      const at = (along) => { const v = new THREE.Vector3(b.x, b.y, b.z); v[b.axis] = along; return v; };
      const nut = { r: B.af / 2 / Math.cos(Math.PI / 6), h: B.nut }, head = { r: B.af / 2 / Math.cos(Math.PI / 6), h: B.hex };
      if (b.kind === 'csk') hex.push({ ...nut, pos: at(outer + b.out * B.nut / 2), axis: b.axis });
      else if (b.kind === 'frame' && p.head === 'button') {
        round.push({ r: B.d * 0.9, h: B.button, pos: at(inner - b.out * B.button / 2), axis: b.axis });
        hex.push({ ...nut, pos: at(outer + b.out * B.nut / 2), axis: b.axis });
      } else {
        hex.push({ ...head, pos: at(outer + b.out * B.hex / 2), axis: b.axis });
        hex.push({ ...nut, pos: at(inner - b.out * B.nut / 2), axis: b.axis });
      }
    }
    const instanced = (list, geo) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mats.zinc, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      list.forEach((it, i) => {
        q.setFromUnitVectors(VEC.y, VEC[it.axis]);
        m.compose(it.pos, q, s.set(it.r, it.h, it.r));
        mesh.setMatrixAt(i, m);
      });
      pick(add(mesh), 'bolt');
    };
    instanced(round, new THREE.CylinderGeometry(1, 1, 1, 18));
    instanced(hex, new THREE.CylinderGeometry(1, 1, 1, 6));

    // Feet
    const footGeos = [];
    for (const f of model.feet) {
      if (f.type === 'cap') {
        const g = new THREE.BoxGeometry(p.postA + 4, f.h, p.postA + 4); g.translate(f.x, f.h / 2, f.z); footGeos.push(g);
      } else {
        const pad = Math.min(f.h * 0.4, 10);
        const g1 = new THREE.CylinderGeometry(19, 22, pad, 28); g1.translate(f.x, pad / 2, f.z);
        const g2 = new THREE.CylinderGeometry(5, 5, f.h - pad + 14, 12); g2.translate(f.x, pad + (f.h - pad + 14) / 2, f.z);
        const g3 = new THREE.BoxGeometry(30, 4, 30); g3.translate(f.x, f.h + 2, f.z);
        footGeos.push(g1, g2, g3);
      }
    }
    if (footGeos.length) {
      const g = mergeGeometries(footGeos.map((x) => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); return n; }), false);
      pick(add(new THREE.Mesh(g, mats.foot)), 'foot');
    }

    rack.position.set((-p.L / 2) * MM, 0, (-p.D / 2) * MM);
    const before = size.clone();
    size.set(p.L * MM, p.H * MM, p.D * MM);
    const r = Math.max(size.x, size.y, size.z);
    sun.position.set(r * 0.7, r * 1.9, r * 1.2);
    const c = sun.shadow.camera;
    c.left = c.bottom = -r * 1.3; c.right = c.top = r * 1.3; c.near = 0.1; c.far = r * 6;
    c.updateProjectionMatrix();
    if (!framed) setView('iso', false);
    else if (!userMoved && before.distanceTo(size) > 0.001) setView(lastDir, true);
    applyLift();
    dirty = true;
  }

  function applyLift() {
    for (const o of boardGroup.children) o.position.y = lift * liftBy * (1 + 0.35 * (o.userData.level || 0));
  }
  function setExplode(on) { liftTarget = on ? 1 : 0; dirty = true; }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (framed && !userMoved) setView(lastDir, false);
    dirty = true;
  }
  new ResizeObserver(resize).observe(container);
  resize();
  setGrid();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setGrid);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.dur), k = easeOut(t);
      controls.target.lerpVectors(fly.fromT, fly.target, k);
      camera.position.lerpVectors(fly.fromP, fly.position, k);
      if (t >= 1) fly = null;
      dirty = true;
    }
    if (Math.abs(liftTarget - lift) > 0.0005) {
      // Critically damped approach, so the boards can be reversed at any moment without a jump.
      lift += (liftTarget - lift) * (1 - Math.exp(-dt * 11));
      applyLift();
      dirty = true;
    } else if (lift !== liftTarget) { lift = liftTarget; applyLift(); dirty = true; }
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  });

  // PNG export with a solid background so the image works anywhere.
  function snapshot() {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bgHex || (dark() ? '#1c1c1e' : '#f5f5f7');
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
    return c.toDataURL('image/png');
  }

  return { update, setView, setExplode, setSelected, setBackground, snapshot, resize };
}
