import { parseDomains } from "./config";
import { EMAIL_RE } from "./rules";

export const FORWARD_TIMEOUT_MS = 10_000;
export const ORIGINAL_TO_HEADER = "X-Mail-Original-To";

export function domainOf(address: string) {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

export function isOwnDomain(address: string, mailDomains: string | undefined) {
  const domain = domainOf(address);
  return parseDomains(mailDomains).some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function forwardTarget(env: Pick<CloudflareEnv, "MAIL_DOMAINS">) {
  const to = (env as { FORWARD_TO?: string }).FORWARD_TO?.trim().toLowerCase() ?? "";
  if (!to || !EMAIL_RE.test(to) || isOwnDomain(to, env.MAIL_DOMAINS)) return null;
  return to;
}

class ForwardTimeout extends Error {}

export function explainForwardError(err: unknown) {
  const raw = (err instanceof Error ? err.message : String(err)).trim().slice(0, 240);
  if (err instanceof ForwardTimeout) return `转发超时：${FORWARD_TIMEOUT_MS / 1000} 秒内没有完成`;
  if (/verif/i.test(raw)) {
    return `目标邮箱还没在 Cloudflare 验证：到「电子邮件路由 → 目标地址」添加它，并点开验证邮件里的链接（${raw}）`;
  }
  if (/loop/i.test(raw)) return `转发形成了循环，Cloudflare 拒绝投递（${raw}）`;
  if (/(size|large)/i.test(raw)) return `邮件太大，超过了 Cloudflare 转发的上限（${raw}）`;
  return raw ? `转发失败：${raw}` : "转发失败：未知错误";
}

function withTimeout<T>(task: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ForwardTimeout("timeout")), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

export async function forwardCopy(email: ForwardableEmailMessage, target: string, address: string) {
  try {
    await withTimeout(email.forward(target, new Headers({ [ORIGINAL_TO_HEADER]: address })), FORWARD_TIMEOUT_MS);
  } catch (err) {
    console.warn(`转发 ${address} → ${target} 失败：${explainForwardError(err)}`);
  }
}
