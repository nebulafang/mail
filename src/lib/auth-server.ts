import { clientIp } from "./client-ip";
import { getServer, jsonError } from "./server";

export async function limitAuth(request: Request) {
  const { env } = await getServer();
  const { success } = await env.AUTH_LIMITER.limit({ key: `auth:${clientIp(request)}` });
  return success ? null : jsonError("尝试次数太多，请一分钟后再试", 429);
}
