import { linkReleases } from './releases.ts';

// The before-and-after sliders: dragging across a picture, or its range control, moves the divide
// between the end-of-retail view and the classic one.
for (const slider of document.querySelectorAll<HTMLElement>('[data-slider]')) {
  const cut = slider.parentElement?.querySelector<HTMLInputElement>('.cut');
  if (!cut) continue;
  const set = (v: number) => slider.style.setProperty('--cut', `${v}%`);
  cut.addEventListener('input', () => set(Number(cut.value)));
  let dragging = false;
  const move = (e: PointerEvent) => {
    const r = slider.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    cut.value = String(Math.round(v));
    set(v);
  };
  slider.addEventListener('pointerdown', (e) => {
    dragging = true;
    slider.setPointerCapture(e.pointerId);
    move(e);
  });
  slider.addEventListener('pointermove', (e) => {
    if (dragging) move(e);
  });
  slider.addEventListener('pointerup', () => (dragging = false));
  slider.addEventListener('pointercancel', () => (dragging = false));
}

// The screenshot carousels: a dot for each slide, the one shown lit; the buttons and dots scroll
// the track to a slide, and scrolling it by hand (or by its arrow keys) lights the dot it stops on.
for (const carousel of document.querySelectorAll<HTMLElement>('[data-carousel]')) {
  const track = carousel.querySelector<HTMLElement>('.track');
  const dots = carousel.querySelector<HTMLElement>('.dots');
  if (!track || !dots) continue;
  const slides = [...track.children] as HTMLElement[];
  const at = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const go = (i: number) =>
    track.scrollTo({ left: ((i + slides.length) % slides.length) * track.clientWidth });
  const marks = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Screenshot ${i + 1}`);
    dot.addEventListener('click', () => go(i));
    return dot;
  });
  dots.append(...marks);
  const light = () => marks.forEach((m, i) => m.setAttribute('aria-current', String(i === at())));
  light();
  track.addEventListener('scroll', light, { passive: true });
  for (const step of carousel.querySelectorAll<HTMLElement>('[data-step]'))
    step.addEventListener('click', () => go(at() + Number(step.dataset.step)));
}

// Each program's heading links to its latest release.
void linkReleases();
