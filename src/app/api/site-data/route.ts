import { NextResponse } from "next/server";

export async function DELETE() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Clear-Site-Data": '"cache", "cookies", "storage"', "Cache-Control": "no-store" },
  });
}
