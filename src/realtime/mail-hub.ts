import { DurableObject } from "cloudflare:workers";
import { and, inArray } from "drizzle-orm";
import { clientIp } from "../lib/client-ip";
import { EMAIL_RE } from "../lib/rules";
import { MAX_SAVED_MAILBOXES } from "../lib/config";
import { readUserId } from "../lib/session-cookie";
import { getDb } from "../db";
import { liveShareLink } from "../lib/mail-queries";
import { mailbox } from "../db/schema";
import { HUB, MAX_LIVE_SHARES, shareTag, userTag } from "./notify";

export { broadcast, shareTag, userTag } from "./notify";

export const LIVE_PATH = "/api/live";

const MAX_SOCKET_TAGS = 10;

function foreignOrigin(request: Request, url: URL) {
  const origin = request.headers.get("Origin");
  if (origin === null) return false;
  return !URL.canParse(origin) || new URL(origin).host !== url.host;
}

export class MailHub extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const tags = new URL(request.url).searchParams.getAll("tag");
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, tags);
    return new Response(null, { status: 101, webSocket: client });
  }

  notify(tags: string[], payload: string) {
    for (const tag of new Set(tags)) {
      for (const socket of this.ctx.getWebSockets(tag)) {
        try {
          socket.send(payload);
        } catch {}
      }
    }
  }

  disconnect(tags: string[]) {
    for (const tag of new Set(tags)) {
      for (const socket of this.ctx.getWebSockets(tag)) {
        try {
          socket.close(4001, "access changed");
        } catch {}
      }
    }
  }

  webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000);
    } catch {}
  }
}

type AddressAccess = { owner: string | null; member: boolean };

async function mailboxAccess(env: CloudflareEnv, addresses: string[], userId: string | null) {
  if (!addresses.length) return new Map<string, AddressAccess>();
  const { results } = await env.DB.prepare(
    `select m.address, m.owner_id, exists (select 1 from mailbox_member mm where mm.mailbox_id = m.id and mm.user_id = ? and mm.status = 'active' and (mm.expires_at is null or mm.expires_at > ?)) as member from mailbox m where m.address in (${addresses.map(() => "?").join(",")})`,
  )
    .bind(userId ?? "", Date.now(), ...addresses)
    .all<{ address: string; owner_id: string | null; member: number }>();
  return new Map(results.map((r) => [r.address, { owner: r.owner_id, member: !!r.member }]));
}

function allowedAddresses(addresses: string[], access: Map<string, AddressAccess>, userId: string | null) {
  return addresses.filter((a) => {
    const found = access.get(a);
    return !found?.owner || found.owner === userId || found.member;
  });
}

export async function liveShares(env: CloudflareEnv, tokens: string[]) {
  const wanted = [...new Set(tokens.filter((t) => /^[\w-]{8,64}$/.test(t)))].slice(0, MAX_LIVE_SHARES);
  if (!wanted.length) return [];
  const found = await getDb(env.DB)
    .select({ token: mailbox.shareToken })
    .from(mailbox)
    .where(and(inArray(mailbox.shareToken, wanted), liveShareLink()));
  const live = new Set(found.map((r) => r.token));
  return wanted.filter((token) => live.has(token));
}

export async function connectLive(request: Request, env: CloudflareEnv) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  const url = new URL(request.url);
  if (foreignOrigin(request, url)) return new Response("Forbidden", { status: 403 });
  const { success } = await env.READ_LIMITER.limit({ key: `live:${clientIp(request)}` });
  if (!success) return new Response("Too Many Requests", { status: 429 });
  const requested = [...new Set(url.searchParams.getAll("address").map((a) => a.trim().toLowerCase()))]
    .filter((a) => a.length <= 254 && EMAIL_RE.test(a))
    .slice(0, MAX_SAVED_MAILBOXES);
  const [userId, shares] = await Promise.all([
    readUserId(request.headers.get("Cookie"), env.SESSION_SECRET, env.DB),
    liveShares(env, url.searchParams.getAll("share")),
  ]);
  const access = await mailboxAccess(env, requested, userId);
  const fixed = [...(userId ? [userTag(userId)] : []), ...shares.map(shareTag)];
  const addresses = allowedAddresses(requested, access, userId).slice(0, MAX_SOCKET_TAGS - fixed.length);
  const tags = [...fixed, ...addresses];
  if (!tags.length) return new Response("No address", { status: 400 });
  url.search = new URLSearchParams(tags.map((t) => ["tag", t])).toString();
  return env.MAIL_HUB.getByName(HUB).fetch(new Request(url, request));
}
