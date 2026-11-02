// The one place the security policy is written. Everything else reads it: the build (meta tags), site.mjs (_headers),
// audit.mjs (checks and trust.json), verify.mjs, serve.mjs (through _headers), the worker and the /trust/ page.
export const ORIGIN = 'https://md.ashwingopalsamy.in';

// Bump when the contact details are reviewed. A fixed date keeps dist/ the same bytes on every build.
export const SECURITY_EXPIRES = '2027-10-31T00:00:00.000Z';
export const ADVISORY = 'https://github.com/ashwingopalsamy/markdown/security/advisories/new';

const join = (list) => list.join('; ');

// The app page. Styles may be inline (KaTeX and Mermaid write style attributes); with images, fonts and connections closed to the web, CSS has nowhere to send anything.
const PAGE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
];

// A meta tag cannot carry frame-ancestors (browsers ignore it there), so the tag has the policy without it.
export const META_POLICY = join(PAGE);
export const PAGE_POLICY = join([...PAGE, "frame-ancestors 'none'"]);

// md Local (docs/local.md): the same page policy except one directive. The page talks to its own server. Both editions run the diagram engines in frames from their own site.
const LOCAL_PAGE = PAGE.map((d) => (d === "connect-src 'none'" ? "connect-src 'self'" : d));
export const LOCAL_META_POLICY = join(LOCAL_PAGE);
export const LOCAL_PAGE_POLICY = join([...LOCAL_PAGE, "frame-ancestors 'none'"]);

// /engine/*.html. The frames are sandboxed, so they have no origin and can reach nothing, not even the site that sent them.
export const ENGINE_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; sandbox allow-scripts; frame-ancestors 'self'";

// /engine/* in both editions. Their scripts load in CORS mode (crossorigin), so a sandboxed frame needs only ACAO; no second CORP value (Cloudflare would join it to the one on /*).
export const ENGINE_RULE = `/engine/*\n  Content-Security-Policy: ${ENGINE_POLICY}\n  Access-Control-Allow-Origin: *\n  ! X-Frame-Options\n`;

// The guide pages (/trust/, /agents/, /syntax/): a stylesheet, a font, the theme script and nothing else. No inline style.
const GUIDE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];
export const GUIDE_META = join(GUIDE);
export const GUIDE_POLICY = join([...GUIDE, "frame-ancestors 'none'"]);

// 404.html is self-contained: its styles are inline and there is no script.
const NOT_FOUND = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];
export const NOT_FOUND_META = join(NOT_FOUND);
export const NOT_FOUND_POLICY = join([...NOT_FOUND, "frame-ancestors 'none'"]);

// The worker only fetches this origin's files while it installs.
export const SW_POLICY = "default-src 'none'; connect-src 'self'";

// On every path. HSTS is hosted-only: the local servers drop it.
export const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-DNS-Prefetch-Control': 'off',
};

// Names for the <meta> tags the build puts first in <head>.
export const META_TAGS = (policy) =>
  [
    `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    '<meta http-equiv="x-dns-prefetch-control" content="off" />',
    '<meta name="referrer" content="no-referrer" />',
  ].join('\n');

// Hosts a page or script in this build must never mention.
export const ANALYTICS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'plausible.io', 'segment.io', 'segment.com', 'mixpanel.com', 'hotjar.com',
  'fullstory.com', 'clarity.ms', 'posthog.com', 'amplitude.com', 'cloudflareinsights.com', 'sentry.io', 'bugsnag.com', 'datadoghq.com',
  'newrelic.com', 'nr-data.net', 'matomo', 'umami.is', 'connect.facebook.net', 'static.ads-twitter.com', 'heap.io', 'logrocket.com',
];
