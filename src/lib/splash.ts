const MIN_VISIBLE_MS = 400;
let scheduled = false;

export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el || el.dataset.done || scheduled) return;
  scheduled = true;
  const shownAt = (window as Window & { __splashAt?: number }).__splashAt ?? 0;
  const remaining = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
  setTimeout(() => {
    requestAnimationFrame(() => {
      el.dataset.done = "1";
      el.removeAttribute("aria-busy");
    });
  }, remaining);
}
