"use client";

import { Camera, ChevronRight, Infinity as InfinityIcon, Inbox, KeyRound, LogOut, UserX } from "lucide-react";
import { m } from "motion/react";
import { useRef, useState } from "react";
import { List, Row, Section } from "@/components/list";
import { PasswordField } from "@/components/password-field";
import { SheetHeader, useSheet } from "@/components/presentation/sheet";
import { Screen } from "@/components/screen";
import { ContentUnavailable, LoadingState } from "@/components/states";
import { Avatar, Button, IconTile, Skeleton } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets, stagger } from "@/design-system/motion";
import { CountUp } from "@/components/count-up";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { useShake } from "@/hooks/use-shake";
import { toAvatarDataUrl } from "@/lib/avatar-image";
import { formatFullTime } from "@/lib/format";
import { checkNewPassword } from "@/lib/rules";
import { useNavigation } from "@/navigation/context";
import { present, toast, toastError } from "@/presentation/api";
import {
  useAccount,
  useChangePassword,
  useDeleteAccount,
  useLogout,
  useProfile,
} from "@/services/auth";
import { useUserAvatar } from "@/store/avatar";
import { presentAccountSheet } from "./account";

export function ProfileScreen() {
  const nav = useNavigation();
  const { data: session, isLoading: sessionLoading } = useAccount();
  const signedIn = !!session?.user;
  const { data: profile } = useProfile(signedIn);
  const logout = useLogout();
  const username = session?.user?.username;
  const avatar = useUserAvatar(username);
  const avatarInput = useRef<HTMLInputElement>(null);

  if (sessionLoading) {
    return (
      <Screen title="个人中心">
        <LoadingState />
      </Screen>
    );
  }

  if (!signedIn || !username) {
    return (
      <Screen title="个人中心">
        <ContentUnavailable
          icon={<UserX />}
          title="还没有登录"
          description="登录后可以修改密码和使用永久邮箱"
          actions={
            <Button variant="prominent" size="large" haptic onClick={() => presentAccountSheet()}>
              {session?.registration === false ? "登录" : "登录 / 注册"}
            </Button>
          }
        />
      </Screen>
    );
  }

  const user = profile ?? session.user!;

  async function changeAvatar() {
    const choice = await present.actionSheet({
      title: "头像只保存在这台设备上，不会上传到服务器",
      actions: [
        { id: "pick", label: "从相册选择" },
        ...(avatar.isCustom ? [{ id: "reset", label: "移除头像", role: "destructive" as const }] : []),
      ],
    });
    if (choice === "pick") avatarInput.current?.click();
    if (choice === "reset") {
      avatar.reset();
      toast.success("已移除头像");
    }
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      avatar.set(await toAvatarDataUrl(file));
      haptic("success");
      toast.success("头像已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "头像保存失败");
    }
  }

  async function signOut() {
    const choice = await present.actionSheet({
      title: "退出后，账号里的邮箱会从这台设备上隐藏，重新登录即可找回",
      actions: [{ id: "logout", label: "退出登录", role: "destructive" }],
    });
    if (choice !== "logout") return;
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success("已退出登录");
        nav.pop();
      },
      onError: toastError,
    });
  }

  return (
    <Screen title="个人中心" titleDisplay="inline">
      <List>
        <m.section {...presets.contentAppear} className="flex flex-col items-center gap-3 pt-2 text-center">
          <button
            type="button"
            aria-label="更换头像"
            onClick={changeAvatar}
            className="pressable relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-tint"
          >
            <m.span {...presets.cardIn} className="block">
              <Avatar seed={`user:${username}`} text={username} src={avatar.src} size={88} />
            </m.span>
            <span className="lg absolute -right-0.5 -bottom-0.5 grid size-8 place-items-center rounded-full text-tint">
              <Camera className="size-4" strokeWidth={2.4} />
            </span>
          </button>
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatarFile} />
          <div className="on-scene flex flex-col items-center gap-1.5">
            <h2 className="type-title1 text-label">{username}</h2>
            <p className="type-footnote text-label-2">
              {profile ? `${formatFullTime(profile.createdAt).split(" ")[0]} 加入` : <Skeleton className="inline-block h-3 w-24" />}
            </p>
          </div>
        </m.section>

        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Inbox />} color="blue" value={user.mailboxes} label="账号邮箱" order={0} onPress={() => nav.selectTab("inbox")} />
          <StatCard icon={<InfinityIcon />} color="indigo" value={user.permanent} label="永久邮箱" order={1} onPress={() => nav.selectTab("inbox")} />
        </div>

        <Section header="安全" footer="修改密码后，其他设备会自动退出登录">
          <Row
            icon={<IconTile color="orange"><KeyRound /></IconTile>}
            title="修改密码"
            chevron
            onPress={() => present.sheet({ title: "修改密码", content: <ChangePasswordSheet />, detents: ["fit"] })}
          />
        </Section>

        <Section>
          <Row
            icon={<IconTile color="red"><LogOut /></IconTile>}
            title="退出登录"
            destructive
            disabled={logout.isPending}
            onPress={signOut}
          />
          <Row
            icon={<IconTile color="gray"><UserX /></IconTile>}
            title="注销账号"
            destructive
            onPress={() => present.sheet({ title: "注销账号", content: <DeleteAccountSheet onDone={() => nav.pop()} />, detents: ["fit"] })}
          />
        </Section>
      </List>
    </Screen>
  );
}

function StatCard({
  icon,
  color,
  value,
  label,
  order,
  onPress,
}: {
  icon: React.ReactNode;
  color: "blue" | "indigo";
  value: number;
  label: string;
  order: number;
  onPress: () => void;
}) {
  return (
    <m.button
      type="button"
      {...presets.cardIn}
      transition={{ ...presets.cardIn.transition, delay: (order + 1) * stagger.base }}
      onClick={onPress}
      className="mail-card pressable flex flex-col items-start p-(--card-pad-sm) text-start"
    >
      <span className="flex w-full items-center justify-between">
        <IconTile color={color}>{icon}</IconTile>
        <ChevronRight className="size-(--chevron-size) text-chevron" strokeWidth={2.4} />
      </span>
      <span className="mt-3 block type-title1 text-label tabular-nums">
        <CountUp value={value} />
      </span>
      <span className="mt-0.5 block type-footnote text-label-2">{label}</span>
    </m.button>
  );
}

function ChangePasswordSheet() {
  const sheet = useSheet();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const { ref: formRef, shake } = useShake<HTMLDivElement>();
  const { content } = useSheetEntrance();

  const reject = (message: string) => {
    setError(message);
    shake();
  };

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!current) return reject("请输入当前密码");
    const problem = checkNewPassword(next).error ?? (next !== confirm ? "两次输入的新密码不一致" : undefined);
    if (problem) return reject(problem);
    setError(undefined);
    try {
      const { revoked } = await change.mutateAsync({ current, next });
      haptic("success");
      toast.success("密码已修改", { description: revoked ? `已退出其他 ${revoked} 台设备` : undefined });
      sheet.dismiss();
    } catch (err) {
      reject((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <SheetHeader title="修改密码" onConfirm={submit} confirmLabel="保存" confirmLoading={change.isPending} />
      <div ref={content}>
        <List className="pt-2">
          <Section footer={error ? <span className="text-ios-red">{error}</span> : "新密码 8–64 位"}>
            <div ref={formRef}>
              <PasswordField
                label="当前密码"
                autoComplete="current-password"
                enterKeyHint="next"
                aria-invalid={!!error}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <div className="ml-(--row-pad-x) h-(--hairline) bg-separator" />
              <PasswordField
                label="新密码"
                placeholder="至少 8 位"
                autoComplete="new-password"
                enterKeyHint="next"
                aria-invalid={!!error}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <div className="ml-(--row-pad-x) h-(--hairline) bg-separator" />
              <PasswordField
                label="确认新密码"
                placeholder="再输入一次"
                autoComplete="new-password"
                enterKeyHint="go"
                aria-invalid={!!error}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </Section>
          <Button type="submit" variant="prominent" size="large" fullWidth haptic loading={change.isPending}>
            保存新密码
          </Button>
        </List>
      </div>
    </form>
  );
}

function DeleteAccountSheet({ onDone }: { onDone: () => void }) {
  const sheet = useSheet();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const { ref: formRef, shake } = useShake<HTMLDivElement>();
  const { content } = useSheetEntrance();

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password) {
      setError("请输入密码");
      return shake();
    }
    try {
      await remove.mutateAsync(password);
      toast.success("账号已注销");
      sheet.dismiss();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      shake();
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <SheetHeader title="注销账号" />
      <div ref={content}>
        <List className="pt-2">
          <Section
            footer={
              error ? (
                <span className="text-ios-red">{error}</span>
              ) : (
                "账号、账号里的所有邮箱和邮件都会被永久删除，无法恢复"
              )
            }
          >
            <div ref={formRef}>
              <PasswordField
                label="密码"
                autoComplete="current-password"
                enterKeyHint="go"
                aria-invalid={!!error}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </Section>
          <Button type="submit" variant="destructive" size="large" fullWidth haptic loading={remove.isPending}>
            永久注销账号
          </Button>
        </List>
      </div>
    </form>
  );
}
