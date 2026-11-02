// The draw.io frame (docs/local.md, Diagram engines). It answers the page that holds it and nothing else.
// A stencil set the viewer wants is not fetched: its name is sent back, the page fetches the file, and the next ask brings it in.
// text in a diagram or a stencil is never run as code (the frame's policy would refuse it anyway)
mxUtils.eval = () => null;
const have = new Set();
let need = new Set();
mxStencilRegistry.loadStencilSet = (url) => {
  const root = STENCIL_PATH + '/';
  const u = String(url).replace(/\.xml$/, '');
  const name = u.startsWith(root) ? u.slice(root.length) : u.split('/').pop();
  if (!have.has(name)) need.add(name);
};
const box = document.body.appendChild(document.createElement('div'));
box.style.width = '1000px';
onmessage = (e) => {
  const m = e.data;
  if (e.source !== parent || !m || typeof m.id !== 'number' || typeof m.xml !== 'string') return;
  const reply = (r) => parent.postMessage({ id: m.id, need: [...need], ...r }, '*');
  let graph;
  try {
    for (const [name, text] of Object.entries(m.stencils ?? {})) {
      if (typeof text !== 'string') continue;
      mxStencilRegistry.parseStencilSet(mxUtils.parseXml(text).documentElement, null, true);
      have.add(name);
    }
    need = new Set();
    const root = mxUtils.parseXml(m.xml).documentElement;
    if (!/^(?:mxfile|mxGraphModel)$/.test(root?.nodeName)) throw new Error('This is not a draw.io diagram.');
    graph = new GraphViewer(box, root, { lightbox: false, nav: false, resize: false, toolbar: null, border: 0, 'auto-fit': false }).graph;
    reply({ svg: new XMLSerializer().serializeToString(graph.getSvg(null, 1, 8)) });
  } catch (err) {
    reply({ err: String((err && err.message) || err) });
  } finally {
    graph?.destroy();
    box.textContent = '';
  }
};
parent.postMessage({ ready: true }, '*');
