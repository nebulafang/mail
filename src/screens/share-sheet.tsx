"use client";

import { Check, CircleAlert, History, Link2, Lock, Trash2, UserPlus, Users, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useRef, useState } from "react";
import { DatePicker, Segmented, TextField } from "@/components/form";
import { List, Row, Section } from "@/components/list";
import { SheetHeader } from "@/components/presentation/sheet";
import { ErrorState } from "@/components/states";
import { ActivityIndicator, Avatar, Button, IconButton, Skeleton } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets } from "@/design-system/motion";
import { MenuButton } from "@/components/menu-button";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { formatFullTime, formatRelative, formatRemaining, toDateInput } from "@/lib/format";
import {
  can,
  canAssign,
  linkState,
  MAX_SHARE_BATCH,
  presetToDate,
  ROLE_INFO,
  SHARE_EXPIRY_PRESETS,
  SHARE_ROLES,
  shareExpiryProblem,
  type AccessRole,
  type ShareExpiryPreset,
  type ShareRole,
} from "@/lib/share-rules";
import { describeShareEvent, splitUsernames } from "@/lib/share-text";
import { cn } from "@/lib/utils";
import { present, toast, toastError } from "@/presentation/api";
import type { MenuPointer } from "@/presentation/store";
import { useMailbox, useShareLink } from "@/services/mail";
import {
  lookupUser,
  useActivity,
  useGrantMembers,
  useMembers,
  useRevokeMembers,
  useUndoableRemoveMember,
  useUpdateMember,
  type Member,
} from "@/services/share";
import { manageShareLink } from "./share-link";
import { DAY_MS } from "@/lib/time";

export function presentShareSheet(address: string) {
  present.sheet({ title: "共享邮箱", content: <ShareSheet address={address} />, detents: ["large"] });
}

type Chip = { username: string; state: "checking" | "ok" | "error"; message?: string };
type ExpiryChoice = ShareExpiryPreset | "custom";

const EXPIRY_CHOICES: { value: ExpiryChoice; label: string }[] = [
  ...SHARE_EXPIRY_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: "custom", label: "自定义" },
];

const endOfDay = (date: string) => (date ? new Date(`${date}T23:59:59`).toISOString() : null);

function ShareSheet({ address }: { address: string }) {
  const { data: mailbox } = useMailbox(address);
  const role = mailbox?.role ?? null;
  const members = useMembers(address);
  const grant = useGrantMembers(address);
  const revoke = useRevokeMembers(address);
  const { content } = useSheetEntrance();

  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [shareRole, setShareRole] = useState<ShareRole>("viewer");
  const [expiry, setExpiry] = useState<ExpiryChoice>("mailbox");
  const [dateBounds] = useState(() => {
    const now = Date.now();
    return {
      initial: toDateInput(new Date(now + 7 * DAY_MS)),
      min: toDateInput(new Date(now + DAY_MS)),
      max: toDateInput(new Date(now + 365 * DAY_MS)),
    };
  });
  const [customDate, setCustomDate] = useState(dateBounds.initial);
  const input = useRef<HTMLInputElement>(null);

  const expiryError = expiry === "custom" ? (customDate ? shareExpiryProblem(endOfDay(customDate)) : "请选择日期") : null;
  const ready = chips.filter((c) => c.state === "ok");
  const checking = chips.some((c) => c.state === "checking");
  const problems = chips.filter((c) => c.state === "error");

  const updateChip = (username: string, patch: Partial<Chip>) =>
    setChips((list) => list.map((c) => (c.username === username ? { ...c, ...patch } : c)));

  function addUsernames(raw: string) {
    const names = splitUsernames(raw).filter((n) => !chips.some((c) => c.username === n));
    setDraft("");
    if (!names.length) return;
    const room = MAX_SHARE_BATCH - chips.length;
    if (names.length > room) toast.warning(`一次最多邀请 ${MAX_SHARE_BATCH} 人`);
    const accepted = names.slice(0, Math.max(0, room));
    setChips((list) => [...list, ...accepted.map((username) => ({ username, state: "checking" as const }))]);
    for (const username of accepted) {
      lookupUser(address, username)
        .then((r) => updateChip(username, r.problem ? { state: "error", message: r.message ?? undefined } : { state: "ok" }))
        .catch((e: Error) => updateChip(username, { state: "error", message: e.message }));
    }
  }

  const removeChip = (username: string) => setChips((list) => list.filter((c) => c.username !== username));

  async function submit() {
    if (checking) return toast.info("正在检查用户名，请稍候");
    if (!ready.length) {
      if (draft.trim()) return addUsernames(draft);
      input.current?.focus();
      return toast.info("先输入要共享的用户名");
    }
    if (expiryError) return toast.error(expiryError);
    const expiresAt = expiry === "custom" ? endOfDay(customDate) : presetToDate(expiry);
    try {
      const results = await grant.mutateAsync({ usernames: ready.map((c) => c.username), role: shareRole, expiresAt });
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      setChips((list) =>
        list.flatMap((c) => {
          const miss = failed.find((f) => f.username === c.username);
          if (miss && !miss.ok) return [{ ...c, state: "error" as const, message: miss.error }];
          return ok.some((r) => r.username === c.username) ? [] : [c];
        }),
      );
      if (ok.length) {
        haptic("success");
        const ids = ok.flatMap((r) => (r.ok ? [r.memberId] : []));
        toast.success(`已邀请 ${ok.length} 人（${ROLE_INFO[shareRole].label}）`, {
          description: "对方在首页接受后即可查看",
          duration: 5000,
          action: {
            label: "撤销",
            onClick: () =>
              revoke.mutate(ids, {
                onSuccess: () => toast.success("已撤销邀请"),
                onError: toastError,
              }),
          },
        });
      }
      if (failed.length) toast.error(`${failed.length} 人未能邀请`, { description: "原因已标在对应的用户名上" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <SheetHeader
        title="共享邮箱"
        confirmLabel="发送邀请"
        onConfirm={submit}
        confirmDisabled={!ready.length || checking || !!expiryError}
        confirmLoading={grant.isPending}
      />
      <div ref={content}>
        <List className="pt-2">
          <p className="on-scene -mb-3 px-(--section-header-inset) text-center font-mono type-footnote break-all text-label-2">{address}</p>

          {mailbox?.shareLocked && (
            <Section>
              <Row
                multiline
                icon={<Lock className="mx-1.5 size-5 text-ios-red" />}
                title="共享已被管理员冻结"
                subtitle="暂时不能邀请新成员或开启公开链接，现有成员可以照常移除"
              />
            </Section>
          )}

          <Section
            header="① 邀请用户"
            footer={
              problems.length ? (
                <span className="text-ios-red">{problems.map((c) => `${c.username}：${c.message ?? "无法邀请"}`).join("；")}</span>
              ) : (
                "输入对方完整的用户名，回车添加；可以一次粘贴多个，用空格或逗号分隔"
              )
            }
          >
            {chips.length > 0 && (
              <ul aria-label="待邀请的用户" className="flex flex-wrap gap-1.5 px-(--row-pad-x) pt-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {chips.map((chip) => (
                    <m.li key={chip.username} {...presets.pillIn}>
                      <UserChip chip={chip} onRemove={() => removeChip(chip.username)} />
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) addUsernames(draft);
                else void submit();
              }}
              className="flex items-center pr-2"
            >
              <TextField
                ref={input}
                className="flex-1"
                placeholder={chips.length ? "继续添加用户名" : "用户名"}
                aria-label="用户名"
                enterKeyHint={draft ? "next" : "send"}
                autoComplete="off"
                value={draft}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/[\s,，;；、]$/.test(value)) addUsernames(value);
                  else setDraft(value);
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (splitUsernames(text).length > 1) {
                    e.preventDefault();
                    addUsernames(text);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !draft && chips.length) removeChip(chips[chips.length - 1].username);
                }}
                onClear={() => setDraft("")}
              />
              <IconButton label="添加" type="submit" variant="gray" size={36} disabled={!draft.trim()}>
                <UserPlus strokeWidth={2.4} />
              </IconButton>
            </form>
          </Section>

          <Section header="② 选择权限" footer="默认只读。权限可以随时修改或收回，撤销后立即生效。">
            <div role="radiogroup" aria-label="权限">
              {SHARE_ROLES.map((r) => (
                <RoleOption key={r} role={r} selected={shareRole === r} disabled={!canAssign(role, r)} onSelect={() => setShareRole(r)} />
              ))}
            </div>
          </Section>

          <Section
            header="③ 有效期"
            footer={expiryError ? <span className="text-ios-red">{expiryError}</span> : "到期后自动失去访问权限；“随邮箱”表示和邮箱同时到期。"}
          >
            <div className="px-(--row-pad-x) py-3">
              <Segmented label="有效期" value={expiry} onChange={setExpiry} options={EXPIRY_CHOICES} />
            </div>
            {expiry === "custom" && (
              <Row
                title="到期日期"
                detail={
                  <DatePicker
                    label="到期日期"
                    value={customDate}
                    min={dateBounds.min}
                    max={dateBounds.max}
                    onChange={setCustomDate}
                  />
                }
              />
            )}
          </Section>

          <Button variant="prominent" size="large" fullWidth haptic loading={grant.isPending} disabled={!ready.length || checking || !!expiryError} onClick={submit}>
            {ready.length ? `邀请 ${ready.length} 人` : "发送邀请"}
          </Button>

          <MemberSection address={address} role={role} query={members} />

          {can(role, "link") && (
            <PublicLinkSection address={address} token={mailbox?.shareToken ?? null} expiresAt={mailbox?.shareExpiresAt ?? null} />
          )}

          <ActivitySection address={address} />
        </List>
      </div>
    </>
  );
}

function UserChip({ chip, onRemove }: { chip: Chip; onRemove: () => void }) {
  const tone = chip.state === "error" ? "bg-ios-red/14 text-ios-red" : chip.state === "ok" ? "bg-tint/14 text-tint" : "bg-fill-3 text-label-2";
  return (
    <span
      title={chip.message}
      className={cn("inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-2.5 type-subheadline font-medium", tone)}
    >
      {chip.state === "checking" ? (
        <ActivityIndicator size={12} className="text-current" />
      ) : chip.state === "ok" ? (
        <Check className="size-3.5" strokeWidth={2.8} />
      ) : (
        <CircleAlert className="size-3.5" strokeWidth={2.4} />
      )}
      <span className="max-w-40 truncate">{chip.username}</span>
      <button
        type="button"
        aria-label={`移除 ${chip.username}`}
        onClick={onRemove}
        className="press-fade hit-area grid size-6 place-items-center rounded-full"
      >
        <X className="size-3.5" strokeWidth={2.6} />
      </button>
    </span>
  );
}

function RoleOption({ role, selected, disabled, onSelect }: { role: ShareRole; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const info = ROLE_INFO[role];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => {
        haptic("selection");
        onSelect();
      }}
      className="row-highlight flex w-full items-center gap-(--row-pad-x) bg-surface pl-(--row-pad-x) text-start outline-none focus-visible:bg-highlight disabled:opacity-40"
    >
      <div
        data-sep
        className="mr-(--row-pad-x) flex min-h-(--row-min-h) min-w-0 flex-1 items-center gap-2 border-b-(length:--hairline) border-separator py-(--row-pad-y)"
      >
        <div className="min-w-0 flex-1">
          <div className="type-body text-label">{info.label}</div>
          <div className="type-subheadline text-label-2">{info.description}</div>
        </div>
        <Check aria-hidden className={cn("size-5 shrink-0 text-tint", !selected && "invisible")} strokeWidth={2.6} />
      </div>
    </button>
  );
}

function memberSubtitle(member: Member) {
  const state = member.status === "pending" ? "等待接受" : `${formatRelative(member.acceptedAt ?? member.createdAt)}加入`;
  const until = member.expiresAt ? formatRemaining(member.expiresAt) : "跟随邮箱";
  return `${ROLE_INFO[member.role].label} · ${state} · ${until}`;
}

function MemberSection({ address, role, query }: { address: string; role: AccessRole; query: ReturnType<typeof useMembers> }) {
  const { data, isLoading, error, refetch } = query;
  const owner = data?.owner;
  const list = data?.members ?? [];

  return (
    <Section
      header={
        <span className="flex items-baseline">
          <span className="flex-1">有权限的人</span>
          {data && <span className="type-footnote font-normal text-label-2 tabular-nums">{list.length}/{data.limit}</span>}
        </span>
      }
      footer={list.length ? "点右侧按钮修改权限、有效期或移除成员，移除后可以撤销" : undefined}
    >
      {isLoading ? (
        <div className="flex flex-col gap-3 p-(--card-pad)">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (
        <>
          {owner && (
            <Row
              icon={<Avatar seed={owner} text={owner} size={32} />}
              title={role === "owner" ? `${owner}（你）` : owner}
              subtitle="邮箱主人 · 拥有全部权限"
            />
          )}
          {list.map((member) => (
            <MemberRow key={member.id} address={address} member={member} actor={role} />
          ))}
          {!list.length && (
            <Row icon={<Users className="mx-1.5 size-5 text-label-3" />} title={<span className="text-label-2">还没有共享给任何人</span>} />
          )}
        </>
      )}
    </Section>
  );
}

const MEMBER_EXPIRY: { id: ShareExpiryPreset; label: string }[] = SHARE_EXPIRY_PRESETS.map((p) => ({
  id: p.id,
  label: p.id === "mailbox" ? "跟随邮箱" : `${p.label}后到期`,
}));

function MemberRow({ address, member, actor }: { address: string; member: Member; actor: AccessRole }) {
  const update = useUpdateMember(address);
  const remove = useUndoableRemoveMember(address);
  const editable = !member.self && canAssign(actor, member.role);

  const change = (patch: { role?: ShareRole; expiresAt?: string | null }, success: string) =>
    update.mutate(
      { id: member.id, ...patch },
      { onSuccess: () => toast.success(success), onError: toastError },
    );

  async function openMenu(anchor: HTMLElement, pointer?: MenuPointer) {
    const picked = await present.menu({
      anchor,
      pointer,
      sections: [
        {
          title: "权限",
          items: SHARE_ROLES.map((r) => ({
            id: `role:${r}`,
            label: ROLE_INFO[r].label,
            checked: member.role === r,
            disabled: !canAssign(actor, r),
          })),
        },
        { title: "有效期（从现在开始计算）", items: MEMBER_EXPIRY.map((e) => ({ id: `expiry:${e.id}`, label: e.label })) },
        { items: [{ id: "remove", label: member.status === "pending" ? "取消邀请" : "移除成员", icon: Trash2, role: "destructive" }] },
      ],
    });
    if (picked?.startsWith("role:")) {
      const next = picked.slice(5) as ShareRole;
      if (next !== member.role) change({ role: next }, `${member.username} 现在是「${ROLE_INFO[next].label}」`);
    }
    if (picked?.startsWith("expiry:")) {
      const preset = picked.slice(7) as ShareExpiryPreset;
      change({ expiresAt: presetToDate(preset) }, preset === "mailbox" ? "有效期已改为跟随邮箱" : "有效期已更新");
    }
    if (picked === "remove") remove(member);
  }

  return (
    <Row
      icon={<Avatar seed={member.username} text={member.username} size={32} />}
      title={member.self ? `${member.username}（你）` : member.username}
      subtitle={memberSubtitle(member)}
      detail={
        update.isPending ? (
          <ActivityIndicator size={16} />
        ) : editable ? (
          <MenuButton label={`管理 ${member.username}`} variant="gray" size={32} onOpen={openMenu} />
        ) : undefined
      }
    />
  );
}

function PublicLinkSection({ address, token, expiresAt }: { address: string; token: string | null; expiresAt: string | null }) {
  const share = useShareLink(address);
  const state = linkState(token, expiresAt);
  const status =
    state === "off" ? "未开启" : state === "expired" ? <span className="text-ios-red">已过期</span> : expiresAt ? formatRemaining(expiresAt) : "不限期";

  return (
    <Section
      header="公开链接"
      footer="拿到链接的人不用登录即可只读查看，适合临时给没有账号的人看"
    >
      <Row
        icon={<Link2 className="mx-1.5 size-5 text-tint" />}
        title="只读链接"
        detail={status}
        chevron
        onPress={() =>
          manageShareLink(
            address,
            { token, expiresAt },
            {
              create: (until) => share.create.mutateAsync(until),
              update: (until) => share.update.mutateAsync(until),
              revoke: () => share.revoke.mutateAsync(),
            },
          )
        }
      />
    </Section>
  );
}

function ActivitySection({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const { data: mailbox } = useMailbox(address);
  const allowed = can(mailbox?.role ?? null, "activity");
  const { data, isLoading, error, refetch } = useActivity(address, open && allowed);
  if (!allowed) return null;

  return (
    <Section header="操作记录">
      <Row
        icon={<History className="mx-1.5 size-5 text-label-2" />}
        title={open ? "收起操作记录" : "查看分享、修改和撤销记录"}
        onPress={() => setOpen((v) => !v)}
      />
      {open &&
        (isLoading ? (
          <div className="flex flex-col gap-3 p-(--card-pad)">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : !data?.length ? (
          <Row title={<span className="text-label-2">暂无记录</span>} />
        ) : (
          data.map((event) => <Row key={event.id} multiline title={describeShareEvent(event)} subtitle={formatFullTime(event.at)} />)
        ))}
    </Section>
  );
}
