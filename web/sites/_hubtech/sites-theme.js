/* HUBTECH look for the original pages – only when they run inside the platform (iframe).
   Opened on their own ("Nyt vindue") they keep their original design. */
(function () {
  if (window.parent === window) return;
  var root = document.documentElement;
  var path = location.pathname;
  root.classList.add('in-hubtech');
  root.setAttribute('data-page', (path.split('/').pop() || 'index.html').replace(/\.html$/, ''));
  root.setAttribute('data-site', path.indexOf('/archive-01/') > -1 ? 'archive' : 'classic');
  function sync() {
    try {
      var t = parent.document.documentElement.getAttribute('data-theme') || 'dark';
      root.setAttribute('data-theme', t);
    } catch (e) { root.setAttribute('data-theme', 'dark'); }
  }
  sync();
  try { new MutationObserver(sync).observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* */ }
})();
