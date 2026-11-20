// Bottom sheet for phones. Three detents (peek, half, full). The sheet tracks the finger
// 1:1 from wherever it currently is, rubber-bands past its limits, and on release goes to
// the detent nearest to where the gesture was heading, not where it happened to stop.

const NARROW = '(max-width: 719px)';

const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
// Apple's scroll-deceleration projection: where would this velocity come to rest?
const project = (v, rate = 0.994) => ((v / 1000) * rate) / (1 - rate);

export function createSheet(el, grab, { onSettle } = {}) {
  const mq = window.matchMedia(NARROW);
  let detent = 'half';
  let drag = null;

  const visible = () => {
    const h = el.offsetHeight;
    return { peek: Math.min(h, 132), half: Math.min(h, Math.round(window.innerHeight * 0.46)), full: h };
  };
  const yFor = (name) => el.offsetHeight - visible()[name];
  const currentY = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;

  function place(name, animate = true) {
    detent = name;
    if (!mq.matches) { el.style.transform = ''; el.style.transition = ''; onSettle?.(name, 0); return; }
    if (!el.offsetHeight) return;                        // hidden (Parts and Checks); placed again when shown
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = animate && !reduce ? 'transform 460ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = `translateY(${yFor(name)}px)`;
    el.dataset.detent = name;
    grab.setAttribute('aria-expanded', String(name !== 'peek'));
    onSettle?.(name, visible()[name === 'full' ? 'half' : name]);
  }

  grab.addEventListener('pointerdown', (e) => {
    if (!mq.matches || drag) return;                     // ignore a second finger mid-drag
    grab.setPointerCapture(e.pointerId);
    // Start from where the sheet is on screen right now, even mid-animation.
    const y = currentY();
    el.style.transition = 'none';
    el.style.transform = `translateY(${y}px)`;
    drag = { id: e.pointerId, startY: e.clientY, baseY: y, moved: false, hist: [{ t: e.timeStamp, y: e.clientY }] };
  });
  grab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return;
    drag.moved = true;
    const max = yFor('peek');
    let y = drag.baseY + dy;
    if (y < 0) y = rubber(y, el.offsetHeight);
    else if (y > max) y = max + rubber(y - max, el.offsetHeight);
    el.style.transform = `translateY(${y}px)`;
    drag.hist.push({ t: e.timeStamp, y: e.clientY });
    if (drag.hist.length > 6) drag.hist.shift();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) { place(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek'); return; }
    const a = d.hist[0], b = d.hist[d.hist.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;   // px/s, down is positive
    const landing = currentY() + project(v);
    const names = ['full', 'half', 'peek'];
    place(names.reduce((best, n) => (Math.abs(yFor(n) - landing) < Math.abs(yFor(best) - landing) ? n : best), names[0]));
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
  grab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek', false); }
  });

  const refresh = () => place(detent, false);
  mq.addEventListener('change', refresh);
  window.addEventListener('resize', refresh);
  refresh();

  return { place, refresh, get detent() { return detent; }, get narrow() { return mq.matches; } };
}
