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
