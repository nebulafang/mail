export const HUB = "hub";

export const userTag = (userId: string) => `user:${userId}`;

export const shareTag = (token: string) => `share:${token}`;

export const MAX_LIVE_SHARES = 3;

export function broadcast(env: CloudflareEnv, tags: string[], payload: unknown) {
  return env.MAIL_HUB.getByName(HUB).notify(tags, JSON.stringify(payload));
}

export type ShareLiveEvent = { type: "share"; address: string };

export async function notifyShare(env: CloudflareEnv, userIds: string[], address: string, reconnect = false) {
  const hub = env.MAIL_HUB.getByName(HUB);
  const tags = [...new Set(userIds)].map(userTag);
  await hub.notify(tags, JSON.stringify({ type: "share", address } satisfies ShareLiveEvent));
  if (reconnect) await hub.disconnect(tags);
}

export async function disconnectUser(env: CloudflareEnv, userId: string) {
  return env.MAIL_HUB.getByName(HUB).disconnect([userTag(userId)]);
}
