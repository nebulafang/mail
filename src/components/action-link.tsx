"use client";

import { ArrowUpRight, KeyRound, Link2, LogIn, ShieldCheck } from "lucide-react";
import { m } from "motion/react";
import { haptic } from "@/design-system/haptics";
import { presets } from "@/design-system/motion";
import { useLongPress } from "@/hooks/use-long-press";
import type { ActionLink } from "@/lib/mail-links";
import { copyText } from "@/lib/utils";
import { present, toast } from "@/presentation/api";

const KIND = {
  verify: { title: "验证链接", button: "打开验证", icon: ShieldCheck, color: "var(--ios-green)" },
  login: { title: "登录链接", button: "打开登录", icon: LogIn, color: "var(--ios-blue)" },
  reset: { title: "重置密码链接", button: "去重置", icon: KeyRound, color: "var(--ios-orange)" },
  open: { title: "操作链接", button: "打开", icon: Link2, color: "var(--ios-indigo)" },
};

export function ActionLinkCard({ link }: { link: ActionLink }) {
  const kind = KIND[link.kind];
  const longPress = useLongPress(async (el, { pointer }) => {
    const picked = await present.menu({
      anchor: el,
      pointer,
      sections: [{ items: [{ id: "copy", label: "复制链接" }, { id: "open", label: "在浏览器打开" }] }],
    });
    if (picked === "copy" && (await copyText(link.href))) toast.success("链接已复制");
    if (picked === "open") window.open(link.href, "_blank", "noopener,noreferrer");
  });

  return (
    <m.a
      {...presets.contentAppear}
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (longPress.fired()) return e.preventDefault();
        haptic("success");
      }}
      {...longPress.handlers}
      className="pressable flex items-center gap-3 mail-card p-(--card-pad-sm)"
      style={{ "--link-color": kind.color } as React.CSSProperties}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--link-color)/15 text-(--link-color)">
        <kind.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-footnote text-label-2">{kind.title}</span>
        <span className="block truncate type-headline text-label">{link.label || link.host}</span>
        <span className="block truncate type-caption1 text-label-2">{link.host}</span>
      </span>
      <span className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-(--link-color) px-3 type-subheadline font-semibold text-on-color">
        {kind.button}
        <ArrowUpRight className="size-4" strokeWidth={2.6} />
      </span>
    </m.a>
  );
}
