const BROWSER_CC = "x-browser-cache-control";
const STORED_AT = "x-edge-stored-at";

type Waiter = Pick<ExecutionContext, "waitUntil">;

function edgeCache(): Cache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

function cacheKey(url: string, version: string) {
  const key = new URL(url);
  if (version) key.searchParams.set("__edge", version);
  return new Request(key, { method: "GET" });
}

function restore(hit: Response, state = "HIT") {
  const headers = new Headers(hit.headers);
  const browser = headers.get(BROWSER_CC);
  if (browser) headers.set("Cache-Control", browser);
  else headers.delete("Cache-Control");
  headers.delete(BROWSER_CC);
  headers.delete(STORED_AT);
  headers.set("X-Edge-Cache", state);
  return new Response(hit.body, { status: hit.status, headers });
}

export async function edgeCached(
  request: Request,
  ctx: Waiter,
  ttl: number,
  produce: () => Promise<Response>,
  version = "",
  staleFor = 0,
) {
  const cache = edgeCache();
  if (!cache || request.method !== "GET") return produce();
  const key = cacheKey(request.url, version);

  const fresh = async () => {
    const response = await produce();
    if (response.status !== 200 || response.headers.has("Set-Cookie")) return response;
    const headers = new Headers(response.headers);
    const browser = headers.get("Cache-Control");
    if (browser) headers.set(BROWSER_CC, browser);
    headers.set("Cache-Control", `public, s-maxage=${ttl + staleFor}`);
    headers.set(STORED_AT, String(Date.now()));
    ctx.waitUntil(cache.put(key, new Response(response.clone().body, { status: 200, headers })).catch(() => {}));
    return response;
  };

  const hit = await cache.match(key);
  if (!hit) return fresh();
  const age = (Date.now() - Number(hit.headers.get(STORED_AT) ?? 0)) / 1000;
  if (!staleFor || age <= ttl) return restore(hit);
  ctx.waitUntil(
    fresh()
      .then((response) => response.body?.cancel())
      .catch(() => {}),
  );
  return restore(hit, "STALE");
}
