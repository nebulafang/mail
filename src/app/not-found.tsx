import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/seo";

export const metadata: Metadata = {
  title: "页面不存在",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main
      id="content"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-(--margin) text-center pt-safe-area"
    >
      <p className="type-large-title text-label-2">404</p>
      <h1 className="type-title2 font-semibold text-label">页面不存在</h1>
      <p className="max-w-80 type-subheadline text-label-2">这个地址没有对应的页面，可能是链接写错了，或者页面已经被删除。</p>
      <nav aria-label="返回" className="mt-4 flex gap-6 type-body">
        <Link href="/" className="text-tint">回到{site.name}</Link>
      </nav>
    </main>
  );
}
