import { sealData, unsealData } from "iron-session";
import { toHex } from "./hex";
import { readCookie } from "./session-cookie";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

export function adminPassword(env: object) {
  return (env as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD?.trim() || null;
}

const sealKeys = new Map<string, Promise<string>>();

function sealKey(password: string) {
  let key = sealKeys.get(password);
  if (!key) {
    key = sha256(`iron-session:admin:${password}`).then(toHex);
    sealKeys.clear();
    sealKeys.set(password, key);
  }
  return key;
}

export async function matchesAdminPassword(input: string, password: string) {
  const [a, b] = await Promise.all([sha256(input), sha256(password)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sealAdminSession(password: string) {
  return sealData({ admin: true }, { password: await sealKey(password), ttl: ADMIN_SESSION_TTL });
}

export async function hasAdminSession(cookieHeader: string | null, password: string | null) {
  const sealed = readCookie(cookieHeader, ADMIN_COOKIE);
  if (!password || !sealed) return false;
  try {
    const data = await unsealData<{ admin?: boolean }>(decodeURIComponent(sealed), { password: await sealKey(password), ttl: ADMIN_SESSION_TTL });
    return data.admin === true;
  } catch {
    return false;
  }
}

export function adminSessionCookie(sealed: string | null) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const value = sealed ? `${encodeURIComponent(sealed)}; Max-Age=${ADMIN_SESSION_TTL}` : "; Max-Age=0";
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}
