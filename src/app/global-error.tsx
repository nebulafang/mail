"use client";

import { useEffect } from "react";

const styles = `
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:0 20px;text-align:center;font:17px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;background:Canvas;color:CanvasText}
h1{margin:0;font-size:22px;font-weight:600}
p{margin:0;max-width:20rem;font-size:15px;opacity:.6}
nav{display:flex;gap:24px;margin-top:16px}
button,a{font:inherit;color:LinkText;background:none;border:0;padding:0;text-decoration:none;cursor:pointer}
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <title>出错了</title>
        <style>{styles}</style>
        <h1>页面出错了</h1>
        <p>加载这个页面时遇到了问题，可以重试一次；如果还是不行，请稍后再来。</p>
        <nav aria-label="恢复">
          <button type="button" onClick={() => retry()}>
            重试
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 根布局已失效，只能整页跳转 */}
          <a href="/">回到首页</a>
        </nav>
      </body>
    </html>
  );
}
