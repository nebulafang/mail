"use client";

import { CircleCheck, CircleX, Dices, Shuffle, Users } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Picker, Segmented, TextField } from "@/components/form";
import { List, Row, Section } from "@/components/list";
import { SheetHeader, useSheet } from "@/components/presentation/sheet";
import { ActivityIndicator, Avatar, IconButton } from "@/design-system/atoms";
import { presets } from "@/design-system/motion";
import { randomLocalPart } from "@/lib/address";
import { EXPIRY_KEYS, EXPIRY_OPTIONS, type Expiry } from "@/lib/config";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { checkLocalPart } from "@/lib/rules";
import { useNavigation } from "@/navigation/context";
import { present, toast } from "@/presentation/api";
import { useAddressAvailability, useCreateMailbox, useSavedMailboxes } from "@/services/mail";

export function presentCreateMailbox(domains: string[]) {
  present.sheet({ title: "新建邮箱", content: <CreateMailboxForm domains={domains} />, detents: ["fit"] });
}

function CreateMailboxForm({ domains }: { domains: string[] }) {
  const sheet = useSheet();
  const nav = useNavigation();
  const createMailbox = useCreateMailbox();
  const saved = useSavedMailboxes();
  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [expiry, setExpiry] = useState<Expiry>("1d");
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [rolls, setRolls] = useState(0);
  const { content } = useSheetEntrance();

  const live = localPart ? checkLocalPart(localPart) : undefined;
  const candidate = live?.value ? `${live.value}@${domain}` : undefined;
  const availability = useAddressAvailability(candidate);
  const taken = availability.status === "taken";
  const shared = availability.status === "shared";

  const changeLocalPart = (value: string, validate = submitted) => {
    const next = value.toLowerCase();
    setLocalPart(next);
    if (validate) setError(checkLocalPart(next).error);
  };

  const footer = error ? (
    <span className="text-ios-red">{error}</span>
  ) : !localPart ? (
    "留空会随机生成一个地址"
  ) : live?.error ? (
    <span className="text-ios-red">{live.error}</span>
  ) : availability.pending ? (
    <span className="inline-flex items-center gap-1.5">
      <ActivityIndicator size={12} />
      正在检查 {candidate}
    </span>
  ) : taken ? (
    <span className="text-ios-red">{candidate} 已被其他账号占用，换一个试试</span>
  ) : shared ? (
    <span className="inline-flex items-center gap-1 text-ios-orange">
      <Users className="size-3.5" />
      公共地址，未登录创建的邮箱可以一起使用，别人也能看到收件箱
    </span>
  ) : availability.status === "free" ? (
    <span className="inline-flex items-center gap-1 text-ios-green">
      <CircleCheck className="size-3.5" />
      可以使用 {candidate}
    </span>
  ) : (
    candidate
  );

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const checked = checkLocalPart(localPart);
    setError(checked.error);
    if (checked.value === undefined || taken) return;
    try {
      const mailbox = await createMailbox.mutateAsync({ domain, localPart: checked.value, expiry });
      saved.add(mailbox.address);
      toast.success(mailbox.shared ? "已打开公共邮箱" : "已创建邮箱", { description: mailbox.address });
      sheet.dismiss();
      nav.push({ name: "mailbox", params: { address: mailbox.address } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <SheetHeader
        title="新建邮箱"
        onConfirm={submit}
        confirmLabel={shared ? "打开" : "创建"}
        confirmLoading={createMailbox.isPending}
        confirmDisabled={!domains.length || taken}
      />
      <div ref={content}>
        <List className="pt-2">
          <PreviewCard
            local={live?.value ?? (localPart || "")}
            domain={domain}
            status={
              !localPart
                ? "random"
                : live?.error
                  ? "invalid"
                  : availability.pending
                    ? "pending"
                    : taken
                      ? "taken"
                      : shared
                        ? "shared"
                        : availability.status === "free"
                          ? "free"
                          : "pending"
            }
          />
          <Section
            header="地址"
            footer={footer}
          >
            <div className="flex items-center pr-2">
              <TextField
                className="flex-1"
                placeholder="随机"
                aria-invalid={!!error}
                value={localPart}
                onChange={(e) => changeLocalPart(e.target.value)}
                onClear={() => changeLocalPart("")}
                enterKeyHint="done"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
              />
              <IconButton
                label="随机生成"
                variant="gray"
                size={36}
                onClick={() => {
                  setRolls(rolls + 1);
                  changeLocalPart(randomLocalPart(), true);
                }}
              >
                <Dices key={rolls} className={rolls ? "symbol-wiggle" : undefined} />
              </IconButton>
            </div>
            <Row
              title="域名"
              detail={
                <Picker
                  label="域名"
                  value={domain}
                  onChange={setDomain}
                  options={domains.map((d) => ({ value: d, label: `@${d}` }))}
                />
              }
            />
          </Section>
          <Section header="有效期" footer="到期后邮箱和邮件会被自动删除">
            <div className="p-3">
              <Segmented
                label="有效期"
                value={expiry}
                onChange={setExpiry}
                options={EXPIRY_KEYS.map((k) => ({ value: k, label: EXPIRY_OPTIONS[k].label }))}
              />
            </div>
          </Section>
        </List>
      </div>
    </form>
  );
}

type PreviewStatus = "random" | "invalid" | "pending" | "taken" | "shared" | "free";

const STATUS: Record<PreviewStatus, { label: string; tone: string; icon?: React.ComponentType<{ className?: string }> }> = {
  random: { label: "随机生成", tone: "gray", icon: Shuffle },
  invalid: { label: "格式不对", tone: "red", icon: CircleX },
  pending: { label: "检查中", tone: "gray" },
  taken: { label: "已被占用", tone: "red", icon: CircleX },
  shared: { label: "公共地址", tone: "orange", icon: Users },
  free: { label: "可以使用", tone: "green", icon: CircleCheck },
};

function PreviewCard({ local, domain, status }: { local: string; domain: string; status: PreviewStatus }) {
  const s = STATUS[status];
  const seed = local ? `${local}@${domain}` : domain;
  return (
    <div className="mail-card flex items-center gap-3 p-(--card-pad-sm)">
      <Avatar seed={seed} text={local || "?"} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono type-headline text-label">
          {local ? local : <span className="text-label-3">••••••</span>}
          <span className="text-label-2">@{domain}</span>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={status}
            {...presets.iconSwap}
            style={{ color: `var(--ios-${s.tone})` }}
            className="mt-0.5 inline-flex items-center gap-1 type-footnote font-medium"
          >
            {s.icon ? <s.icon className="size-3.5" /> : <ActivityIndicator size={12} />}
            {s.label}
          </m.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
