
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[data-app]').forEach(a => {
    a.addEventListener('click', () => {
      try {
        localStorage.setItem('calireps_site_cta_click', new Date().toISOString());
      } catch (_) {}
    });
  });
});
