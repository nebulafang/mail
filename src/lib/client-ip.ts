export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") ?? "local";

export const forwardedIp = (headers: Headers) =>
  (headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0])?.trim().slice(0, 64) || null;
