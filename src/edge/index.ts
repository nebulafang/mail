import * as admin from "./admin";
import { crossSite, expireSessionCookie, jsonError, type Edge } from "./core";
import * as mail from "./mail";
import * as share from "./share";

type Handler = (e: Edge, params: string[]) => Response | Promise<Response>;

const SEG = "([^/]+)";
const route = (method: string, path: string, handler: Handler) =>
  [method, new RegExp(`^${path.replaceAll(":p", SEG)}$`), handler] as const;

const routes = [
  route("GET", "/api/ping", mail.ping),
  route("HEAD", "/api/ping", mail.ping),
  route("GET", "/api/config", mail.config),
  route("GET", "/api/availability", mail.availability),
  route("GET", "/api/auth/session", mail.authSession),
  route("GET", "/api/mailboxes", mail.listMailboxes),
  route("GET", "/api/mailboxes/:p", mail.getMailbox),
  route("DELETE", "/api/mailboxes/:p", mail.deleteMailbox),
  route("DELETE", "/api/mailboxes/:p/messages", mail.clearMailbox),
  route("GET", "/api/mailboxes/:p/messages", mail.listMessages),
  route("GET", "/api/mailboxes/:p/members", share.listMembers),
  route("POST", "/api/mailboxes/:p/members", share.grantMembers),
  route("GET", "/api/mailboxes/:p/members/lookup", share.lookupMember),
  route("PATCH", "/api/mailboxes/:p/members/:p", share.updateMember),
  route("DELETE", "/api/mailboxes/:p/members/:p", share.removeMember),
  route("DELETE", "/api/mailboxes/:p/membership", share.leaveMailbox),
  route("GET", "/api/mailboxes/:p/activity", share.listActivity),
  route("POST", "/api/mailboxes/:p/share", share.createShareLink),
  route("PATCH", "/api/mailboxes/:p/share", share.updateShareLink),
  route("DELETE", "/api/mailboxes/:p/share", share.deleteShareLink),
  route("GET", "/api/invitations", share.listInvitations),
  route("POST", "/api/invitations/:p", share.replyInvitation),
  route("GET", "/api/messages/:p", mail.getMessage),
  route("PATCH", "/api/messages/:p", mail.markMessage),
  route("DELETE", "/api/messages/:p", mail.deleteMessage),
  route("GET", "/api/attachments/:p", mail.getAttachment),
  route("GET", "/api/admin/session", admin.adminSession),
  route("POST", "/api/admin/session", admin.adminLogin),
  route("DELETE", "/api/admin/session", admin.adminLogout),
  route("GET", "/api/admin/stats", admin.getStats),
  route("GET", "/api/admin/settings", admin.getSettings),
  route("PATCH", "/api/admin/settings", admin.updateSettings),
  route("GET", "/api/admin/users", admin.listUsers),
  route("GET", "/api/admin/users/:p", admin.getUser),
  route("PATCH", "/api/admin/users/:p", admin.updateUser),
  route("DELETE", "/api/admin/users/:p", admin.deleteUser),
  route("DELETE", "/api/admin/users/:p/sessions/:p", admin.revokeUserSession),
  route("GET", "/api/admin/messages", admin.listMessages),
  route("GET", "/api/admin/messages/:p", admin.getMessage),
  route("DELETE", "/api/admin/messages/:p", admin.deleteMessage),
];

export async function handleEdge(
  request: Request,
  env: CloudflareEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  url = new URL(request.url),
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/")) return null;
  if (crossSite(request, url)) return jsonError("不允许跨站请求", 403);
  for (const [method, pattern, handler] of routes) {
    if (method !== request.method) continue;
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    const e: Edge = { request, url, env, ctx, clearSession: false };
    try {
      const response = await handler(e, match.slice(1));
      return e.clearSession ? expireSessionCookie(response) : response;
    } catch (err) {
      console.error(`${request.method} ${url.pathname}`, err);
      return jsonError("服务器出错了，请稍后再试", 500);
    }
  }
  return null;
}
