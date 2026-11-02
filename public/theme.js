// Sets the theme, width, text size, colours and typeface before first paint. External, so script-src stays 'self'.
(function () {
  var d = document.documentElement, s = {};
  try { ['theme', 'width', 'text', 'palette', 'face'].forEach(function (k) { s[k] = localStorage.getItem('md-' + k); }); } catch (e) {}
  var t = s.theme, m = matchMedia('(prefers-color-scheme: dark)');
  var set = function () { d.dataset.theme = t === 'light' || t === 'dark' ? t : m.matches ? 'dark' : 'light'; };
  set();
  if (t !== 'light' && t !== 'dark') m.addEventListener('change', set);
  if (s.width && /^[\w-]{1,12}$/.test(s.width)) d.dataset.width = s.width;
  // the rest is the app page's; the guide pages keep their own look
  if (!/^\/(?:index\.html)?$/.test(location.pathname)) return;
  if (/^(?:90|110|125|140)$/.test(s.text)) d.style.setProperty('--text', s.text / 100);
  [['palette', /^(?:paper|calm)$/], ['face', /^(?:literata|newsreader)$/]].forEach(function (p) {
    if (!p[1].test(s[p[0]])) return;
    d.dataset[p[0]] = s[p[0]];
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/look/' + s[p[0]] + '.css'; l.setAttribute('blocking', 'render');
    document.head.appendChild(l);
  });
})();
