export interface Probe { name: string; refused: boolean; detail: string }

const seen = new Set<string>();
const reqs: { url: string; initiator: string; external: boolean }[] = [];
const viol: { directive: string; blocked: string; at: number }[] = [];
const subs = new Set<() => void>();
let started = false;

const notify = () => subs.forEach((f) => f());
// Only a host for another origin: a path or query could carry what the page is promising not to send.
const where = (u: string): { shown: string; external: boolean } => {
  try {
    const x = new URL(u, location.href);
    return x.origin === location.origin ? { shown: x.pathname, external: false } : { shown: x.host || x.protocol, external: true };
  } catch { return { shown: '?', external: true }; }
};

/** The self-test's own targets: names that cannot exist, the port the page must not reach, and md's own file by fetch. Trying them is not something the page did. */
const probe = (u: string) => {
  const x = new URL(u, location.href);
  return x.hostname.endsWith('.invalid') || x.host === NEAR || x.pathname === '/trust.json';
};
// while the self-test runs, the eval and the inline handler it tries are its own too
export const test = { on: false };

export function startWatch(): void {
  if (started) return;
  started = true;
  try {
    new PerformanceObserver((list) => {
      let added = false;
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        const key = `${e.name}|${e.startTime}`;
        if (seen.has(key) || probe(e.name)) continue;
        seen.add(key);
        const w = where(e.name);
        reqs.push({ url: w.shown, initiator: e.initiatorType, external: w.external });
        added = true;
      }
      if (added) notify();
    }).observe({ type: 'resource', buffered: true });
  } catch { /* no resource timing: the count stays at what the page can see */ }
  document.addEventListener('securitypolicyviolation', (e) => {
    if (probe(e.blockedURI) || (test.on && /^(?:eval|inline)$/.test(e.blockedURI))) return;
    const b = /^[a-z][a-z0-9+.-]*:\/\//i.test(e.blockedURI) ? where(e.blockedURI).shown : e.blockedURI;
    if (viol.some((v) => v.directive === e.effectiveDirective && v.blocked === b)) return;
    viol.push({ directive: e.effectiveDirective, blocked: b, at: Date.now() });
    notify();
  });
}

export function requests() {
  return { total: reqs.length, external: reqs.filter((r) => r.external).length, list: reqs.map(({ url, initiator }) => ({ url, initiator })) };
}

export function onChange(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export const violations = () => viol.slice();

export const policy = (): string | null =>
  document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute('content') ?? null;

/** md Local (docs/local.md): the one port on this machine the page's policy must refuse. */
export const NEAR = '127.0.0.1:4873';
