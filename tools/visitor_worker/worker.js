/**
 * Tallies where the SmoothMotionVectors web player has been streamed, so the globe can
 * draw an arc to each country a viewer really connected from. No count is ever shown to
 * a viewer — the arcs are the whole story — so there is no ordinal and no vanity total
 * on the page, only per-country weights that set how brightly each arc burns.
 *
 * The browser can never reach an endpoint that blindly counts:
 *
 *   - increments are deduped server-side by hash(salt, IP, UTC-day), so one IP adds at
 *     most one visit per day no matter what it sends — a refresh or a curl loop is free;
 *   - only requests carrying an allowed Origin are answered at all.
 *
 * Geography comes from Cloudflare's edge (`request.cf`), so there is no third-party
 * geo-IP call and no raw IP is ever stored — the dedupe key is a salted SHA-256 and
 * per-country coordinates are a running mean of values already coarsened to ~11 km.
 * A country appears in `places` only once someone from it has visited.
 *
 * GET /visit → record this viewer (subject to dedupe), return the map
 *
 * Response: {total, places: [{cc, n, lat, lon}], you: {lat, lon, city, country}}
 * `total` is returned for your own curiosity; the player ignores it.
 *
 * Deploy: see README.md. Requires a KV namespace bound as VISITS and a SALT secret.
 */

const SEEN_TTL = 60 * 60 * 48;   // remember a dedupe hash for 2 days (min KV TTL is 60s)
const STATS = 'stats';           // single KV key: {total, places:{CC:{n,lat,lon}}}

const json = (body, cors, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Origins allowed to read the counter. Set ALLOWED_ORIGINS as a comma-separated var. */
const originAllowed = (origin, env) => {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
};

const sha256 = async (s) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** ~11 km — enough to place a dot on a globe, not enough to place a person. */
const coarse = (n) => Math.round(n * 10) / 10;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = originAllowed(origin, env);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET,OPTIONS' } });
    }
    if (request.method !== 'GET') return json({ error: 'method' }, cors, 405);

    const url = new URL(request.url);
    if (url.pathname !== '/visit') return json({ error: 'not found' }, cors, 404);
    if (!ok) return json({ error: 'origin not allowed' }, cors, 403);

    const cf = request.cf || {};                       // absent under `wrangler dev` without --remote
    const lat = num(cf.latitude);
    const lon = num(cf.longitude);
    const cc = typeof cf.country === 'string' ? cf.country : null;

    const you = { lat, lon, city: cf.city || null, country: cf.country || null };

    const stats = (await env.VISITS.get(STATS, 'json')) || { total: 0, places: {} };
    const shape = () => ({
      total: stats.total,
      places: Object.entries(stats.places).map(([k, p]) => ({
        cc: k, n: p.n, lat: coarse(p.lat), lon: coarse(p.lon),
      })),
      you,
    });

    // Server-side dedupe: one visit per IP per UTC day. This is the only defence that
    // matters — the browser sends nothing we trust, so refreshing is a pure read.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const day = new Date().toISOString().slice(0, 10);
    const seenKey = `seen:${await sha256(`${env.SALT}|${ip}|${day}`)}`;
    if (await env.VISITS.get(seenKey)) return json(shape(), cors);

    // First sighting today: fold this viewer into their country.
    stats.total += 1;
    if (cc && lat !== null && lon !== null) {
      // Coarsen before folding in, not just on the way out: otherwise the first visitor
      // from a country has their exact edge coordinates sitting in KV until a second one
      // arrives to average them away.
      const la = coarse(lat), lo = coarse(lon);
      const p = stats.places[cc];
      stats.places[cc] = p
        ? { n: p.n + 1, lat: p.lat + (la - p.lat) / (p.n + 1), lon: p.lon + (lo - p.lon) / (p.n + 1) }
        : { n: 1, lat: la, lon: lo };
    }

    // Not atomic — concurrent first-visits can lose a count. It only nudges arc
    // brightness; Durable Objects are the fix if you ever need it to be exact.
    await env.VISITS.put(STATS, JSON.stringify(stats));
    await env.VISITS.put(seenKey, '1', { expirationTtl: SEEN_TTL });

    return json(shape(), cors);
  },
};
