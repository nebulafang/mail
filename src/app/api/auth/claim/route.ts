import { and, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mailbox } from "@/db/schema";
import { getViewer } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { MAX_ACCOUNT_MAILBOXES } from "@/lib/config";
import { getServer, jsonError } from "@/lib/server";
import { claimSchema, readJson } from "@/lib/validation";

export async function POST(request: Request) {
  const viewer = await getViewer();
  const viewerId = viewer?.id;
  if (!viewerId) return jsonError("请先登录", 401);

  const parsed = claimSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("参数错误", 400);
  const addresses = [...new Set(parsed.data.addresses)];
  if (!addresses.length) return NextResponse.json({ claimed: [] });

  const { env, db } = await getServer();
  const { success } = await env.READ_LIMITER.limit({ key: `read:${clientIp(request)}` });
  if (!success) return jsonError("请求太频繁，请稍后再试", 429);
  const [{ owned }] = await db.select({ owned: count() }).from(mailbox).where(eq(mailbox.ownerId, viewerId));
  const room = MAX_ACCOUNT_MAILBOXES - owned;
  if (room <= 0) return jsonError(`每个账号最多 ${MAX_ACCOUNT_MAILBOXES} 个邮箱`, 403);

  const claimable = await db
    .select({ id: mailbox.id })
    .from(mailbox)
    .where(
      and(
        inArray(mailbox.address, addresses),
        isNull(mailbox.ownerId),
        eq(mailbox.catchAll, false),
        gt(mailbox.expiresAt, new Date()),
      ),
    )
    .limit(room);
  if (!claimable.length) return NextResponse.json({ claimed: [] });

  const claimed = await db
    .update(mailbox)
    .set({ ownerId: viewerId })
    .where(and(inArray(mailbox.id, claimable.map((c) => c.id)), isNull(mailbox.ownerId)))
    .returning({ id: mailbox.id, address: mailbox.address });
  return NextResponse.json({ claimed: claimed.map((c) => c.address) });
}
