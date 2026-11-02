import DOMPurify from 'dompurify';

/** Web, mail and phone links stay, and so does anything that names no scheme at all; any other scheme goes. */
const LINKS = /^(?:(?:https?|mailto|tel):|#|(?![a-z][a-z0-9+.-]*:))/i;
/** In a drawing a reference may only point inside it, or be a picture's own data. */
const INSIDE = /^(?:#|data:image\/|(?![a-z][a-z0-9+.-]*:))/i;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)[;,]/i;
const WEB = /^(?:https?:)?\/\//i;
/** The classes the renderer writes into its own HTML. An author's own are dropped, so a page cannot borrow the app's (.note, .pop) to draw a fake toast. */
const OWN = /^(?:math|display|math-block|fnref|fnback|toc|mermaid|alert|alert-(?:note|tip|important|warning|caution)|alert-title|tbl|fm|props|rimg|language-[\w+#.-]+)$/;
/** Marks a task box the renderer made. The name is new on every load, so no author can write it: only these boxes may toggle a line. */
export const TASK = 'data-task-' + crypto.randomUUID().slice(0, 8);
/** md Local: where a chip keeps the path of a picture beside the document. Named anew on every load, like TASK, so no author can write it. */
export const REL = __LOCAL__ ? 'data-rel-' + crypto.randomUUID().slice(0, 8) : '';
let strict = false;
// what a drawing's CSS may not do: pull in a file or a picture
const FETCH = /@import|url\s*\(\s*(?!['"]?#)|expression|javascript/i;

/** A picture from the web is never fetched: it becomes a link that names where it lives. */
function chip(img: Element, src: string) {
  const web = WEB.test(src);
  const alt = img.getAttribute('alt')?.trim();
  const el = document.createElement(web ? 'a' : 'span');
  el.className = 'rimg';
  let host = '';
  if (web) {
    try {
      const url = new URL(src, 'https://x.invalid/');
      host = url.host;
      el.setAttribute('href', url.href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    } catch {
      /* not an address; the chip is plain text */
    }
  }
  el.textContent = `${alt ? alt + ' · ' : ''}${host ? 'image from ' + host : 'image not shown'}`;
  // md Local: a picture beside the document keeps its path, for the page to fetch after this
  if (__LOCAL__ && !web && !/^[a-z][a-z0-9+.-]*:|^#|^$/i.test(src)) el.setAttribute(REL, src);
  img.replaceWith(el);
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const tag = node.nodeName;
  if (strict && node.hasAttribute('class')) {
    const keep = node.getAttribute('class')!.split(/\s+/).filter((c) => OWN.test(c));
    if (keep.length) node.setAttribute('class', keep.join(' '));
    else node.removeAttribute('class');
  }
  if (tag === 'A') {
    const href = node.getAttribute('href');
    if (href?.[0] !== '#') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else if (href.length > 1 && !href.startsWith('#user-content-')) {
      // ids in a document are prefixed so they cannot shadow the page's own; links to them follow
      node.setAttribute('href', '#user-content-' + href.slice(1));
    }
  } else if (tag === 'IMG') {
    const src = node.getAttribute('src') ?? '';
    if (!DATA_IMAGE.test(src)) return chip(node, src);
    node.removeAttribute('srcset');
    node.setAttribute('loading', 'lazy');
    node.setAttribute('decoding', 'async');
  } else if (tag === 'INPUT') {
    // the checkbox of a task list is the one control that stays
    if (node.getAttribute('type') !== 'checkbox') return node.remove();
    for (const { name } of [...node.attributes]) if (name !== 'type' && name !== 'checked' && name !== TASK) node.removeAttribute(name);
  } else if (tag === 'style') {
    node.textContent = node.textContent!.replace(/@import[^;]*;?/gi, '').replace(/url\s*\(\s*(?!['"]?#)[^)]*\)/gi, 'none');
  } else if (node.namespaceURI?.endsWith('svg') && FETCH.test(node.getAttribute('style') ?? '')) node.removeAttribute('style');
});

const HTML = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'button', 'select', 'option', 'optgroup', 'textarea', 'fieldset', 'label', 'audio', 'video', 'source', 'track', 'picture', 'iframe', 'frame', 'object', 'embed', 'meta', 'link', 'base', 'map', 'area'],
  FORBID_ATTR: ['style', 'srcset', 'sizes', 'ping', 'poster', 'background', 'formaction', 'action'],
  ADD_ATTR: ['data-tex', TASK, 'data-fn', ...(__LOCAL__ ? [REL] : [])],
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
  ALLOWED_URI_REGEXP: LINKS,
};

// Mermaid's own ids tie its CSS to its shapes, so they are not renamed; each drawing's are unique by construction.
const SVG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['style'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: INSIDE,
};

/** The one cleaner: everything marked produces, and every drawing Mermaid returns, passes through here. */
export function sanitize(html: string, kind: 'html' | 'svg' = 'html'): string {
  strict = kind === 'html';
  try {
    return DOMPurify.sanitize(html, kind === 'svg' ? SVG : HTML);
  } finally {
    strict = false;
  }
}
