"use client";

import { Check, Copy, Eye, Inbox, Link2Off, TimerOff } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { CodeCard } from "@/components/code-copy";
import { List, Section } from "@/components/list";
import { MessageDetailScreen, type MessageViewModel } from "@/components/message-view";
import { MessageList, MessagesSkeleton } from "@/components/message-list";
import { Screen } from "@/components/screen";
import { ContentUnavailable } from "@/components/states";
import { Button, LiveDot, Skeleton, TagBadge } from "@/design-system/atoms";
import { COPIED_MS, presets } from "@/design-system/motion";
import { formatFullTime, formatListTime, formatRemaining, isFreshCode } from "@/lib/format";
import { copyText } from "@/lib/utils";
import { useNavigation } from "@/navigation/context";
import type { ScreenProps } from "@/navigation/types";
import { toast } from "@/presentation/api";
import { useWatchShare } from "@/services/live";
import { RequestError, useSharedInbox, useSharedMessage } from "@/services/mail";

function Expired({ error }: { error: Error }) {
  const nav = useNavigation();
  const expiredAt = error instanceof RequestError && error.body.reason === "expired" ? String(error.body.expiredAt ?? "") : null;
  return (
    <ContentUnavailable
      icon={expiredAt ? <TimerOff /> : <Link2Off />}
      title={expiredAt ? "链接已过期" : "链接已失效"}
      description={
        expiredAt
          ? `这个分享链接已于 ${formatFullTime(expiredAt)} 到期，如需继续查看，请向邮箱主人索取新的链接`
          : "邮箱主人可能已经停止分享、重新生成了链接，或者邮箱已经过期"
      }
      actions={
        <Button variant="gray" size="small" onClick={() => nav.selectTab("inbox")}>
          去创建自己的邮箱
        </Button>
      }
    />
  );
}

export function SharedInboxScreen({ params }: ScreenProps) {
  const { token } = params;
  useWatchShare(token);
  const { data, error, isLoading, refetch } = useSharedInbox(token);
  const messages = data?.messages;
  const latest = messages?.[0];
  const hero = latest?.code && isFreshCode(latest.receivedAt) ? latest : undefined;

  if (error) {
    return (
      <Screen title="共享收件箱">
        <Expired error={error} />
      </Screen>
    );
  }

  return (
    <Screen
      title="共享收件箱"
      subtitle={messages ? `${messages.length} 封邮件` : " "}
      refreshable={() => refetch()}
    >
      <List>
        <SharedAddressCard address={data?.mailbox.address} expiresAt={data?.mailbox.expiresAt} linkExpiresAt={data?.mailbox.linkExpiresAt} />

        <AnimatePresence initial={false} mode="popLayout">
          {hero?.code && (
            <m.div key={hero.id} {...presets.contentAppear}>
              <CodeCard code={hero.code} caption={`来自 ${hero.fromName || hero.fromAddress} · ${formatListTime(hero.receivedAt)}`} />
            </m.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <Section variant="card">
            <MessagesSkeleton />
          </Section>
        ) : !messages?.length ? (
          <ContentUnavailable
            tone="blue"
            icon={<Inbox />}
            title="正在等待新邮件"
            description="新邮件到达后会自动出现在这里，也可以下拉刷新"
          />
        ) : (
          <Section variant="card" footer="这是只读的共享收件箱，只有拿到链接的人能看到">
            <MessageList
              messages={messages}
              targetFor={(msg) => ({ name: "sharedMessage", params: { token, messageId: msg.id } })}
            />
          </Section>
        )}
      </List>
    </Screen>
  );
}

function SharedAddressCard({ address, expiresAt, linkExpiresAt }: { address?: string; expiresAt?: string; linkExpiresAt?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!address) {
    return (
      <Section variant="card">
        <div className="flex flex-col gap-3 p-(--card-pad)">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="mt-2 h-11 w-full rounded-full" />
        </div>
      </Section>
    );
  }
  const [local, domain] = address.split("@");

  return (
    <Section variant="card">
      <m.div {...presets.contentAppear} className="p-(--card-pad) pb-4">
        <div className="flex flex-wrap items-center gap-1.5 type-footnote text-label-2">
          <LiveDot />
          正在接收
          <span aria-hidden>·</span>
          {linkExpiresAt && (!expiresAt || new Date(linkExpiresAt) < new Date(expiresAt))
            ? `链接${formatRemaining(linkExpiresAt)}`
            : formatRemaining(expiresAt ?? null)}
          <TagBadge color="indigo">
            <Eye className="size-3" strokeWidth={2.6} />
            只读分享
          </TagBadge>
        </div>
        <p className="mt-2 font-mono type-title2 break-all text-label select-text" aria-label={address}>
          {local}
          <span className="text-label-2">@{domain}</span>
        </p>
        <Button
          variant="prominent"
          fullWidth
          haptic="success"
          className="mt-4"
          onClick={async () => {
            if (!(await copyText(address))) return toast.error("复制失败");
            setCopied(true);
            setTimeout(() => setCopied(false), COPIED_MS);
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span key={copied ? "done" : "copy"} {...presets.iconSwap} className="flex items-center gap-2">
              {copied ? <Check strokeWidth={2.6} /> : <Copy />}
              {copied ? "已复制" : "复制地址"}
            </m.span>
          </AnimatePresence>
        </Button>
      </m.div>
    </Section>
  );
}

export function SharedMessageScreen({ params }: ScreenProps) {
  const { token, messageId } = params;
  const nav = useNavigation();
  const { data: message, error } = useSharedMessage(token, messageId);
  const { data: inbox } = useSharedInbox(token);
  const list = inbox?.messages;
  const index = list?.findIndex((m) => m.id === messageId) ?? -1;
  const prev = index > 0 ? list?.[index - 1] : undefined;
  const next = index >= 0 ? list?.[index + 1] : undefined;
  const target = (id: string) => ({ name: "sharedMessage", params: { token, messageId: id } });

  const model: MessageViewModel = {
    message,
    error,
    recipient: inbox?.mailbox.address,
    goPrev: prev && (() => nav.replace(target(prev.id))),
    goNext: next && (() => nav.replace(target(next.id))),
    attachmentHref: (id) => `/api/attachments/${id}?share=${encodeURIComponent(token)}`,
  };
  return <MessageDetailScreen model={model} />;
}
