import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { message } from "@/db/schema";
import { findSharedMailbox, getServer, shareUnavailable } from "@/lib/server";

export async function GET(_request: Request, { params }: RouteContext<"/api/share/[token]">) {
  const { db } = await getServer();
  const { token } = await params;
  const box = await findSharedMailbox(db, token);
  if (!box) return shareUnavailable(db, token);

  const messages = await db
    .select({
      id: message.id,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      subject: message.subject,
      preview: message.preview,
      code: message.code,
      seen: sql<boolean>`1`.mapWith(Boolean),
      receivedAt: message.receivedAt,
    })
    .from(message)
    .where(eq(message.mailboxId, box.id))
    .orderBy(desc(message.receivedAt))
    .limit(200);

  return NextResponse.json(
    { mailbox: { address: box.address, expiresAt: box.expiresAt, linkExpiresAt: box.shareExpiresAt }, messages },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
