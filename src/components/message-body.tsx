"use client";

import DOMPurify from "dompurify";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { mailFrame, systemColors } from "@/design-system/colors";
import { getColorScheme, onThemeApplied } from "@/environment/theme";
import { linkify } from "@/lib/mail-links";
import { cn } from "@/lib/utils";
import { RouteContext } from "@/navigation/context";

let hooked = false;

function sanitize(html: string, missing: ReadonlySet<string>) {
  if (!hooked) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (node.tagName === "IMG") {
        node.setAttribute("decoding", "async");
        if (node.hasAttribute("width") && node.hasAttribute("height")) node.setAttribute("loading", "lazy");
      }
    });
    hooked = true;
  }
  const fragment = DOMPurify.sanitize(html, { FORBID_TAGS: ["form", "input", "button", "textarea", "select"], RETURN_DOM_FRAGMENT: true });
  for (const img of fragment.querySelectorAll("img")) {
    if (isUnavailableImage(img.getAttribute("src") ?? "", missing)) img.remove();
  }
  const holder = document.createElement("div");
  holder.appendChild(fragment);
  return holder.innerHTML;
}

function isUnavailableImage(src: string, missing: ReadonlySet<string>) {
  if (src.startsWith("cid:")) return true;
  const id = /^\/api\/attachments\/([\w-]+)/.exec(src)?.[1];
  return !!id && missing.has(id);
}

const FRAME_CSP = "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline'; font-src data:";

const DESIGNED = /bgcolor=|background(-color)?\s*:|background=|<table[^>]+width=["']?\d{3}/i;

const BASE = `
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  html, body { margin: 0; }
  body { padding: ${mailFrame.padding}px; font: ${mailFrame.fontSize}px/${mailFrame.lineHeight} -apple-system, BlinkMacSystemFont, "PingFang SC", "Roboto", system-ui, sans-serif; overflow-wrap: anywhere; -webkit-tap-highlight-color: transparent; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre, code { white-space: pre-wrap; }
  blockquote { margin: 0 0 0 4px; padding-left: 12px; border-left: 3px solid rgba(127,127,127,.35); }
`;

const LIGHT = `html, body { background: ${systemColors.mailCanvas}; color: ${systemColors.mailInk}; } a { color: #007aff; }`;

const DARK = `
  html.dark { color-scheme: dark; }
  html.dark, html.dark body { background: transparent; color: #f2f2f7; }
  html.dark body *:not(a) { color: inherit !important; background-color: transparent !important; border-color: rgba(235,235,245,.18) !important; }
  html.dark a, html.dark a * { color: #0a84ff !important; }
  html.dark img { opacity: .92; }
  html.dark hr { border-color: rgba(235,235,245,.18); }
`;

const NONE: ReadonlySet<string> = new Set();

export function MessageBody({ html, text, missing = NONE }: { html: string | null; text: string | null; missing?: ReadonlySet<string> }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);
  const routeSettled = use(RouteContext)?.settled ?? true;
  const [started, setStarted] = useState(routeSettled);
  if (routeSettled && !started) setStarted(true);

  const clean = useMemo(() => (started && html && DOMPurify.isSupported ? sanitize(html, missing) : null), [started, html, missing]);
  const pending = !started && !!html && DOMPurify.isSupported;
  const designed = !!clean && DESIGNED.test(clean);

  const srcDoc = useMemo(() => {
    if (!clean) return null;
    const styles = designed ? `${BASE}${LIGHT}` : `${BASE}${LIGHT}${DARK}`;
    const dark = !designed && getColorScheme() === "dark";
    return `<!doctype html><html${dark ? ' class="dark"' : ""}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${styles}</style></head><body>${clean}</body></html>`;
  }, [clean, designed]);

  useEffect(() => {
    if (designed) return;
    return onThemeApplied((scheme) => frameRef.current?.contentDocument?.documentElement.classList.toggle("dark", scheme === "dark"));
  }, [designed]);

  const observerRef = useRef<ResizeObserver>(null);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  function handleLoad() {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    if (!designed) doc.documentElement.classList.toggle("dark", getColorScheme() === "dark");
    let frameId = 0;
    const measure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        doc.body.style.zoom = "";
        const overflow = doc.documentElement.scrollWidth / frame.clientWidth;
        if (overflow > 1.02) doc.body.style.zoom = String(1 / overflow);
        setHeight(Math.ceil(doc.body.getBoundingClientRect().height));
        setReady(true);
      });
    };
    measure();
    observerRef.current?.disconnect();
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(doc.body);
  }

  if (pending) {
    return (
      <div
        className={cn(
          "skeleton-shimmer relative overflow-hidden rounded-(--r-card)",
          DESIGNED.test(html) ? "bg-(--mail-canvas)" : "bg-(--mail-canvas) dark:bg-surface",
        )}
        style={{ minHeight: 180 }}
      />
    );
  }

  if (srcDoc) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-(--r-card)",
          designed ? "bg-(--mail-canvas)" : "bg-(--mail-canvas) dark:bg-surface",
          !ready && "skeleton-shimmer",
        )}
        style={{ minHeight: ready ? undefined : 180 }}
      >
        <iframe
          ref={frameRef}
          onLoad={handleLoad}
          title="邮件内容"
          srcDoc={srcDoc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className={cn("layer-keep block w-full transition-opacity duration-300 ease-out", ready ? "opacity-100" : "opacity-0")}
          style={{ height: height || 180 }}
        />
      </div>
    );
  }

  const body = text?.trim();
  return (
    <div className="mail-card p-4 type-body whitespace-pre-wrap text-label select-text [overflow-wrap:anywhere]">
      {body ? (
        linkify(body).map((part, i) =>
          part.type === "link" ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="text-tint underline decoration-tint/30 underline-offset-2">
              {part.value}
            </a>
          ) : (
            part.value
          ),
        )
      ) : (
        <span className="text-label-2">（无内容）</span>
      )}
    </div>
  );
}
