import { and, count, desc, eq, gt, gte, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import type { DB } from "../db";
import { mailbox, mailboxMember, mailboxShareEvent, user } from "../db/schema";
import { mailboxByAddress, memberNotExpired, normalizeAddress } from "../lib/mail-queries";
import { LINK_ACCESS_ACTIONS, logShare } from "../lib/share-log";
import { POLICY_DISABLED_MESSAGE } from "../lib/share-policy";
import { sharePolicyQuery, toSharePolicy } from "../lib/share-policy-store";
import {
  can,
  canAssign,
  MAX_MAILBOX_MEMBERS,
  ROLE_INFO,
  roleWithin,
  shareTargetProblem,
  TARGET_PROBLEM_MESSAGE,
  type MailboxAbility,
  type ShareRole,
} from "../lib/share-rules";
import {
  firstIssue,
  invitationReplySchema,
  readJson,
  shareGrantSchema,
  shareLinkCreateSchema,
  shareLinkUpdateSchema,
  shareLookupSchema,
  shareUpdateSchema,
} from "../lib/validation";
import { database, json, jsonError, mailboxNotFound, millis, noContent, NO_STORE, notify, viewerBatch, type Edge, type Viewer } from "./core";

const ACTIVITY_LIMIT = 100;

const FORBIDDEN: Partial<Record<MailboxAbility, string>> = {
  members: "只有邮箱主人或可管理成员能管理共享",
  activity: "只有邮箱主人或可管理成员能查看操作记录",
  link: "只有邮箱主人可以管理分享链接",
};

const memberNotFound = () => jsonError("成员不存在或已被移除", 404);
const loginRequired = () => jsonError("登录后才能使用共享功能", 401);

const roleCapped = (max: ShareRole) => jsonError(`管理员限制最高只能授予「${ROLE_INFO[max].label}」权限`, 403);

type MailboxAccess = Awaited<ReturnType<typeof mailboxByAddress>>[number];
type Access = { db: DB; viewer: Viewer; box: MailboxAccess; ownerId: string };

async function access(e: Edge, address: string, ability: MailboxAbility): Promise<Access | Response> {
  const { viewer, results } = await viewerBatch(e, (db, viewerId) => (viewerId ? ([mailboxByAddress(db, address, viewerId)] as const) : null));
  if (!viewer) return loginRequired();
  const box = results?.[0][0];
  if (!box) return mailboxNotFound();
  if (!box.ownerId) return jsonError("只有账号里的邮箱可以分享给其他用户", 403);
  if (!can(box.role, ability)) return jsonError(FORBIDDEN[ability] ?? "没有权限执行这个操作", 403);
  return { db: await database(e), viewer, box, ownerId: box.ownerId };
}

const inviter = alias(user, "inviter");

async function signedIn(e: Edge) {
  const { viewer } = await viewerBatch(e, () => null);
  return viewer;
}

async function memberRows(db: DB, mailboxId: string, viewerId: string, memberId?: string) {
  const rows = await db
    .select({
      id: mailboxMember.id,
      userId: mailboxMember.userId,
      username: user.username,
      role: mailboxMember.role,
      status: mailboxMember.status,
      expiresAt: mailboxMember.expiresAt,
      createdAt: mailboxMember.createdAt,
      acceptedAt: mailboxMember.acceptedAt,
      invitedBy: inviter.username,
    })
    .from(mailboxMember)
    .innerJoin(user, eq(user.id, mailboxMember.userId))
    .leftJoin(inviter, eq(inviter.id, mailboxMember.invitedBy))
    .where(and(eq(mailboxMember.mailboxId, mailboxId), memberNotExpired(), memberId ? eq(mailboxMember.id, memberId) : undefined))
    .orderBy(desc(mailboxMember.createdAt));
  return rows.map(({ userId, ...row }) => ({ ...row, self: userId === viewerId }));
}

async function findMember(db: DB, mailboxId: string, memberId: string) {
  const [member] = await db
    .select({
      id: mailboxMember.id,
      userId: mailboxMember.userId,
      username: user.username,
      role: mailboxMember.role,
      status: mailboxMember.status,
      expiresAt: mailboxMember.expiresAt,
    })
    .from(mailboxMember)
    .innerJoin(user, eq(user.id, mailboxMember.userId))
    .where(and(eq(mailboxMember.id, memberId), eq(mailboxMember.mailboxId, mailboxId)));
  return member;
}

export async function listMembers(e: Edge, [address]: string[]) {
  const found = await access(e, address, "members");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  const members = await memberRows(db, box.id, viewer.id);
  return json({ role: box.role, owner: box.ownerName, limit: MAX_MAILBOX_MEMBERS, members }, { headers: NO_STORE });
}

export async function lookupMember(e: Edge, [address]: string[]) {
  const parsed = shareLookupSchema.safeParse(e.url.searchParams.get("username") ?? "");
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const found = await access(e, address, "members");
  if (found instanceof Response) return found;
  const { db, viewer, box, ownerId } = found;
  const { success } = await e.env.LOOKUP_LIMITER.limit({ key: viewer.id });
  if (!success) return jsonError("查询太频繁，请稍后再试", 429);

  const [target] = await db
    .select({ id: user.id, username: user.username, disabled: user.disabled })
    .from(user)
    .where(eq(user.username, parsed.data));
  const [existing] = target
    ? await db
        .select({ status: mailboxMember.status, expiresAt: mailboxMember.expiresAt })
        .from(mailboxMember)
        .where(and(eq(mailboxMember.mailboxId, box.id), eq(mailboxMember.userId, target.id)))
    : [];
  const problem = shareTargetProblem(target, viewer.id, ownerId, existing);
  return json(
    { username: parsed.data, problem, message: problem ? TARGET_PROBLEM_MESSAGE[problem] : null },
    { headers: NO_STORE },
  );
}

type GrantResult = { username: string; ok: true; memberId: string } | { username: string; ok: false; error: string };

export async function grantMembers(e: Edge, [address]: string[]) {
  const parsed = shareGrantSchema.safeParse(await readJson(e.request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const found = await access(e, address, "members");
  if (found instanceof Response) return found;
  const { db, viewer, box, ownerId } = found;
  const { usernames, role, expiresAt } = parsed.data;
  if (!canAssign(box.role, role)) return jsonError("不能授予高于自己的权限", 403);

  const now = new Date();
  const until = expiresAt ? new Date(expiresAt) : null;
  const [targets, [{ alive }], policyRows] = await db.batch([
    db.select({ id: user.id, username: user.username, disabled: user.disabled }).from(user).where(inArray(user.username, usernames)),
    db.select({ alive: count() }).from(mailboxMember).where(and(eq(mailboxMember.mailboxId, box.id), memberNotExpired(now))),
    sharePolicyQuery(db),
  ]);
  const policy = toSharePolicy(policyRows);
  if (box.shareLocked) return jsonError(POLICY_DISABLED_MESSAGE.locked, 403);
  if (!policy.invites) return jsonError(POLICY_DISABLED_MESSAGE.invites, 403);
  if (!roleWithin(role, policy.maxRole)) return roleCapped(policy.maxRole);
  const byName = new Map(targets.map((t) => [t.username, t]));
  const existingRows = targets.length
    ? await db
        .select({ userId: mailboxMember.userId, status: mailboxMember.status, expiresAt: mailboxMember.expiresAt })
        .from(mailboxMember)
        .where(and(eq(mailboxMember.mailboxId, box.id), inArray(mailboxMember.userId, targets.map((t) => t.id))))
    : [];
  const existing = new Map(existingRows.map((r) => [r.userId, r]));

  const results = new Map<string, GrantResult>();
  const chosen: { id: string; username: string }[] = [];
  let room = MAX_MAILBOX_MEMBERS - alive;
  for (const username of usernames) {
    const target = byName.get(username);
    const problem = shareTargetProblem(target, viewer.id, ownerId, target && existing.get(target.id), now);
    if (problem) results.set(username, { username, ok: false, error: TARGET_PROBLEM_MESSAGE[problem] });
    else if (room <= 0) results.set(username, { username, ok: false, error: `每个邮箱最多共享给 ${MAX_MAILBOX_MEMBERS} 人` });
    else {
      room--;
      chosen.push(target!);
    }
  }

  if (chosen.length) {
    const inserts = chosen.map((t) =>
      db
        .insert(mailboxMember)
        .values({ mailboxId: box.id, userId: t.id, role, status: "pending", invitedBy: viewer.id, expiresAt: until, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [mailboxMember.mailboxId, mailboxMember.userId],
          set: { role, status: "pending", invitedBy: viewer.id, expiresAt: until, createdAt: now, updatedAt: now, acceptedAt: null },
          setWhere: and(isNotNull(mailboxMember.expiresAt), lte(mailboxMember.expiresAt, now)),
        })
        .returning({ id: mailboxMember.id }),
    );
    const inserted = await db.batch(inserts as unknown as [(typeof inserts)[number], ...typeof inserts]);
    const granted = chosen.flatMap((target, i) => {
      const row = inserted[i][0];
      if (!row) results.set(target.username, { username: target.username, ok: false, error: TARGET_PROBLEM_MESSAGE.pending });
      else results.set(target.username, { username: target.username, ok: true, memberId: row.id });
      return row ? [target] : [];
    });
    if (granted.length) {
      const logs = granted.map((target) => logShare(db, { box, action: "grant", actor: viewer, target, detail: { role, expiresAt: millis(until) }, at: now }));
      await db.batch(logs as unknown as [(typeof logs)[number], ...typeof logs]);
      notify(e, granted.map((t) => t.id), box.address);
    }
  }

  const ordered = usernames.map((name) => results.get(name)!);
  return json({ results: ordered }, { status: ordered.some((r) => r.ok) ? 201 : 200, headers: NO_STORE });
}

export async function updateMember(e: Edge, [address, memberId]: string[]) {
  const parsed = shareUpdateSchema.safeParse(await readJson(e.request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const found = await access(e, address, "members");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  const member = await findMember(db, box.id, memberId);
  if (!member || (member.expiresAt && member.expiresAt <= new Date())) return memberNotFound();
  if (member.userId === viewer.id) return jsonError("不能修改自己的权限", 403);

  const role: ShareRole = parsed.data.role ?? member.role;
  if (!canAssign(box.role, member.role) || !canAssign(box.role, role)) return jsonError("不能修改或授予高于自己的权限", 403);
  if (!roleWithin(role, member.role)) {
    if (box.shareLocked) return jsonError(POLICY_DISABLED_MESSAGE.locked, 403);
    const policy = toSharePolicy(await sharePolicyQuery(db));
    if (!roleWithin(role, policy.maxRole)) return roleCapped(policy.maxRole);
  }
  const until = parsed.data.expiresAt === undefined ? member.expiresAt : parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  if (role !== member.role || millis(until) !== millis(member.expiresAt)) {
    const now = new Date();
    await db.batch([
      db.update(mailboxMember).set({ role, expiresAt: until, updatedAt: now }).where(eq(mailboxMember.id, member.id)),
      logShare(db, {
        box,
        action: "update",
        actor: viewer,
        target: { id: member.userId, username: member.username },
        detail: { from: member.role, role, previousExpiresAt: millis(member.expiresAt), expiresAt: millis(until) },
        at: now,
      }),
    ]);
    notify(e, [member.userId], box.address);
  }
  const [view] = await memberRows(db, box.id, viewer.id, member.id);
  return json({ member: view }, { headers: NO_STORE });
}

export async function removeMember(e: Edge, [address, memberId]: string[]) {
  const found = await access(e, address, "members");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  const member = await findMember(db, box.id, memberId);
  if (!member) return memberNotFound();
  if (member.userId === viewer.id) return jsonError("不能移除自己，可以选择退出共享", 403);
  if (!canAssign(box.role, member.role)) return jsonError("不能移除权限高于自己的成员", 403);

  await db.batch([
    db.delete(mailboxMember).where(eq(mailboxMember.id, member.id)),
    logShare(db, { box, action: "revoke", actor: viewer, target: { id: member.userId, username: member.username }, detail: { role: member.role } }),
  ]);
  notify(e, [member.userId], box.address, true);
  return noContent();
}

export async function leaveMailbox(e: Edge, [address]: string[]) {
  const viewer = await signedIn(e);
  if (!viewer) return loginRequired();
  const db = await database(e);
  const [row] = await db
    .select({ id: mailboxMember.id, role: mailboxMember.role, mailboxId: mailbox.id, address: mailbox.address, ownerId: mailbox.ownerId })
    .from(mailboxMember)
    .innerJoin(mailbox, eq(mailbox.id, mailboxMember.mailboxId))
    .where(and(eq(mailbox.address, normalizeAddress(address)), eq(mailboxMember.userId, viewer.id)));
  if (!row) return jsonError("你不是这个邮箱的共享成员", 404);
  await db.batch([
    db.delete(mailboxMember).where(eq(mailboxMember.id, row.id)),
    logShare(db, { box: { id: row.mailboxId, address: row.address }, action: "leave", actor: viewer, target: viewer, detail: { role: row.role } }),
  ]);
  notify(e, [viewer.id], row.address, true);
  notify(e, [row.ownerId], row.address);
  return noContent();
}

export async function listActivity(e: Edge, [address]: string[]) {
  const found = await access(e, address, "activity");
  if (found instanceof Response) return found;
  const { db, box } = found;
  const events = await db
    .select({
      id: mailboxShareEvent.id,
      action: mailboxShareEvent.action,
      actor: mailboxShareEvent.actorName,
      target: mailboxShareEvent.targetName,
      detail: mailboxShareEvent.detail,
      at: mailboxShareEvent.at,
    })
    .from(mailboxShareEvent)
    .where(
      and(
        eq(mailboxShareEvent.mailboxId, box.id),
        gte(mailboxShareEvent.at, box.createdAt),
        notInArray(mailboxShareEvent.action, LINK_ACCESS_ACTIONS),
      ),
    )
    .orderBy(desc(mailboxShareEvent.at), desc(mailboxShareEvent.id))
    .limit(ACTIVITY_LIMIT);
  return json({ events }, { headers: NO_STORE });
}

const owner = alias(user, "owner");

export async function listInvitations(e: Edge) {
  const viewer = await signedIn(e);
  if (!viewer) return json({ invitations: [] }, { headers: NO_STORE });
  const now = new Date();
  const db = await database(e);
  const invitations = await db
    .select({
      id: mailboxMember.id,
      address: mailbox.address,
      role: mailboxMember.role,
      expiresAt: mailboxMember.expiresAt,
      createdAt: mailboxMember.createdAt,
      owner: owner.username,
      invitedBy: inviter.username,
    })
    .from(mailboxMember)
    .innerJoin(mailbox, eq(mailbox.id, mailboxMember.mailboxId))
    .innerJoin(owner, eq(owner.id, mailbox.ownerId))
    .leftJoin(inviter, eq(inviter.id, mailboxMember.invitedBy))
    .where(
      and(
        eq(mailboxMember.userId, viewer.id),
        eq(mailboxMember.status, "pending"),
        memberNotExpired(now),
        gt(mailbox.expiresAt, now),
        eq(mailbox.catchAll, false),
      ),
    )
    .orderBy(desc(mailboxMember.createdAt));
  return json({ invitations }, { headers: NO_STORE });
}

export async function replyInvitation(e: Edge, [id]: string[]) {
  const parsed = invitationReplySchema.safeParse(await readJson(e.request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const viewer = await signedIn(e);
  if (!viewer) return loginRequired();
  const now = new Date();
  const db = await database(e);
  const [invite] = await db
    .select({
      id: mailboxMember.id,
      role: mailboxMember.role,
      invitedBy: mailboxMember.invitedBy,
      mailboxId: mailbox.id,
      address: mailbox.address,
      ownerId: mailbox.ownerId,
      shareLocked: mailbox.shareLocked,
    })
    .from(mailboxMember)
    .innerJoin(mailbox, eq(mailbox.id, mailboxMember.mailboxId))
    .where(
      and(
        eq(mailboxMember.id, id),
        eq(mailboxMember.userId, viewer.id),
        eq(mailboxMember.status, "pending"),
        memberNotExpired(now),
        gt(mailbox.expiresAt, now),
        eq(mailbox.catchAll, false),
      ),
    );
  if (!invite) return jsonError("邀请已失效或已处理", 404);
  if (parsed.data.accept && invite.shareLocked) return jsonError(POLICY_DISABLED_MESSAGE.locked, 403);

  const box = { id: invite.mailboxId, address: invite.address };
  const detail = { role: invite.role };
  if (parsed.data.accept) {
    await db.batch([
      db.update(mailboxMember).set({ status: "active", acceptedAt: now, updatedAt: now }).where(eq(mailboxMember.id, invite.id)),
      logShare(db, { box, action: "accept", actor: viewer, target: viewer, detail, at: now }),
    ]);
  } else {
    await db.batch([
      db.delete(mailboxMember).where(eq(mailboxMember.id, invite.id)),
      logShare(db, { box, action: "decline", actor: viewer, target: viewer, detail, at: now }),
    ]);
  }
  notify(e, [invite.ownerId, invite.invitedBy, viewer.id], invite.address);
  return parsed.data.accept ? json({ address: invite.address, role: invite.role }) : noContent();
}

export async function createShareLink(e: Edge, [address]: string[]) {
  const parsed = shareLinkCreateSchema.safeParse(await e.request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const found = await access(e, address, "link");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  if (box.shareLocked) return jsonError(POLICY_DISABLED_MESSAGE.locked, 403);
  if (!toSharePolicy(await sharePolicyQuery(db)).links) return jsonError(POLICY_DISABLED_MESSAGE.links, 403);
  const until = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const [[updated]] = await db.batch([
    db
      .update(mailbox)
      .set({ shareToken: nanoid(24), shareExpiresAt: until })
      .where(eq(mailbox.id, box.id))
      .returning({ shareToken: mailbox.shareToken, shareExpiresAt: mailbox.shareExpiresAt }),
    logShare(db, {
      box,
      action: box.shareToken ? "link_reset" : "link_on",
      actor: viewer,
      detail: { expiresAt: millis(until) },
    }),
  ]);
  return json(updated, { status: 201, headers: NO_STORE });
}

export async function updateShareLink(e: Edge, [address]: string[]) {
  const parsed = shareLinkUpdateSchema.safeParse(await readJson(e.request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const found = await access(e, address, "link");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  if (!box.shareToken) return jsonError("还没有开启公开链接", 404);
  if (box.shareLocked) return jsonError(POLICY_DISABLED_MESSAGE.locked, 403);
  const until = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (millis(until) !== millis(box.shareExpiresAt)) {
    await db.batch([
      db.update(mailbox).set({ shareExpiresAt: until }).where(eq(mailbox.id, box.id)),
      logShare(db, {
        box,
        action: "link_expiry",
        actor: viewer,
        detail: { previousExpiresAt: millis(box.shareExpiresAt), expiresAt: millis(until) },
      }),
    ]);
  }
  return json({ shareToken: box.shareToken, shareExpiresAt: until }, { headers: NO_STORE });
}

export async function deleteShareLink(e: Edge, [address]: string[]) {
  const found = await access(e, address, "link");
  if (found instanceof Response) return found;
  const { db, viewer, box } = found;
  if (!box.shareToken) return noContent();
  await db.batch([
    db.update(mailbox).set({ shareToken: null, shareExpiresAt: null }).where(eq(mailbox.id, box.id)),
    logShare(db, { box, action: "link_off", actor: viewer }),
  ]);
  return noContent();
}

