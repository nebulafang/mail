"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Segmented, TextField } from "@/components/form";
import { List, Section } from "@/components/list";
import { PasswordField } from "@/components/password-field";
import { SheetHeader, useSheet } from "@/components/presentation/sheet";
import { AppIcon, Button, Inset } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets } from "@/design-system/motion";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { useShake } from "@/hooks/use-shake";
import { checkNewPassword, checkUsername } from "@/lib/rules";
import { present, toast } from "@/presentation/api";
import { useAccount, useClaimMailboxes, useLogin, useRegister } from "@/services/auth";
import { request, useLocalNotes, useSavedMailboxes } from "@/services/mail";

type Mode = "login" | "register";

export function presentAccountSheet(mode: Mode = "login") {
  present.sheet({ title: "账号", content: <AccountSheet initialMode={mode} />, detents: ["fit"] });
}

function validate(mode: Mode, username: string, password: string, confirm: string) {
  if (mode === "login") {
    if (!username.trim()) return "请输入用户名";
    if (!password) return "请输入密码";
    return undefined;
  }
  return (
    checkUsername(username).error ??
    checkNewPassword(password).error ??
    (password !== confirm ? "两次输入的密码不一致" : undefined)
  );
}

function AccountSheet({ initialMode }: { initialMode: Mode }) {
  const sheet = useSheet();
  const login = useLogin();
  const register = useRegister();
  const claim = useClaimMailboxes();
  const saved = useSavedMailboxes();
  const { notes, setNote } = useLocalNotes();
  const [chosenMode, setMode] = useState<Mode>(initialMode);
  const registrationOpen = useAccount().data?.registration !== false;
  const mode: Mode = registrationOpen ? chosenMode : "login";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const { ref: formRef, shake } = useShake<HTMLDivElement>();
  const pending = login.isPending || register.isPending;
  const { content } = useSheetEntrance();
  const registering = mode === "register";

  const reject = (message: string) => {
    setError(message);
    shake();
  };

  async function offerClaim() {
    if (!saved.addresses.length) return;
    const choice = await present.actionSheet({
      title: `把这台设备上的 ${saved.addresses.length} 个邮箱加入账号？`,
      message: "加入后可以在其他设备登录查看，只有你能打开，别人也无法再创建这些地址",
      actions: [{ id: "claim", label: "加入账号" }],
    });
    if (choice !== "claim") return;
    try {
      const { claimed } = await claim.mutateAsync(saved.addresses);
      await Promise.all(
        claimed
          .filter((address) => notes[address])
          .map((address) =>
            request(`/api/mailboxes/${encodeURIComponent(address)}`, {
              method: "PATCH",
              body: JSON.stringify({ note: notes[address] }),
            }).then(() => setNote(address, "")),
          ),
      ).catch(() => {});
      toast.success(claimed.length ? `已加入 ${claimed.length} 个邮箱` : "没有可以加入的邮箱", {
        description: claimed.length < saved.addresses.length ? "已属于其他账号或已过期的邮箱不会加入" : undefined,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const problem = validate(mode, username, password, confirm);
    if (problem) return reject(problem);
    setError(undefined);
    try {
      const credentials = { username: username.trim().toLowerCase(), password };
      const { user } = mode === "login" ? await login.mutateAsync(credentials) : await register.mutateAsync(credentials);
      haptic("success");
      toast.success(mode === "login" ? `欢迎回来，${user.username}` : `注册成功，欢迎你 ${user.username}`);
      sheet.dismiss();
      offerClaim();
    } catch (err) {
      reject((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <SheetHeader title={mode === "login" ? "登录" : "注册"} />
      <div ref={content}>
        <List className="pt-1">
          <m.div {...presets.cardIn} className="flex flex-col items-center gap-2 text-center">
            <AppIcon size={64} />
            <AnimatePresence mode="popLayout" initial={false}>
              <m.h3 key={mode} {...presets.iconSwap} className="type-title2 text-label">
                {mode === "login" ? "欢迎回来" : "创建账号"}
              </m.h3>
            </AnimatePresence>
          </m.div>
          {registrationOpen && (
            <Inset>
              <Segmented
                label="登录或注册"
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError(undefined);
                }}
                options={[
                  { value: "login", label: "登录" },
                  { value: "register", label: "注册" },
                ]}
              />
            </Inset>
          )}

          <Section
            footer={
              error ? (
                <span className="text-ios-red">{error}</span>
              ) : mode === "register" ? (
                "用户名 3–20 位字母、数字或下划线，密码至少 8 位。不需要手机号或邮箱"
              ) : registrationOpen ? (
                "登录后，邮箱列表会在你的所有设备间同步"
              ) : (
                "管理员已关闭注册，只能登录已有账号"
              )
            }
          >
            <div ref={formRef}>
              <TextField
                label="用户名"
                placeholder={mode === "register" ? "3–20 位" : "用户名"}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-invalid={!!error}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
              <div className="ml-(--row-pad-x) h-(--hairline) bg-separator" />
              <PasswordField
                label="密码"
                placeholder={mode === "register" ? "至少 8 位" : "密码"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                enterKeyHint={mode === "register" ? "next" : "go"}
                aria-invalid={!!error}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div
                data-open={registering || undefined}
                inert={!registering}
                className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-(--spring-smooth-dur) ease-(--spring-smooth) data-open:grid-rows-[1fr] data-open:opacity-100 reduced:transition-none"
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="ml-(--row-pad-x) h-(--hairline) bg-separator" />
                  <PasswordField
                    label="确认密码"
                    placeholder="再输入一次"
                    autoComplete="new-password"
                    enterKeyHint="go"
                    aria-invalid={!!error}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Button type="submit" variant="prominent" size="large" fullWidth haptic loading={pending}>
            {mode === "login" ? "登录" : "注册并登录"}
          </Button>

          <p className="px-(--section-header-inset) type-footnote text-label-2">
            账号只用于同步和保护你的邮箱。登录后新建或加入账号的邮箱，只有你能查看；不登录也可以照常使用。
          </p>
        </List>
      </div>
    </form>
  );
}
