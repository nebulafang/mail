import { z } from "zod";
import { EXPIRY_KEYS, MAX_ACCOUNT_MAILBOXES, MAX_NOTE_LENGTH } from "./config";
import {
  EMAIL_MESSAGE,
  LOCAL_PART_MESSAGE,
  LOCAL_PART_RE,
  NEW_PASSWORD_MAX,
  NEW_PASSWORD_MESSAGE,
  NEW_PASSWORD_MIN,
  PASSWORD_MESSAGE,
  USERNAME_MESSAGE,
  USERNAME_RE,
} from "./rules";
import { MAX_SHARE_BATCH, SHARE_ROLES, shareExpiryProblem } from "./share-rules";

export const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null);

export const firstIssue = (error: { issues: { message: string }[] }, fallback = "参数错误") => error.issues[0]?.message ?? fallback;

const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LOCAL_PART_RE, LOCAL_PART_MESSAGE);

const addressSchema = z.email(EMAIL_MESSAGE).trim().toLowerCase();

export const createMailboxSchema = z.object({
  domain: z.string().trim().toLowerCase().min(1),
  localPart: z.union([localPartSchema, z.literal("")]).optional(),
  expiry: z.enum(EXPIRY_KEYS),
});

const noteSchema = z.string().trim().max(MAX_NOTE_LENGTH, `备注最多 ${MAX_NOTE_LENGTH} 个字`);

export const updateMailboxSchema = z
  .object({
    expiry: z.enum([...EXPIRY_KEYS, "permanent"]).optional(),
    note: noteSchema.optional(),
  })
  .refine((v) => v.expiry !== undefined || v.note !== undefined);

export const registerSchema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, USERNAME_MESSAGE),
  password: z.string().min(NEW_PASSWORD_MIN, NEW_PASSWORD_MESSAGE).max(NEW_PASSWORD_MAX, NEW_PASSWORD_MESSAGE),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, USERNAME_MESSAGE).max(20, USERNAME_MESSAGE),
  password: z.string().min(1, PASSWORD_MESSAGE).max(NEW_PASSWORD_MAX, PASSWORD_MESSAGE),
});

export const claimSchema = z.object({
  addresses: z.array(addressSchema).max(MAX_ACCOUNT_MAILBOXES),
});

const newPassword = z.string().min(NEW_PASSWORD_MIN, NEW_PASSWORD_MESSAGE).max(NEW_PASSWORD_MAX, NEW_PASSWORD_MESSAGE);

export const changePasswordSchema = z.object({
  current: z.string().min(1, PASSWORD_MESSAGE).max(NEW_PASSWORD_MAX, PASSWORD_MESSAGE),
  next: newPassword,
});

export const deleteAccountSchema = z.object({ password: z.string().min(1, PASSWORD_MESSAGE).max(NEW_PASSWORD_MAX) });

const shareExpirySchema = z
  .string()
  .max(40)
  .nullable()
  .superRefine((value, ctx) => {
    const problem = shareExpiryProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const shareUsernameSchema = z.string().trim().toLowerCase().min(1, USERNAME_MESSAGE).max(20, USERNAME_MESSAGE);

export const shareGrantSchema = z.object({
  usernames: z
    .array(shareUsernameSchema)
    .min(1, "请至少添加一位用户")
    .max(MAX_SHARE_BATCH, `一次最多分享给 ${MAX_SHARE_BATCH} 人`)
    .transform((names) => [...new Set(names)]),
  role: z.enum(SHARE_ROLES, "权限不正确").default("viewer"),
  expiresAt: shareExpirySchema.default(null),
});

export const shareUpdateSchema = z
  .object({ role: z.enum(SHARE_ROLES, "权限不正确").optional(), expiresAt: shareExpirySchema.optional() })
  .refine((v) => v.role !== undefined || v.expiresAt !== undefined, "没有要修改的内容");

export const shareLookupSchema = shareUsernameSchema;

export const invitationReplySchema = z.object({ accept: z.boolean() });

export const shareLinkCreateSchema = z.object({ expiresAt: shareExpirySchema.default(null) });

export const shareLinkUpdateSchema = z.object({ expiresAt: shareExpirySchema });
