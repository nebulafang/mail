import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { session as sessionTable } from "@/db/schema";
import { edgeRoute } from "@/edge/next";
import { getUserSession } from "@/lib/auth";
import { dropLiveSockets, getServer } from "@/lib/server";

export const GET = edgeRoute;

export async function DELETE() {
  const session = await getUserSession();
  if (session?.sid) {
    const { db } = await getServer();
    await db.delete(sessionTable).where(eq(sessionTable.id, session.sid));
  }
  if (session?.userId) await dropLiveSockets(session.userId);
  session?.destroy();
  return new NextResponse(null, { status: 204 });
}
