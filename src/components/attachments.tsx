"use client";

import { Download, File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { haptic } from "@/design-system/haptics";
import { presets, stagger } from "@/design-system/motion";
import { formatBytes } from "@/lib/format";
import type { MessageDetail } from "@/services/mail";
import { ImageViewer } from "./image-viewer";

type Attachment = MessageDetail["attachments"][number];

function kindOf(a: Attachment) {
  const t = a.mimeType.toLowerCase();
  const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
  if (t.startsWith("image/")) return { icon: FileImage, color: "var(--ios-blue)", label: "图片" };
  if (t === "application/pdf" || ext === "pdf") return { icon: FileText, color: "var(--ios-red)", label: "PDF" };
  if (/zip|rar|7z|tar|gzip/.test(t) || /^(zip|rar|7z|gz|tgz)$/.test(ext)) return { icon: FileArchive, color: "var(--ios-orange)", label: "压缩包" };
  if (/sheet|excel|csv/.test(t) || /^(xlsx?|csv|numbers)$/.test(ext)) return { icon: FileSpreadsheet, color: "var(--ios-green)", label: "表格" };
  if (/presentation|powerpoint/.test(t) || /^(pptx?|key)$/.test(ext)) return { icon: Presentation, color: "var(--ios-orange)", label: "演示" };
  if (/word|document|rtf/.test(t) || /^(docx?|pages|rtf)$/.test(ext)) return { icon: FileText, color: "var(--ios-blue)", label: "文档" };
  if (t.startsWith("audio/")) return { icon: FileAudio, color: "var(--ios-pink)", label: "音频" };
  if (t.startsWith("video/")) return { icon: FileVideo, color: "var(--ios-purple)", label: "视频" };
  if (/json|xml|javascript|html|calendar/.test(t) || /^(ics|json|xml|html?|txt|log)$/.test(ext)) return { icon: FileCode, color: "var(--ios-gray)", label: "文本" };
  return { icon: File, color: "var(--ios-gray)", label: ext.toUpperCase() || "文件" };
}

const withDownload = (href: string) => `${href}${href.includes("?") ? "&" : "?"}download`;

export function Attachments({ files, hrefFor }: { files: Attachment[]; hrefFor: (id: string) => string }) {
  const [viewing, setViewing] = useState<{ file: Attachment; from?: DOMRect } | null>(null);
  if (!files.length) return null;
  const total = files.reduce((s, f) => s + f.size, 0);

  return (
    <section>
      <h2 className="mb-(--section-header-gap) flex items-baseline justify-between px-(--section-header-inset)">
        <span className="type-subheadline font-semibold text-label">{files.length} 个附件</span>
        <span className="type-footnote text-label-2 tabular-nums">{formatBytes(total)}</span>
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {files.map((f, i) => {
          const kind = kindOf(f);
          const href = hrefFor(f.id);
          const image = f.saved && f.mimeType.startsWith("image/") && !f.mimeType.includes("svg");
          const body = (
            <>
              <span className="relative block aspect-[4/3] overflow-hidden rounded-[12px] bg-fill-3">
                {image ? (
                  <img src={href} alt="" width={400} height={300} loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center" style={{ color: kind.color }}>
                    <kind.icon className="size-10" strokeWidth={1.5} />
                    <span className="absolute bottom-2 left-2 rounded-full px-1.5 py-0.5 type-caption2 font-bold text-on-color" style={{ background: kind.color }}>
                      {kind.label}
                    </span>
                  </span>
                )}
              </span>
              <span className="mt-2 block truncate px-0.5 type-footnote font-semibold text-label">{f.filename}</span>
              <span className="flex items-center justify-between px-0.5 type-caption1 text-label-2">
                <span className="tabular-nums">{f.saved ? formatBytes(f.size) : `${formatBytes(f.size)} · 未保存`}</span>
                {f.saved && <Download className="size-3.5 text-tint" />}
              </span>
            </>
          );
          return (
            <m.div
              key={f.id}
              {...presets.contentAppear}
              transition={{ ...presets.contentAppear.transition, delay: i * stagger.row }}
            >
              {!f.saved ? (
                <div className="mail-card p-2 opacity-60">{body}</div>
              ) : image ? (
                <button
                  type="button"
                  aria-label={`预览 ${f.filename}`}
                  onClick={(e) => {
                    haptic("light");
                    setViewing({ file: f, from: e.currentTarget.querySelector("img")?.getBoundingClientRect() });
                  }}
                  className="pressable block w-full mail-card p-2 text-start"
                >
                  {body}
                </button>
              ) : (
                <a
                  href={withDownload(href)}
                  aria-label={`下载 ${f.filename}`}
                  onClick={() => haptic("light")}
                  className="pressable block mail-card p-2"
                >
                  {body}
                </a>
              )}
            </m.div>
          );
        })}
      </div>
      {viewing && (
        <ImageViewer
          src={hrefFor(viewing.file.id)}
          alt={viewing.file.filename}
          download={withDownload(hrefFor(viewing.file.id))}
          from={viewing.from}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
