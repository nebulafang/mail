import { BUILD_ID } from "./src/build-id.gen";
import { ensureSchema } from "./src/db/migrate";
import { handleEdge } from "./src/edge";
import { edgeCached } from "./src/edge/cache";
import { readCookie } from "./src/lib/session-cookie";
import { connectLive, LIVE_PATH } from "./src/realtime/mail-hub";

export { MailHub } from "./src/realtime/mail-hub";

const loadNext = () =>
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- 构建前文件不存在，构建后存在，所以不能用 @ts-expect-error
  // @ts-ignore `.open-next/worker.js` 在 `opennextjs-cloudflare build` 时生成
  import("./.open-next/worker.js") as Promise<{ default: Required<Pick<ExportedHandler<CloudflareEnv>, "fetch">> }>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const SECURITY_HEADERS = {
  "Accept-CH": "Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const PAGE_TTL = 60;
const PAGE_STALE = 600;
const FILE_TTL: Record<string, number> = {
  "/sitemap.xml": 600,
  "/llms.txt": 3600,
  "/robots.txt": 3600,
  "/manifest.webmanifest": 3600,
};
const PUBLIC_PAGES = new Set(["/", "/about", "/privacy", "/terms"]);
const PERSONAL_COOKIES = ["user_session", "scene"];

function cacheTtl(request: Request, url: URL) {
  if (request.method !== "GET") return 0;
  if (FILE_TTL[url.pathname]) return FILE_TTL[url.pathname];
  if (url.search || !PUBLIC_PAGES.has(url.pathname)) return 0;
  const { headers } = request;
  if (headers.has("rsc") || headers.has("next-router-prefetch") || !headers.get("accept")?.includes("text/html")) return 0;
  const cookie = headers.get("cookie");
  if (cookie && PERSONAL_COOKIES.some((name) => readCookie(cookie, name) !== undefined)) return 0;
  return PAGE_TTL;
}

function secured(response: Response) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) if (!response.headers.has(key)) response.headers.set(key, value);
  return response;
}

function unlisted(response: Response) {
  if (response.status === 101 || response.headers.has("X-Robots-Tag")) return response;
  const copy = new Response(response.body, response);
  copy.headers.set("X-Robots-Tag", "noindex");
  return copy;
}

const serve: ExportedHandlerFetchHandler<CloudflareEnv> = async (request, env, ctx) => {
  const url = new URL(request.url);
  const isLocal = env.NEXTJS_ENV === "development" || LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === "http:" && !isLocal) {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 308);
  }
  if (url.pathname === LIVE_PATH) return connectLive(request, env);

  const direct = await handleEdge(request, env, ctx, url);
  if (direct) return secured(direct);

  const viaNext = async () => (await loadNext()).default.fetch(request as Parameters<ExportedHandlerFetchHandler<CloudflareEnv>>[0], env, ctx);
  const ttl = cacheTtl(request, url);
  if (ttl) return edgeCached(request, ctx, ttl, viaNext, BUILD_ID, ttl === PAGE_TTL ? PAGE_STALE : 0);

  return viaNext();
};

export default {
  async fetch(request, env, ctx) {
    const response = await serve(request, env, ctx);
    return new URL(request.url).hostname.endsWith(".workers.dev") ? unlisted(response) : response;
  },

  async email(message, env, ctx) {
    const [{ handleEmail }] = await Promise.all([import("./src/email/handler"), ensureSchema(env.DB)]);
    await handleEmail(message, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      Promise.all([import("./src/email/cleanup"), ensureSchema(env.DB)]).then(([{ cleanupExpired }]) => cleanupExpired(env)),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
