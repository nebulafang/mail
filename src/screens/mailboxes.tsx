"use client";

import { ArrowRight, Plus, Zap } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { TextField } from "@/components/form";
import { List, Section } from "@/components/list";
import { Screen } from "@/components/screen";
import { SeoContent } from "@/components/seo-content";
import { ActivityIndicator, AppIcon, Button, IconButton, LiveDot, Skeleton } from "@/design-system/atoms";
import { haptic, hapticRef } from "@/design-system/haptics";
import { presets, springs, stagger } from "@/design-system/motion";
import { useFlipList } from "@/hooks/use-flip-list";
import { useLongPress } from "@/hooks/use-long-press";
import { MAX_ACCOUNT_MAILBOXES, MAX_SAVED_MAILBOXES } from "@/lib/config";
import { checkEmail } from "@/lib/rules";
import { hideSplash } from "@/lib/splash";
import { useNavigation } from "@/navigation/context";
import { present, toast, toastError } from "@/presentation/api";
import { useAccount } from "@/services/auth";
import { useLiveState } from "@/services/live-state";
import { useLeaveMailbox } from "@/services/share";
import {
  useConfig,
  useCreateMailbox,
  useDeleteMailbox,
  useMailboxes,
  useOpenMailbox,
  useSavedMailboxes,
  type MailboxItem,
} from "@/services/mail";
import { InvitationsSection } from "./invitations";
import { MailboxCard } from "./mailbox-cards";
import { formatCapped } from "@/lib/format";

function hasStoredMailboxes() {
  try {
    const list = JSON.parse(window.localStorage.getItem("saved-mailboxes") ?? "[]");
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

export function MailboxesScreen() {
  const nav = useNavigation();
  const cards = useFlipList<HTMLDivElement>();
  const saved = useSavedMailboxes();
  const { data: session, isPending: sessionPending } = useAccount();
  const account = session?.user ?? null;
  const { data: mailboxes, isLoading, isSuccess, isError, refetch } = useMailboxes(saved.addresses, account?.username ?? null);
  const { data: config } = useConfig();
  const domains = config?.domains ?? [];
  const createMailbox = useCreateMailbox();
  const deleteMailbox = useDeleteMailbox();
  const leaveMailbox = useLeaveMailbox();
  const live = useLiveState((s) => s.connected);
  const { retain } = saved;

  useEffect(() => {
    if (isSuccess && mailboxes) retain(mailboxes.map((box) => box.address));
  }, [isSuccess, mailboxes, retain]);

  useEffect(() => {
    if (sessionPending) return;
    const expecting = !!account || hasStoredMailboxes();
    if (!expecting || isSuccess || isError) hideSplash();
  }, [sessionPending, account, isSuccess, isError]);

  const full = () => {
    const limit = account ? MAX_ACCOUNT_MAILBOXES : MAX_SAVED_MAILBOXES;
    if (account ? account.mailboxes < limit : !saved.isFull) return false;
    toast.error(`最多保存 ${limit} 个邮箱`, { description: "请先删除不用的邮箱" });
    return true;
  };

  async function quickCreate() {
    if (full()) return;
    if (!domains[0]) return toast.error("服务端还没有配置收信域名");
    try {
      const mailbox = await createMailbox.mutateAsync({ domain: domains[0], expiry: "1d" });
      haptic("success");
      saved.add(mailbox.address);
      nav.push({ name: "mailbox", params: { address: mailbox.address } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function openCreate() {
    if (full()) return;
    void import("./create-mailbox").then((m) => m.presentCreateMailbox(domains));
  }

  const plusPress = useLongPress(
    async (el, { pointer }) => {
      const picked = await present.menu({
        anchor: el,
        pointer,
        sections: [
          {
            items: [
              { id: "quick", label: "一键新建", icon: Zap },
              { id: "custom", label: "自定义地址", icon: Plus },
            ],
          },
        ],
      });
      if (picked === "quick") quickCreate();
      if (picked === "custom") openCreate();
    },
    { pressFeedback: false },
  );

  async function leave(box: MailboxItem) {
    const choice = await present.actionSheet({
      title: `退出 ${box.address} 的共享？`,
      message: `退出后将无法再查看这个邮箱，需要 ${box.sharedBy ?? "邮箱主人"} 重新邀请`,
      actions: [{ id: "leave", label: "退出共享", role: "destructive" }],
    });
    if (choice !== "leave") return;
    leaveMailbox.mutate(box.address, {
      onSuccess: () => toast.success("已退出共享"),
      onError: toastError,
      onSettled: () => saved.remove(box.address),
    });
  }

  async function remove(box: MailboxItem) {
    if (box.sharedBy) return leave(box);
    const choice = await present.actionSheet({
      title: `删除 ${box.address}？`,
      message: "邮箱和所有邮件都会被永久删除，地址也会被释放",
      actions: [{ id: "delete", label: "删除邮箱", role: "destructive" }],
    });
    if (choice !== "delete") return;
    deleteMailbox.mutate(box.address, {
      onSuccess: () => toast.success("邮箱已删除"),
      onError: toastError,
      onSettled: () => saved.remove(box.address),
    });
  }

  const hasMailboxes = saved.addresses.length > 0 || !!mailboxes?.length || (account?.mailboxes ?? 0) > 0;
  const count = mailboxes?.length ?? saved.addresses.length;
  const unread = mailboxes?.reduce((sum, box) => sum + box.unread, 0) ?? 0;
  const status = [live && "实时接收中", unread ? `${formatCapped(unread)} 封未读` : !live && `${count} 个邮箱`]
    .filter(Boolean)
    .join(" · ");
  const list = (mailboxes ?? []).filter((box) => !box.sharedBy);
  const sharedList = (mailboxes ?? []).filter((box) => box.sharedBy);

  return (
    <Screen
      title="临时邮箱"
      subtitle={
        hasMailboxes ? (
          <span className="inline-flex items-center gap-1.5">
            {live && <LiveDot />}
            {status}
          </span>
        ) : undefined
      }
      refreshable={hasMailboxes ? () => refetch() : undefined}
      accessory={
        hasMailboxes && (
          <button
            ref={hapticRef("light")}
            type="button"
            aria-label="新建邮箱"
            onClick={() => !plusPress.fired() && openCreate()}
            {...plusPress.handlers}
            className="lg lg-tinted pressable grid size-full place-items-center rounded-full [--press-scale:var(--press-scale-tab)] [&_svg]:size-7"
          >
            <Plus strokeWidth={2.4} />
          </button>
        )
      }
    >
      <List>
        <InvitationsSection enabled={!!account} />

        {!hasMailboxes && <Onboarding creating={createMailbox.isPending} onQuick={quickCreate} onCustom={openCreate} />}

        {hasMailboxes && isLoading && <HomeSkeleton rows={Math.min(Math.max(count, 1), 3)} />}

        {hasMailboxes && !isLoading && (
          <>
            <div className="flex gap-2.5">
              <Button variant="prominent" size="large" className="flex-[2]" haptic loading={createMailbox.isPending} onClick={quickCreate}>
                <Zap className="fill-current" />
                一键新建
              </Button>
              <Button variant="glass" size="large" className="flex-1" onClick={openCreate}>
                自定义
              </Button>
            </div>

            {list.length > 0 && (
              <MailboxGroup title="我的邮箱" boxes={list} cardsRef={cards} onRemove={remove} hint="右滑复制地址，左滑删除，长按查看更多操作" />
            )}

            {sharedList.length > 0 && (
              <MailboxGroup title="共享给我的" boxes={sharedList} onRemove={remove} hint="别人共享给你的邮箱，左滑可以退出共享" />
            )}
          </>
        )}

        <OpenMailbox onOpened={saved.add} />

        <div className="cv-auto flex flex-col gap-(--section-gap)">
          <SeoContent />
        </div>
      </List>
    </Screen>
  );
}

function MailboxGroup({
  title,
  boxes,
  hint,
  cardsRef,
  onRemove,
}: {
  title: string;
  boxes: MailboxItem[];
  hint: string;
  cardsRef?: React.Ref<HTMLDivElement>;
  onRemove: (box: MailboxItem) => void;
}) {
  return (
    <section aria-label={title}>
      <h2 className="on-scene mb-(--section-header-gap) flex items-baseline px-(--section-header-inset) type-subheadline font-semibold text-label">
        <span className="flex-1">{title}</span>
        <span className="type-footnote font-normal text-label-2 tabular-nums">{boxes.length}</span>
      </h2>
      <div ref={cardsRef} className="flex flex-col gap-(--card-gap)">
        <AnimatePresence mode="popLayout">
          {boxes.map((box, i) => (
            <m.div
              key={box.id}
              initial={presets.cardIn.initial}
              animate={{ ...presets.cardIn.animate, transition: { ...springs.hero, delay: i * stagger.row } }}
              {...presets.cardOut}
              transition={springs.hero}
            >
              <MailboxCard mailbox={box} onDelete={() => onRemove(box)} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      <p className="on-scene mt-(--section-header-gap) px-(--section-header-inset) type-footnote text-label-2">{hint}</p>
    </section>
  );
}

function Onboarding({ creating, onQuick, onCustom }: { creating: boolean; onQuick: () => void; onCustom: () => void }) {
  return (
    <m.div {...presets.cardIn}>
      <div
        style={{ "--hero-a": "var(--ios-indigo)", "--hero-b": "var(--ios-blue)", "--hero-glow": "color-mix(in oklab, var(--ios-indigo) 55%, transparent)" } as React.CSSProperties}
        className="hero-surface flex flex-col items-center px-(--card-pad) pt-8 pb-(--card-pad) text-center"
      >
        <span aria-hidden className="hero-blob -top-1/3 -right-1/4" />
        <span aria-hidden className="hero-blob -bottom-1/2 -left-1/4 [animation-delay:-8s]" />
        <AppIcon size={80} />
        <h2 className="mt-5 type-title2">收验证码，不暴露真实邮箱</h2>
        <p className="mt-1.5 type-subheadline text-(--hero-ink-2)">
          无需注册，一键生成地址
          <br />
          默认有效期 1 天，可随时延长
        </p>
        <div className="mt-6 flex w-full max-w-(--empty-action-w) flex-col gap-2.5">
          <button
            ref={hapticRef("light")}
            type="button"
            disabled={creating}
            aria-busy={creating || undefined}
            onClick={onQuick}
            className="pressable inline-flex h-(--control-h-lg) items-center justify-center gap-2 rounded-full bg-white type-body font-semibold text-(--hero-a) shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)] [&_svg]:size-5"
          >
            {creating ? (
              <ActivityIndicator size={18} className="text-current" />
            ) : (
              <>
                <Zap className="fill-current" />
                立即获取邮箱
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCustom}
            className="pressable inline-flex h-(--control-h-lg) items-center justify-center rounded-full bg-(--hero-chip) type-body font-semibold"
          >
            自定义地址
          </button>
        </div>
      </div>
    </m.div>
  );
}

function HomeSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-(--space-4)">
      <div className="flex gap-2.5">
        <Skeleton className="h-(--control-h-lg) flex-[2] rounded-full" />
        <Skeleton className="h-(--control-h-lg) flex-1 rounded-full" />
      </div>
      <div className="flex flex-col gap-(--card-gap)">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="mail-card flex min-h-(--row-min-h) items-center gap-3 px-(--row-pad-x) py-3.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenMailbox({ onOpened }: { onOpened: (address: string) => void }) {
  const nav = useNavigation();
  const openMailbox = useOpenMailbox();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  async function open(input: string) {
    setSubmitted(true);
    const checked = checkEmail(input);
    setError(checked.error);
    if (checked.value === undefined) return;
    try {
      const mailbox = await openMailbox.mutateAsync(checked.value);
      onOpened(mailbox.address);
      setAddress("");
      setSubmitted(false);
      nav.push({ name: "mailbox", params: { address: mailbox.address } });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return toast.error("剪贴板是空的");
      setAddress(text);
      open(text);
    } catch {
      toast.error("无法读取剪贴板", { description: "请长按输入框手动粘贴" });
    }
  }

  return (
    <Section
      header="打开已有邮箱"
      footer={error ? <span className="text-ios-red">{error}</span> : "只保存在本机。知道地址的人都能查看收件箱。"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open(address);
        }}
        noValidate
        className="flex items-center pr-2"
      >
        <TextField
          className="flex-1"
          type="email"
          inputMode="email"
          enterKeyHint="go"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          aria-label="邮箱地址"
          aria-invalid={!!error}
          value={address}
          trailing={
            !address && (
              <button type="button" onClick={paste} className="press-fade shrink-0 type-body text-tint">
                粘贴
              </button>
            )
          }
          onChange={(e) => {
            setAddress(e.target.value);
            if (submitted) setError(checkEmail(e.target.value).error);
          }}
        />
        <IconButton label="打开" type="submit" variant="prominent" size={36} disabled={openMailbox.isPending || !address}>
          {openMailbox.isPending ? <ActivityIndicator size={16} className="text-current" /> : <ArrowRight strokeWidth={2.4} />}
        </IconButton>
      </form>
    </Section>
  );
}
