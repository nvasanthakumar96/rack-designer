// Side drawer for phones. The settings panel slides in from the left over the model.
// It opens from a button and closes with the scrim, the button, or a swipe to the left.
// Vertical movement is left to the browser (native scrolling), so the list scrolls
// smoothly; only a clearly sideways drag moves the drawer.

const NARROW = '(max-width: 719px)';
// Apple's scroll-deceleration projection: where would this velocity come to rest?
const project = (v, rate = 0.994) => ((v / 1000) * rate) / (1 - rate);

export function createDrawer(el, scrim, { onChange } = {}) {
  const mq = window.matchMedia(NARROW);
  let open = false, drag = null;
  const currentX = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;

  function set(next, animate = true) {
    open = next;
    if (!mq.matches) {
      el.style.transform = el.style.transition = '';
      el.inert = false;
      scrim.hidden = true;
      onChange?.(false);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = animate && !reduce ? 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = open ? 'translateX(0)' : 'translateX(-104%)';
    el.inert = !open;                       // nothing inside can be focused while it is off screen
    scrim.hidden = false;
    scrim.style.transition = animate ? 'opacity 300ms ease' : 'none';
    scrim.style.opacity = open ? 1 : 0;
    scrim.style.pointerEvents = open ? 'auto' : 'none';
    onChange?.(open);
  }

  el.addEventListener('pointerdown', (e) => {
    if (!mq.matches || !open || drag) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: currentX(), locked: false, hist: [{ t: e.timeStamp, x: e.clientX }] };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // a scroll, not ours
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      drag.locked = true;
      drag.x0 = e.clientX;                  // no jump when the drag takes over
      el.setPointerCapture(e.pointerId);
      el.style.transition = scrim.style.transition = 'none';
      return;
    }
    const x = Math.min(0, drag.base + (e.clientX - drag.x0));
    el.style.transform = `translateX(${x}px)`;
    scrim.style.opacity = Math.max(0, 1 + x / el.offsetWidth);
    drag.hist.push({ t: e.timeStamp, x: e.clientX });
    if (drag.hist.length > 6) drag.hist.shift();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.locked) return;
    const a = d.hist[0], b = d.hist[d.hist.length - 1];
    const v = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;   // px/s, right is positive
    set(currentX() + project(v) > -el.offsetWidth / 2);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  scrim.addEventListener('click', () => set(false));
  mq.addEventListener('change', () => set(false, false));
  set(false, false);

  return { set, toggle: () => set(!open), get open() { return open; }, get narrow() { return mq.matches; } };
}
