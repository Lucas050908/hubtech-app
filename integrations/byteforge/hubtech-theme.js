/* HUBTECH: when the ByteForge panel runs inside HUBTECH (iframe, or opened with ?ht=1),
   use the recoloured stylesheet so it matches the platform. On its own ByteForge looks as always. */
(function () {
  var embedded = false;
  try { embedded = window.top !== window.self || /[?&]ht=1/.test(location.search) || sessionStorage.getItem('bf-ht') === '1'; } catch (e) { embedded = window.top !== window.self; }
  if (!embedded) return;
  try { sessionStorage.setItem('bf-ht', '1'); } catch (e) { /* */ }
  var link = document.querySelector('link[href="byteforge-platform.css"]');
  if (link) link.setAttribute('href', 'hubtech-platform.css');
  document.documentElement.classList.add('in-hubtech');
})();
