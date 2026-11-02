// The Privacy sheet's check of the engine frames (docs/local.md, Diagram engines). This frame has the same response policy as the PlantUML and
// draw.io frames. It tries to reach md on this machine and an address that cannot exist, and tells the page what the browser did.
const tries = ['/trust.json', 'https://probe.invalid/'];
const refused = new Set();
addEventListener('securitypolicyviolation', (e) => refused.add(e.effectiveDirective + ' ' + e.blockedURI));
Promise.allSettled(tries.map((u) => fetch(u, { cache: 'no-store' }))).then((r) => {
  const done = r.filter((x) => x.status === 'fulfilled').length;
  // the violation event can land just after the failure
  setTimeout(() => {
    const ok = !done && refused.size === tries.length;
    parent.postMessage({ probe: done ? `${done} of ${tries.length} requests completed` : ok ? 'blocked by connect-src' : 'failed, but no policy violation was reported', refused: ok }, '*');
  }, 50);
});
