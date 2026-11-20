// Pan and zoom for the working drawing. One finger (or a mouse drag) pans, two fingers
// pinch, the wheel zooms about the cursor and a double tap zooms in or back out.
// While a gesture is running the drawing is moved with a GPU transform; when it ends the
// SVG is re-laid-out at the new size so lines and text are sharp again.

export function createPanZoom(host, { onInteract } = {}) {
  let svg = null;
  let k = 1, x = 0, y = 0;       // zoom (1 = whole drawing fits) and offset in px
  let kc = 1;                    // zoom the SVG is currently laid out at
  let base = { w: 0, h: 0, cw: 0, ch: 0 };
  let fitted = false, moved = false, commitTimer = 0, lastTap = null;
  const pts = new Map();
  const MIN = 0.6, MAX = 14;

  function measure() {
    const vb = svg.viewBox.baseVal, cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch || !vb.width) return false;
    const pad = 10, s = Math.min((cw - 2 * pad) / vb.width, (ch - 2 * pad) / vb.height);
    base = { w: vb.width * s, h: vb.height * s, cw, ch };
    return true;
  }
  function apply(commit) {
    if (!svg) return;
    if (commit) {
      kc = k;
      svg.style.width = `${base.w * kc}px`;
      svg.style.height = `${base.h * kc}px`;
    }
    svg.style.transform = `translate(${x}px, ${y}px) scale(${k / kc})`;
  }
  const commitSoon = () => { clearTimeout(commitTimer); commitTimer = setTimeout(() => apply(true), 140); };
  // keep a good part of the drawing on screen so it can never be lost
  function clamp() {
    const w = base.w * k, h = base.h * k, m = 70;
    x = Math.min(base.cw - m, Math.max(m - w, x));
    y = Math.min(base.ch - m, Math.max(m - h, y));
  }
  function fit() {
    if (!svg || !measure()) return;
    k = 1; x = (base.cw - base.w) / 2; y = (base.ch - base.h) / 2;
    fitted = true;
    apply(true);
  }
  // Call after the drawing is rebuilt or its pane becomes visible. The current zoom is kept.
  function attach() {
    svg = host.querySelector('svg');
    if (!svg) return;
    const was = base.cw;
    if (!measure()) return;
    if (!fitted || was !== base.cw) fit(); else { clamp(); apply(true); }
  }
  function zoomAt(px, py, factor) {
    const nk = Math.min(MAX, Math.max(MIN, k * factor));
    x = px - (px - x) * (nk / k);
    y = py - (py - y) * (nk / k);
    k = nk;
    clamp();
    apply(false);
  }
  const local = (e) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pts.size) moved = false;
    pts.set(e.pointerId, local(e));
    if (pts.size === 2) moved = true;
    onInteract?.();
  });
  window.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev || !svg) return;
    const now = local(e);
    if (pts.size === 1) {
      if (!moved && Math.hypot(now.x - prev.x, now.y - prev.y) < 6) return;   // still a tap
      moved = true;
      x += now.x - prev.x; y += now.y - prev.y;
      clamp();
      apply(false);
    } else if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(now.x - other.x, now.y - other.y);
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }, m1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      x += m1.x - m0.x; y += m1.y - m0.y;
      if (d0 > 0) zoomAt(m1.x, m1.y, d1 / d0); else apply(false);
    }
    pts.set(e.pointerId, now);
  });
  const up = (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    pts.delete(e.pointerId);
    if (pts.size) return;
    if (moved) { apply(true); lastTap = null; return; }
    // double tap: zoom in on the spot, or back out to the whole drawing
    if (e.pointerType !== 'mouse') {
      if (lastTap && e.timeStamp - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        lastTap = null;
        if (k > 1.15) fit(); else { zoomAt(p.x, p.y, 2.6); apply(true); }
      } else lastTap = { t: e.timeStamp, x: p.x, y: p.y };
    }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // a drag must not also count as a tap on a dimension
  host.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  host.addEventListener('dblclick', (e) => { const p = local(e); if (k > 1.15) fit(); else { zoomAt(p.x, p.y, 2.6); apply(true); } });
  host.addEventListener('wheel', (e) => {
    if (!svg) return;
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)));
    commitSoon();
    onInteract?.();
  }, { passive: false });
  new ResizeObserver(() => { if (svg && host.clientWidth && host.clientWidth !== base.cw) fit(); }).observe(host);

  return {
    attach, fit,
    zoomBy(factor) { if (svg && measure()) { zoomAt(base.cw / 2, base.ch / 2, factor); apply(true); } },
  };
}
