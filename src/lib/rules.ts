import type { Expiry } from "./config";

export const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const LOCAL_PART_MESSAGE = "只能包含字母、数字和 . _ -，且不能以符号开头或结尾";

export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
export const EMAIL_MESSAGE = "邮箱地址格式不正确";

export const PASSWORD_MESSAGE = "请输入密码";

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MESSAGE = "用户名为 3–20 位字母、数字或下划线";
export const NEW_PASSWORD_MIN = 8;
export const NEW_PASSWORD_MAX = 64;
export const NEW_PASSWORD_MESSAGE = `密码长度为 ${NEW_PASSWORD_MIN}–${NEW_PASSWORD_MAX} 位`;

export type CreateMailboxInput = { domain: string; localPart?: string; expiry: Expiry };

type Checked = { value: string; error?: undefined } | { value?: undefined; error: string };

export function checkLocalPart(input: string): Checked {
  const value = input.trim().toLowerCase();
  return !value || LOCAL_PART_RE.test(value) ? { value } : { error: LOCAL_PART_MESSAGE };
}

export function checkEmail(input: string): Checked {
  const value = input.trim();
  return EMAIL_RE.test(value) ? { value: value.toLowerCase() } : { error: EMAIL_MESSAGE };
}

export function checkUsername(input: string): Checked {
  const value = input.trim().toLowerCase();
  return USERNAME_RE.test(value) ? { value } : { error: USERNAME_MESSAGE };
}

export function checkNewPassword(input: string): Checked {
  return input.length >= NEW_PASSWORD_MIN && input.length <= NEW_PASSWORD_MAX ? { value: input } : { error: NEW_PASSWORD_MESSAGE };
}
