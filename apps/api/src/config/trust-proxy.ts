/**
 * Build a Fastify `trustProxy` option from TRUST_PROXY_HOPS.
 *
 * Fastify 5 / `@fastify/proxy-addr` 5 no longer honour a numeric hop count:
 * `trustProxy: N` compiles to a function that always returns false (fail-closed)
 * so direct clients cannot spoof X-Forwarded-* by padding hops. See
 * `fastify/lib/request.js` getTrustProxyFn and the trust-proxy.test.js case
 * "trust proxy number ignores forwarded headers".
 *
 * Equivalent of "trust exactly N hops": a function that returns true for
 * hop indices `[0 .. N)`. Index 0 is the immediate peer (e.g. Caddy).
 * `hops <= 0` → do not trust any proxy (ignore X-Forwarded-*).
 * Never returns `true` (trust everyone).
 */
export function buildTrustProxyOption(
  hops: number,
): false | ((address: string, hopIndex: number) => boolean) {
  if (!Number.isFinite(hops) || hops <= 0) {
    return false;
  }
  const n = Math.floor(hops);
  return (_address: string, hopIndex: number) => hopIndex < n;
}
