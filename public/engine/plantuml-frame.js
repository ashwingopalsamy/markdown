// The PlantUML frame (docs/local.md, Diagram engines). It answers the page that holds it and nothing else.
window.PLANTUML_STDLIB_BASE = '/engine/';
// C4 and other stdlib bundles load as CORS scripts, so the opaque frame needs no CORP exception
window.PLANTUML_STDLIB_LOADER = (name, ok, fail) => {
  if (!/^[\w.-]+\.js$/.test(name)) return fail('Not a bundle md has: ' + name);
  const s = document.createElement('script');
  s.src = '/engine/' + name; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => fail('Failed to load ' + name);
  document.head.append(s);
};
const { renderToString } = await import('/engine/plantuml.js');
onmessage = (e) => {
  const m = e.data;
  if (e.source !== parent || !m || typeof m.id !== 'number' || typeof m.src !== 'string') return;
  const reply = (r) => parent.postMessage({ id: m.id, ...r }, '*');
  try {
    renderToString(m.src.split('\n'), (svg) => reply({ svg }), (err) => reply({ err: String(err) }), { maxSvgSize: 0 });
  } catch (err) {
    reply({ err: String(err) });
  }
};
parent.postMessage({ ready: true }, '*');
