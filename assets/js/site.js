// Pause decorative animations while their section is off-screen or the tab is hidden.
(() => {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('is-paused', !e.isIntersecting);
  });
  els.forEach((el) => io.observe(el));
  document.addEventListener('visibilitychange', () => {
    els.forEach((el) => el.classList.toggle('is-paused', document.hidden));
  });
})();
