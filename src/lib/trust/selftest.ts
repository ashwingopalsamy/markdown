import { NEAR, test, type Probe } from './index';

const HOST = 'blocked.invalid';
const URL_ = `https://${HOST}/`;
const MS = 2000;

/**
 * One attempt. Refused only when the browser reported a CSP violation for it, or the API refused synchronously.
 * A failure with no violation is not proof the policy did it (the name never resolves either), so it says so.
 */
function attempt(
  name: string,
  match: string,
  start: (settle: (refused: boolean, detail: string) => void) => (() => void) | void,
): Promise<Probe> {
  return new Promise((res) => {
    let end: (() => void) | void;
    let timer: ReturnType<typeof setTimeout>;
    let hit: SecurityPolicyViolationEvent | null = null;
    let finished = false;
    const finish = (p: Probe) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      document.removeEventListener('securitypolicyviolation', onViolation, true);
      try { end?.(); } catch { /* cleanup is best effort */ }
      res(p);
    };
    const blocked = (e: SecurityPolicyViolationEvent) => ({ name, refused: true, detail: `blocked by ${e.effectiveDirective}` });
    function onViolation(e: SecurityPolicyViolationEvent) {
      if (!e.blockedURI.includes(match)) return;
      hit = e;
      finish(blocked(e));
    }
    document.addEventListener('securitypolicyviolation', onViolation, true);
    timer = setTimeout(() => finish({ name, refused: false, detail: 'no result within 2 s' }), MS);
    const settle = (refused: boolean, detail: string) =>
      // The violation event can land just after the failure; give it a moment before judging.
      setTimeout(() => finish(hit ? blocked(hit) : { name, refused, detail }), 50);
    try { end = start(settle); } catch (e) { settle(false, `threw ${e instanceof Error ? e.name : 'an error'} with no policy violation`); }
  });
}

const noPolicy = 'failed, but no policy violation was reported';

type Start = [string, string, (s: (r: boolean, d: string) => void) => (() => void) | void];

/** md Local (docs/local.md): the page may talk to md on this machine, and nothing else. These take the place of the hosted probe that fetches its own file. */
const LOCAL: Start[] = __LOCAL__ ? [
  ['another port on this machine', NEAR, (s) => {
    const c = new AbortController();
    fetch(`http://${NEAR}/`, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: c.signal }).then(() => s(false, 'the request completed'), () => s(false, noPolicy));
    return () => c.abort();
  }],
  ['a file by its path', '/api/', (s) => {
    // the capability opens documents by the ID the server gave them; a path in its place names nothing
    import('../store/server').then(({ api }) => api(`/api/doc/${encodeURIComponent('/etc/hosts')}`)).then(
      (r) => s(!r.ok, r.ok ? 'the server sent the file' : `refused (${r.status}): documents open only by the ID md gave them`),
      () => s(false, 'md did not answer'),
    );
  }],
] : [];

const probes: Start[] = [
  ['fetch', HOST, (s) => {
    const c = new AbortController();
    fetch(URL_, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: c.signal })
      .then(() => s(false, 'the request completed'), () => s(false, noPolicy));
    return () => c.abort();
  }],
  ['XMLHttpRequest', HOST, (s) => {
    const x = new XMLHttpRequest();
    x.timeout = MS;
    x.onloadend = () => s(false, x.status ? `answered ${x.status}` : noPolicy);
    x.open('GET', URL_);
    x.send();
    return () => x.abort();
  }],
  ['WebSocket', HOST, (s) => {
    const w = new WebSocket(`wss://${HOST}/`);
    w.onopen = () => s(false, 'the socket opened');
    w.onerror = w.onclose = () => s(false, noPolicy);
    return () => { w.onopen = w.onerror = w.onclose = null; w.close(); };
  }],
  ['sendBeacon', HOST, (s) => {
    if (!navigator.sendBeacon) return s(true, 'not available in this browser');
    s(false, navigator.sendBeacon(URL_, 'x') ? 'queued with no policy violation' : 'the browser would not queue it');
  }],
  ['EventSource', HOST, (s) => {
    if (typeof EventSource === 'undefined') return s(true, 'not available in this browser');
    const e = new EventSource(URL_);
    e.onerror = () => s(false, noPolicy);
    e.onopen = () => s(false, 'the stream opened');
    return () => e.close();
  }],
  ['image', HOST, (s) => {
    const i = new Image();
    i.onload = () => s(false, 'the picture loaded');
    i.onerror = () => s(false, noPolicy);
    i.src = URL_ + 'p.png';
    return () => { i.onload = i.onerror = null; i.src = ''; };
  }],
  ...(__LOCAL__ ? LOCAL : [['own file by fetch', '/trust.json', (s) => {
    const c = new AbortController();
    fetch('/trust.json', { cache: 'no-store', signal: c.signal }).then(() => s(false, 'the page can fetch its own files'), () => s(false, noPolicy));
    return () => c.abort();
  }] as Start]),
  ['frame from another site', HOST, (s) => {
    const f = document.createElement('iframe');
    f.hidden = true;
    f.onload = f.onerror = () => s(false, noPolicy);
    f.src = URL_;
    document.body.append(f);
    return () => f.remove();
  }],
  ['fetch from a diagram engine', 'probe.invalid', (s) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.hidden = true;
    const on = (e: MessageEvent) => {
      if (e.source === f.contentWindow && typeof e.data?.probe === 'string') s(e.data.refused === true, e.data.probe);
    };
    addEventListener('message', on);
    f.src = '/engine/probe.html';
    document.body.append(f);
    return () => (removeEventListener('message', on), f.remove());
  }],
  ['script tag', HOST, (s) => {
    const e = document.createElement('script');
    e.onload = () => s(false, 'the script loaded');
    e.onerror = () => s(false, noPolicy);
    e.src = URL_ + 'x.js';
    document.head.append(e);
    return () => e.remove();
  }],
  ['eval', 'eval', (s) => {
    // A deliberate probe, written plainly: the build audit lists it, with this reason, in its allowlist.
    try { new Function('return 1')(); s(false, 'code from a string ran'); } catch (e) { s(true, `threw ${e instanceof Error ? e.name : 'an error'}`); }
  }],
];

const PAYLOADS: [string, string][] = [
  ['script tag', '<p>a</p><script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['svg onload', '<svg onload=alert(1)><circle r=1 /></svg>'],
  ['javascript: link', '<a href="javascript:alert(1)">x</a>'],
  ['data:text/html link', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['style @import', `<style>@import url(${URL_}x.css);</style><p>x</p>`],
  ['meta refresh', `<meta http-equiv="refresh" content="0;url=${URL_}">`],
  ['base href', `<base href="${URL_}"><a href="x">x</a>`],
  ['form action', `<form action="${URL_}"><input name=a><button>go</button></form>`],
  ['math mutation', '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">'],
  ['object', `<object data="${URL_}x.swf"></object><embed src="${URL_}x.swf">`],
  ['style attribute url', `<div style="background:url(${URL_}x)">x</div>`],
];

const BAD_TAGS = 'script,iframe,frame,frameset,object,embed,form,meta,base,link';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'srcdoc', 'poster'];

function findings(html: string): string[] {
  const t = document.createElement('template'); // inert: nothing in its content runs or loads, and it is never attached
  t.innerHTML = html;
  const out: string[] = [];
  for (const el of t.content.querySelectorAll('*')) {
    const tag = el.localName;
    if (el.matches(BAD_TAGS)) out.push(`<${tag}> survived`);
    if (tag === 'style' && /url\(|@import/i.test(el.textContent ?? '')) out.push('<style> with a url');
    for (const a of el.attributes) {
      const v = a.value.replace(/[\u0000- ]/g, '');
      if (/^on/i.test(a.name)) out.push(`${a.name} on <${tag}>`);
      else if (a.name === 'style' && /url\(|@import/i.test(a.value)) out.push(`style url on <${tag}>`);
      else if (URL_ATTRS.includes(a.name.toLowerCase()) && (a.name.toLowerCase() === 'srcdoc' || /^(?:javascript|vbscript|data:text)/i.test(v))) out.push(`${a.name} on <${tag}>`);
    }
  }
  return out;
}

export async function selfTest(sanitize: (html: string) => string): Promise<Probe[]> {
  const out: Probe[] = [];
  test.on = true;
  try {
    for (const [name, match, start] of probes) out.push(await attempt(name, match, start));
  } finally {
    // a violation can be reported a moment after the attempt that caused it
    setTimeout(() => (test.on = false), 1000);
  }
  for (const [name, payload] of PAYLOADS) {
    try {
      const f = findings(sanitize(payload));
      out.push({ name: `sanitizer: ${name}`, refused: !f.length, detail: f.length ? [...new Set(f)].join(', ') : 'nothing dangerous left' });
    } catch (e) {
      out.push({ name: `sanitizer: ${name}`, refused: false, detail: `sanitize threw: ${e instanceof Error ? e.message : e}` });
    }
  }
  return out;
}
