"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="content"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-(--margin) text-center pt-safe-area"
    >
      <title>出错了</title>
      <h1 className="type-title2 font-semibold text-label">页面出错了</h1>
      <p className="max-w-80 type-subheadline text-label-2">加载这个页面时遇到了问题，可以重试一次；如果还是不行，请稍后再来。</p>
      {error.digest && <p className="font-mono type-caption1 text-label-2">{error.digest}</p>}
      <nav aria-label="恢复" className="mt-4 flex gap-6 type-body">
        <button type="button" onClick={() => retry()} className="text-tint">
          重试
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 出错后用整页跳转重新加载应用 */}
        <a href="/" className="text-tint">
          回到首页
        </a>
      </nav>
    </main>
  );
}
