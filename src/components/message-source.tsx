"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/form";
import { List, Section } from "@/components/list";
import { SheetHeader } from "@/components/presentation/sheet";
import { TagBadge } from "@/design-system/atoms";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { formatBytes, formatFullTime } from "@/lib/format";
import type { MessageDetail } from "@/services/mail";
import { copyWithToast } from "@/presentation/copy";

const LABELS: Record<string, string> = {
  "message-id": "Message-ID",
  date: "发送时间",
  "reply-to": "回复地址",
  "return-path": "退信地址",
  sender: "代发人",
  "list-unsubscribe": "退订",
  "list-id": "邮件列表",
  "x-mailer": "发信软件",
  "authentication-results": "认证结果",
  "arc-authentication-results": "ARC 认证",
  "received-spf": "SPF",
  "dkim-signature": "DKIM 签名",
  received: "中转",
  "content-type": "内容类型",
  "mime-version": "MIME",
  "x-spam-status": "垃圾判定",
};

type Verdict = { name: string; result: string };

function verdicts(headers: { key: string; value: string }[]): Verdict[] {
  const text = headers
    .filter((h) => h.key === "authentication-results" || h.key === "arc-authentication-results" || h.key === "received-spf")
    .map((h) => (h.key === "received-spf" ? `spf=${h.value.split(/\s/)[0]}` : h.value))
    .join(";");
  const out: Verdict[] = [];
  for (const name of ["spf", "dkim", "dmarc"]) {
    const hit = text.match(new RegExp(`\\b${name}=(\\w+)`, "i"));
    if (hit) out.push({ name: name.toUpperCase(), result: hit[1].toLowerCase() });
  }
  return out;
}

const tone = (result: string) => (result === "pass" ? "green" : /fail|softfail|permerror/.test(result) ? "red" : "orange");

export function MessageSource({ message, recipient }: { message: MessageDetail; recipient?: string }) {
  const [tab, setTab] = useState<"headers" | "text">("headers");
  const { content } = useSheetEntrance();
  const headers = message.headers ?? [];
  const checks = verdicts(headers);

  return (
    <div>
      <SheetHeader title="邮件原文" />
      <div ref={content}>
        <List className="pt-2">
          <Segmented
            label="视图"
            value={tab}
            onChange={setTab}
            options={[
              { value: "headers", label: "邮件头" },
              { value: "text", label: "纯文本" },
            ]}
          />
          {tab === "headers" ? (
            <>
              <Section>
                <dl className="flex flex-col px-(--card-pad-sm)">
                  <Item label="发件人" value={message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} onCopy={copyWithToast} />
                  {recipient && <Item label="收件人" value={recipient} onCopy={copyWithToast} />}
                  <Item label="主题" value={message.subject || "（无主题）"} onCopy={copyWithToast} />
                  <Item label="收到" value={formatFullTime(message.receivedAt)} />
                  <Item label="大小" value={formatBytes(message.size)} />
                </dl>
              </Section>
              {checks.length > 0 && (
                <Section
                  header="发件人认证"
                  footer={
                    checks.every((c) => c.result === "pass")
                      ? "认证全部通过，邮件大概率真的来自这个域名"
                      : "有认证没通过，这封邮件可能是伪造的，别轻易点里面的链接"
                  }
                >
                  <div className="flex flex-wrap gap-2 p-(--card-pad-sm)">
                    {checks.map((c) => (
                      <TagBadge key={c.name} color={tone(c.result)} size="large">
                        {c.name} · {c.result}
                      </TagBadge>
                    ))}
                  </div>
                </Section>
              )}
              {headers.length > 0 ? (
                <Section header="邮件头">
                  <dl className="flex flex-col px-(--card-pad-sm)">
                    {headers.map((h, i) => (
                      <Item key={i} label={LABELS[h.key] ?? h.key} value={h.value} mono onCopy={copyWithToast} />
                    ))}
                  </dl>
                </Section>
              ) : (
                <p className="px-(--section-header-inset) type-footnote text-label-2">这封邮件是升级前收到的，没有保存邮件头</p>
              )}
            </>
          ) : (
            <Section>
              <pre className="max-h-[60dvh] overflow-auto p-(--card-pad-sm) font-mono type-footnote whitespace-pre-wrap text-label select-text [overflow-wrap:anywhere]">
                {message.text?.trim() || "（无纯文本内容）"}
              </pre>
              {message.text && (
                <button
                  type="button"
                  onClick={() => copyWithToast("正文", message.text!)}
                  className="row-highlight flex w-full items-center justify-center gap-2 border-t-(length:--hairline) border-separator py-3 type-body text-tint"
                >
                  <Copy className="size-4" />
                  复制全部正文
                </button>
              )}
            </Section>
          )}
        </List>
      </div>
    </div>
  );
}

function Item({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: (label: string, value: string) => void }) {
  return (
    <div className="flex gap-3 border-b-(length:--hairline) border-separator py-2.5 last:border-transparent">
      <dt className="w-20 shrink-0 type-subheadline text-label-2">{label}</dt>
      <dd
        onClick={onCopy ? () => onCopy(label, value) : undefined}
        className={`min-w-0 flex-1 break-words text-label select-text ${mono ? "font-mono type-footnote" : "type-subheadline"}`}
      >
        {value}
      </dd>
    </div>
  );
}
