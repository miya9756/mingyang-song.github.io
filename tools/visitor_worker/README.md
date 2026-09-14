# Visitor Worker

Backs the "Live viewers" globe in [`../../projects/smv/index.html`](../../projects/smv/index.html).

The player works **without** this Worker — it just shows your own arc and nothing else.
Deploy this to get arcs to the countries viewers have actually connected from.

## Why it exists

The globe's arcs were originally decorative: a hardcoded city list on a timer, with the
caption claiming each one was a viewer. This Worker replaces that fiction with a real
tally, so an arc appears for a country only once someone from it has visited.

**The page shows no viewer count.** The arcs are the whole story, so there is no ordinal
and no running total on screen. That is deliberate: a displayed number invites inflation
and then has to be defended. What remains is a per-country weight that only sets how
brightly each arc burns, and it is protected server-side anyway.

- Increments are deduped by `hash(SALT, IP, UTC-day)`, so one IP adds at most one visit
  per day. A refresh, or a `curl` loop, is a pure read and writes nothing.
- Only requests carrying an allowed `Origin` are answered.
- It also replaces the `ipapi.co` geo-IP call: Cloudflare gives the Worker the visitor's
  `country`, `latitude`, and `longitude` at the edge for free.
- No raw IP is stored — the dedupe key is a salted SHA-256, and per-country coordinates
  are a running mean of values already rounded to ~11 km, so even a country's first
  visitor never has exact coordinates written to KV.

`total` is returned for your own curiosity; the player ignores it.

## Deploy

```bash
cd tools/visitor_worker
npx wrangler kv namespace create VISITS      # paste the printed id into wrangler.toml
npx wrangler secret put SALT                 # any long random string; never commit it
# edit ALLOWED_ORIGINS in wrangler.toml to your Pages origin (https://mingyang-song.github.io)
npx wrangler deploy
```

Then set the URL it prints in `../../projects/smv/index.html`:

```js
const VISITOR_API = 'https://smv-visitors.<your-subdomain>.workers.dev';
```

Verify — the first call counts, repeats from the same IP do not:

```bash
W=https://smv-visitors.<your-subdomain>.workers.dev
O=https://mingyang-song.github.io
curl -s -H "Origin: $O" "$W/visit" | jq .total   # note the number
curl -s -H "Origin: $O" "$W/visit" | jq .total   # unchanged — deduped by IP+day
curl -s "$W/visit" -o /dev/null -w '%{http_code}\n'   # 403, no Origin
```

## Notes and limits

- **`request.cf` is undefined under plain `wrangler dev`.** Use `wrangler dev --remote`
  or the deployed Worker, otherwise `you`/`places` come back null and the globe shows
  no arcs.
- **Writes are not atomic.** Concurrent first-visits do a read-modify-write on one KV
  key and can lose a count. It only nudges arc brightness; use a Durable Object if you
  ever need it exact.
- **KV writes happen only for new visitors**, so the free tier's daily write budget is
  the real ceiling on new uniques per day. Check Cloudflare's current free-tier limits
  before you expect heavy traffic; reads are far more generous.
- **`seen:` keys expire after 48 h**, so the same person counts again on a later day.
  These are daily uniques per country, not lifetime uniques.
- **Per-country mean longitude is wrong across the antimeridian** (Fiji, and the US if
  Alaska/Hawaii traffic is heavy). It only nudges where an arc lands, so it is left as-is.
- **Dedupe is per IP.** Everyone behind one campus NAT counts as one visitor per day.
  That is the intended trade: undercount rather than inflate.
