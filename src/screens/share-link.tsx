"use client";

import { formatFullTime } from "@/lib/format";
import {
  DEFAULT_LINK_EXPIRY,
  linkState,
  presetToDate,
  SHARE_EXPIRY_PRESETS,
  type ShareExpiryPreset,
} from "@/lib/share-rules";
import { present, toast } from "@/presentation/api";
import { copyText } from "@/lib/utils";
import type { ShareLinkInfo } from "@/services/mail";

const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

type ShareActions = {
  create: (expiresAt: string | null) => Promise<ShareLinkInfo>;
  update: (expiresAt: string | null) => Promise<unknown>;
  revoke: () => Promise<unknown>;
};

type LinkInfo = { token: string | null | undefined; expiresAt: string | null | undefined };

const EXPIRY_ORDER: ShareExpiryPreset[] = [
  DEFAULT_LINK_EXPIRY,
  ...SHARE_EXPIRY_PRESETS.filter((p) => p.days && p.id !== DEFAULT_LINK_EXPIRY)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .map((p) => p.id),
  "mailbox",
];

const expiryLabel = (id: ShareExpiryPreset) => {
  const preset = SHARE_EXPIRY_PRESETS.find((p) => p.id === id)!;
  return preset.days ? `${preset.label}内有效` : "不限期（随邮箱到期）";
};

async function pickExpiry(title: string, message: string) {
  const choice = await present.actionSheet({
    title,
    message,
    actions: EXPIRY_ORDER.map((id) => ({ id, label: expiryLabel(id) })),
  });
  return EXPIRY_ORDER.find((id) => id === choice) ?? null;
}

function describeExpiry(expiresAt: string | null | undefined, expired: boolean) {
  if (!expiresAt) return "不限期，随邮箱到期";
  return expired ? `已于 ${formatFullTime(expiresAt)} 到期` : `${formatFullTime(expiresAt)} 到期`;
}

async function deliver(address: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: `${address} 的收件箱`, text: `用这个链接查看 ${address} 收到的邮件`, url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  if (await copyText(url)) toast.success("分享链接已复制", { description: url });
  else toast.error("复制失败");
}

async function changeExpiry(actions: ShareActions, expired: boolean) {
  const preset = await pickExpiry(expired ? "恢复链接" : "修改有效期", "从现在开始计算，链接地址保持不变");
  if (!preset) return;
  await actions.update(presetToDate(preset));
  toast.success(expired ? "链接已恢复" : "有效期已更新", { description: expiryLabel(preset) });
}

export async function manageShareLink(address: string, link: LinkInfo, actions: ShareActions) {
  const state = linkState(link.token, link.expiresAt);
  if (state === "off" || !link.token) {
    const preset = await pickExpiry(
      "生成分享链接",
      "拿到链接的人不用登录就能查看这个邮箱的收件箱（只读），到期后链接自动失效，你也可以随时停止分享。",
    );
    if (!preset) return;
    try {
      const created = await actions.create(presetToDate(preset));
      await deliver(address, shareUrl(created.shareToken));
    } catch (e) {
      toast.error((e as Error).message);
    }
    return;
  }

  const url = shareUrl(link.token);
  const expired = state === "expired";
  const choice = await present.actionSheet({
    title: expired ? "分享链接已过期" : "分享链接已开启",
    message: `${url} · ${describeExpiry(link.expiresAt, expired)}`,
    actions: expired
      ? [
          { id: "expiry", label: "延长有效期并恢复链接" },
          { id: "stop", label: "停止分享", role: "destructive" },
        ]
      : [
          { id: "share", label: "发送链接" },
          { id: "copy", label: "复制链接" },
          { id: "expiry", label: "修改有效期" },
          { id: "reset", label: "重新生成（旧链接失效）" },
          { id: "stop", label: "停止分享", role: "destructive" },
        ],
  });
  try {
    if (choice === "share") await deliver(address, url);
    if (choice === "copy") {
      if (await copyText(url)) toast.success("分享链接已复制");
      else toast.error("复制失败");
    }
    if (choice === "expiry") await changeExpiry(actions, expired);
    if (choice === "reset") {
      const keep = link.expiresAt ?? null;
      const created = await actions.create(keep);
      toast.success("已生成新链接，旧链接已失效");
      await deliver(address, shareUrl(created.shareToken));
    }
    if (choice === "stop") {
      await actions.revoke();
      toast.success("已停止分享", { description: "之前发出的链接都已失效" });
    }
  } catch (e) {
    toast.error((e as Error).message);
  }
}
