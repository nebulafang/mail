"use client";

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ChartColumn, Inbox, LogOut, Mails, Radar, SearchX, ShieldAlert, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import { Picker, Segmented } from "@/components/form";
import { List, Row, Section, SwipeActions } from "@/components/list";
import { MessageList, MessagesSkeleton } from "@/components/message-list";
import { MessageDetailScreen, type MessageViewModel } from "@/components/message-view";
import { PasswordField } from "@/components/password-field";
import { SheetHeader, useSheet } from "@/components/presentation/sheet";
import { Screen } from "@/components/screen";
import { ContentUnavailable, ErrorState, ListSkeleton, LoadingState } from "@/components/states";
import { ActivityIndicator, Avatar, Button, IconTile, TagBadge } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { useShake } from "@/hooks/use-shake";
import { isPermanent } from "@/lib/config";
import { formatBytes, formatFullTime, formatRelative, formatRemaining } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/navigation/context";
import type { RouteTarget, ScreenProps } from "@/navigation/types";
import { present, toast, toastError } from "@/presentation/api";
import {
  adminKeys,
  adminMessageQuery,
  useAdminLogin,
  useAdminLogout,
  useAdminMessage,
  useAdminMessages,
  useAdminSession,
  useAdminSettings,
  useAdminStats,
  useAdminUser,
  useAdminUserActions,
  useAdminUsers,
  useUndoableDeleteAdminMessage,
  useUpdateAdminSettings,
  type AdminMailScope,
  type AdminMessageItem,
  type AdminUserSession,
  type AdminUserStatus,
} from "@/services/admin";
import { useConfig } from "@/services/mail";

export function presentAdminLogin(onSuccess?: () => void) {
  present.sheet({ title: "管理员登录", content: <AdminLoginSheet onSuccess={onSuccess} />, detents: ["fit"] });
}

function AdminLoginSheet({ onSuccess }: { onSuccess?: () => void }) {
  const sheet = useSheet();
  const { content } = useSheetEntrance();
  const login = useAdminLogin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const { ref: shakeRef, shake } = useShake<HTMLDivElement>();

  const reject = (message: string) => {
    setError(message);
    shake();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return reject("请输入管理员密码");
    setError(undefined);
    try {
      await login.mutateAsync(password);
      haptic("success");
      toast.success("已登录管理后台");
      sheet.dismiss();
      onSuccess?.();
    } catch (err) {
      reject((err as Error).message);
    }
  };

  return (
    <>
      <SheetHeader title="管理员登录" />
      <div ref={content} className="pt-1 pb-2">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="glyph-well symbol-bounce size-16 [--well-bg:color-mix(in_oklab,var(--ios-indigo)_14%,transparent)] [--well-ink:var(--ios-indigo)] [&_svg]:size-8">
            <ShieldCheck strokeWidth={2} />
          </span>
          <p className="max-w-64 type-subheadline text-label-2">输入 ADMIN_PASSWORD 里设置的密码</p>
        </div>
        <form onSubmit={submit} noValidate>
          <List>
            <Section footer={error ? <span className="text-ios-red">{error}</span> : "登录状态保存在加密 Cookie 里，7 天后过期"}>
              <div ref={shakeRef}>
                <PasswordField
                  placeholder="管理员密码"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  aria-label="管理员密码"
                  aria-invalid={!!error}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(undefined);
                  }}
                />
              </div>
            </Section>
            <Button type="submit" variant="prominent" size="large" fullWidth haptic loading={login.isPending}>
              登录
            </Button>
          </List>
        </form>
      </div>
    </>
  );
}

function AdminGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { data: status, isLoading, error, refetch } = useAdminSession();
  if (isLoading) {
    return (
      <Screen title={title}>
        <LoadingState />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen title={title}>
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </Screen>
    );
  }
  if (!status?.enabled) {
    return (
      <Screen title={title}>
        <ContentUnavailable
          tone="orange"
          icon={<ShieldAlert />}
          title="管理后台未启用"
          description="在 Cloudflare 后台给 Worker 添加名为 ADMIN_PASSWORD 的密钥（Secret）后即可使用"
        />
      </Screen>
    );
  }
  if (!status.admin) {
    return (
      <Screen title={title}>
        <ContentUnavailable
          tone="indigo"
          icon={<ShieldCheck />}
          title="管理后台"
          description="登录后可以管理用户、查看用户邮件和 Catch-all 邮件"
          actions={
            <Button variant="prominent" size="large" haptic onClick={() => presentAdminLogin()}>
              登录管理员
            </Button>
          }
        />
      </Screen>
    );
  }
  return children;
}

export function AdminScreen() {
  return (
    <AdminGate title="管理">
      <AdminHome />
    </AdminGate>
  );
}

function AdminHome() {
  const logout = useAdminLogout();
  const { data: config } = useConfig();
  const domains = config?.domains ?? [];
  const { data: settings } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();

  async function setRegistration(open: boolean) {
    if (!open) {
      const ok = await present.confirm({ title: "关闭注册？", message: "新用户将无法注册，已有账号不受影响", confirmLabel: "关闭注册" });
      if (!ok) return;
    }
    updateSettings.mutate(
      { registrationOpen: open },
      { onSuccess: () => toast.success(open ? "已开放注册" : "已关闭注册"), onError: toastError },
    );
  }

  async function signOut() {
    const ok = await present.confirm({ title: "退出管理后台？", confirmLabel: "退出" });
    if (!ok) return;
    logout.mutate(undefined, { onSuccess: () => toast.success("已退出管理后台"), onError: toastError });
  }

  return (
    <Screen title="管理">
      <List>
        <Section>
          <Row
            icon={<IconTile color="green"><ChartColumn /></IconTile>}
            title="统计"
            subtitle="用户、邮箱、邮件数量和存储用量"
            multiline
            to={{ name: "adminStats" }}
          />
          <Row
            icon={<IconTile color="blue"><UsersRound /></IconTile>}
            title="用户"
            subtitle="停用、删除用户，查看用户的全部邮件"
            multiline
            to={{ name: "adminUsers" }}
          />
          <Row
            icon={<IconTile color="orange"><Radar /></IconTile>}
            title="Catch-all 邮件"
            subtitle="发到没人创建过的地址的邮件"
            multiline
            to={{ name: "adminCatchAll" }}
          />
        </Section>
        <Section footer="关闭后新用户无法注册，已有账号照常登录，未登录也能照常创建临时邮箱">
          <Row
            icon={<IconTile color="indigo"><UserPlus /></IconTile>}
            title="开放注册"
            detail={
              settings ? (
                <Picker
                  label="开放注册"
                  value={settings.registrationOpen ? "open" : "closed"}
                  options={REGISTRATION_OPTIONS}
                  onChange={(next) => setRegistration(next === "open")}
                />
              ) : (
                <ActivityIndicator />
              )
            }
          />
        </Section>
        <Section
          footer={`没人创建的地址收到的邮件只在这里能看到，最后一封 7 天后自动清理；有人创建这个地址时旧信会被清掉${
            domains.length ? `。收信域名：${domains.map((d) => `*@${d}`).join("、")}` : ""
          }`}
        >
          <Row icon={<IconTile color="gray"><LogOut /></IconTile>} title="退出管理后台" destructive disabled={logout.isPending} onPress={signOut} />
        </Section>
      </List>
    </Screen>
  );
}

const REGISTRATION_OPTIONS: { value: "open" | "closed"; label: string }[] = [
  { value: "open", label: "开放" },
  { value: "closed", label: "关闭" },
];

const count = (n: number) => n.toLocaleString("zh-CN");

const STORAGE_LEVEL = {
  normal: { label: "正常", color: "green" },
  soft: { label: "接近上限", color: "orange" },
  hard: { label: "已达上限", color: "red" },
} as const;

export function AdminStatsScreen() {
  return (
    <AdminGate title="统计">
      <AdminStats />
    </AdminGate>
  );
}

function AdminStats() {
  const { data: stats, isLoading, error, refetch, recount } = useAdminStats();

  if (isLoading) {
    return (
      <Screen title="统计" titleDisplay="inline">
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (error || !stats) {
    return (
      <Screen title="统计" titleDisplay="inline">
        <ErrorState message={error?.message ?? "统计加载失败"} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const { users, mailboxes, messages, storage } = stats;
  const level = STORAGE_LEVEL[storage.level];

  return (
    <Screen title="统计" titleDisplay="inline" refreshable={recount}>
      <List>
        <Section header="用户">
          <Row title="全部用户" detail={count(users.total)} />
          <Row title="7 天内活跃" detail={count(users.active)} />
          <Row title="24 小时内注册" detail={count(users.recent)} />
          <Row title="已停用" detail={count(users.disabled)} />
        </Section>

        <Section header="邮箱">
          <Row title="全部邮箱" detail={count(mailboxes.total)} />
          <Row title="账号邮箱" detail={count(mailboxes.owned)} />
          <Row title="永久邮箱" detail={count(mailboxes.permanent)} />
          <Row title="Catch-all 邮箱" detail={count(mailboxes.catchAll)} />
        </Section>

        <Section header="邮件" footer={`过期邮箱的邮件会被自动清理，这里只统计还保存着的邮件。计数${formatRelative(stats.countedAt)}更新，下拉可重新统计`}>
          <Row title="全部邮件" detail={count(messages.total)} />
          <Row title="24 小时内收到" detail={count(messages.recent)} />
        </Section>

        <Section
          header="存储"
          footer={`用量达到 ${formatBytes(storage.softLimit)} 时收信开始少存正文，达到 ${formatBytes(storage.hardLimit)} 时定时任务会自动回收旧数据`}
        >
          <Row title="数据库大小" detail={formatBytes(storage.size)} />
          <Row title="状态" detail={<TagBadge color={level.color}>{level.label}</TagBadge>} />
        </Section>
      </List>
    </Screen>
  );
}

const STATUS_OPTIONS: { value: AdminUserStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "正常" },
  { value: "disabled", label: "已停用" },
];

export function AdminUsersScreen() {
  return (
    <AdminGate title="用户">
      <AdminUsers />
    </AdminGate>
  );
}

function AdminUsers() {
  const [search, setSearch] = useState("");
  const [q] = useDebounceValue(search.trim().toLowerCase(), 300);
  const [status, setStatus] = useState<AdminUserStatus>("all");
  const { data, isLoading, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage, isPlaceholderData } = useAdminUsers(q, status);
  const users = data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <Screen
      title="用户"
      search={{ value: search, onChange: setSearch, placeholder: "搜索用户名" }}
      refreshable={() => refetch()}
      header={<Segmented label="状态" value={status} onChange={setStatus} options={STATUS_OPTIONS} />}
    >
      <List>
        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : !users.length ? (
          <ContentUnavailable icon={<UsersRound />} title={q || status !== "all" ? "没有匹配的用户" : "还没有注册用户"} />
        ) : (
          <Section
            header={hasNextPage ? `已加载 ${users.length} 位` : `共 ${users.length} 位`}
            className={cn("transition-opacity duration-(--dur-fade) ease-(--curve-out)", isPlaceholderData && "opacity-60")}
          >
            {users.map((u) => (
              <Row
                key={u.id}
                icon={<Avatar seed={`user:${u.username}`} text={u.username} />}
                title={
                  <span className="flex items-center gap-1.5">
                    <span className={cn("truncate", u.disabled && "text-label-2 line-through")}>{u.username}</span>
                    {u.disabled && <TagBadge color="red">停用</TagBadge>}
                  </span>
                }
                subtitle={`${u.mailboxes} 个邮箱 · ${u.lastSeenAt ? `${formatRelative(u.lastSeenAt)}活跃` : "从未登录"}`}
                to={{ name: "adminUser", params: { userId: u.id } }}
              />
            ))}
            {hasNextPage && (
              <Row
                title={isFetchingNextPage ? <ActivityIndicator /> : "加载更多"}
                tint
                disabled={isFetchingNextPage}
                onPress={() => fetchNextPage()}
              />
            )}
          </Section>
        )}
      </List>
    </Screen>
  );
}

export function AdminUserScreen(props: ScreenProps) {
  return (
    <AdminGate title="用户">
      <AdminUser {...props} />
    </AdminGate>
  );
}

function AdminUser({ params }: ScreenProps) {
  const id = params.userId;
  const nav = useNavigation();
  const { data: user, isLoading, error, refetch } = useAdminUser(id);
  const actions = useAdminUserActions(id);

  if (isLoading) {
    return (
      <Screen title="用户" titleDisplay="inline">
        <LoadingState />
      </Screen>
    );
  }
  if (error || !user) {
    return (
      <Screen title="用户" titleDisplay="inline">
        <ErrorState message={error?.message ?? "用户不存在"} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const totalMessages = user.mailboxes.reduce((sum, box) => sum + box.total, 0);

  async function toggleDisabled() {
    const disable = !user!.disabled;
    if (disable) {
      const choice = await present.actionSheet({
        title: `停用 ${user!.username}？`,
        message: "所有设备会立即退出，之后无法再登录；邮箱和邮件保留，恢复后可以继续使用",
        actions: [{ id: "ok", label: "停用账号", role: "destructive" }],
      });
      if (choice !== "ok") return;
    }
    actions.setDisabled.mutate(disable, {
      onSuccess: () => {
        toast.success(disable ? "账号已停用" : "账号已恢复");
        refetch();
      },
      onError: toastError,
    });
  }

  async function revokeSession(device: AdminUserSession) {
    const choice = await present.actionSheet({
      title: `让 ${user!.username} 的「${device.model ?? "未知设备"}」退出登录？`,
      message: "那台设备需要重新输入密码才能登录，账号不受影响",
      actions: [{ id: "ok", label: "退出这台设备", role: "destructive" }],
    });
    if (choice !== "ok") return;
    actions.revokeSession.mutate(device.id, {
      onSuccess: () => toast.success("已退出这台设备"),
      onError: toastError,
    });
  }

  async function removeUser() {
    const choice = await present.actionSheet({
      title: `删除 ${user!.username}？`,
      message: `账号和它的 ${user!.mailboxes.length} 个邮箱、${totalMessages} 封邮件都会被永久删除，无法恢复`,
      actions: [{ id: "ok", label: "永久删除用户", role: "destructive" }],
    });
    if (choice !== "ok") return;
    actions.remove.mutate(undefined, {
      onSuccess: () => {
        toast.success("用户已删除");
        nav.pop();
      },
      onError: toastError,
    });
  }

  return (
    <Screen title={user.username} titleDisplay="inline" refreshable={() => refetch()}>
      <List>
        <div className="on-scene flex flex-col items-center gap-2 pt-2 text-center">
          <Avatar seed={`user:${user.username}`} text={user.username} size={88} />
          <h2 className="flex items-center gap-2 type-title2 text-label">
            {user.username}
            {user.disabled && <TagBadge color="red">已停用</TagBadge>}
          </h2>
          <p className="type-footnote text-label-2">
            {formatFullTime(user.createdAt)} 注册 · {user.lastSeenAt ? `${formatRelative(user.lastSeenAt)}活跃` : "从未登录"} · {user.sessions.length} 台设备在线
          </p>
        </div>

        <Section>
          <Row
            icon={<IconTile color="blue"><Mails /></IconTile>}
            title="全部邮件"
            detail={`${totalMessages} 封`}
            disabled={!user.mailboxes.length}
            to={{ name: "adminUserMail", params: { userId: user.id } }}
          />
        </Section>

        <Section header={`邮箱 · ${user.mailboxes.length}`} footer={user.mailboxes.length ? "点按查看这个邮箱的邮件" : undefined}>
          {user.mailboxes.length ? (
            user.mailboxes.map((box) => (
              <Row
                key={box.id}
                title={<span className="font-mono">{box.address}</span>}
                subtitle={[box.note, `${box.total} 封`, isPermanent(box.expiresAt) ? "永久" : formatRemaining(box.expiresAt)].filter(Boolean).join(" · ")}
                to={{ name: "adminUserMailbox", params: { userId: user.id, address: box.address } }}
              />
            ))
          ) : (
            <Row title={<span className="text-label-2">没有邮箱</span>} />
          )}
        </Section>

        <Section header={`登录设备 · ${user.sessions.length}`} footer={user.sessions.length ? "左滑或点按可以让某台设备退出登录" : undefined}>
          {user.sessions.length ? (
            user.sessions.map((s) => (
              <SwipeActions key={s.id} trailing={[{ label: "退出", color: "red", icon: <LogOut />, onAction: () => revokeSession(s) }]}>
                <Row
                  title={s.model ?? "未知设备"}
                  subtitle={`${s.ip ?? "未知 IP"} · ${formatRelative(s.lastSeenAt)}活跃`}
                  disabled={actions.revokeSession.isPending}
                  onPress={() => revokeSession(s)}
                />
              </SwipeActions>
            ))
          ) : (
            <Row title={<span className="text-label-2">没有登录中的设备</span>} />
          )}
        </Section>

        <Section footer={user.disabled ? "恢复后用户可以重新登录" : "停用后用户的所有设备会立即退出，邮箱保留"}>
          <Row
            icon={<IconTile color={user.disabled ? "green" : "orange"}>{user.disabled ? <UserCheck /> : <UserX />}</IconTile>}
            title={user.disabled ? "恢复账号" : "停用账号"}
            disabled={actions.setDisabled.isPending}
            onPress={toggleDisabled}
          />
          <Row
            icon={<IconTile color="red"><Trash2 /></IconTile>}
            title="删除用户"
            destructive
            disabled={actions.remove.isPending}
            onPress={removeUser}
          />
        </Section>
      </List>
    </Screen>
  );
}

export function AdminMailScreen(props: ScreenProps) {
  return (
    <AdminGate title={props.params.userId ? "邮件" : "Catch-all 邮件"}>
      <AdminMail {...props} />
    </AdminGate>
  );
}

function AdminMail({ params }: ScreenProps) {
  const { userId, address } = params;
  const scope: AdminMailScope = userId ? { userId, address } : { catchAll: true };
  const { data: owner } = useAdminUser(userId ?? "");
  const title = !userId ? "Catch-all 邮件" : address ? address : owner ? `${owner.username} 的邮件` : "邮件";
  const [search, setSearch] = useState("");
  const [q] = useDebounceValue(search.trim().toLowerCase(), 300);
  const { data, isLoading, isPlaceholderData, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useAdminMessages(scope, q);
  const deleteOne = useUndoableDeleteAdminMessage();
  const messages = data?.pages.flatMap((p) => p.messages) ?? [];

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const targetFor = (msg: { id: string }): RouteTarget => ({ name: "adminMessage", params: { messageId: msg.id } });

  return (
    <Screen
      title={title}
      titleDisplay={address ? "inline" : "large"}
      search={{ value: search, onChange: setSearch, placeholder: "搜索收件地址、发件人、主题" }}
      refreshable={() => refetch()}
    >
      <List>
        {isLoading ? (
          <Section>
            <MessagesSkeleton />
          </Section>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : !messages.length ? (
          q ? (
            <ContentUnavailable icon={<SearchX />} title="没有匹配的邮件" description="换个关键词试试" />
          ) : (
            <ContentUnavailable
              icon={<Inbox />}
              title="还没有邮件"
              description={userId ? undefined : "发到没人创建过的地址的邮件会集中到这里"}
            />
          )
        ) : (
          <Section
            className={cn("transition-opacity duration-(--dur-fade) ease-(--curve-out)", isPlaceholderData && "opacity-60")}
            header={(q ? "搜索结果 · " : "") + (hasNextPage ? `已加载 ${messages.length} 封` : `共 ${messages.length} 封`)}
            footer="左滑删除，删除后用户那边也会同时消失"
          >
            <MessageList messages={messages} targetFor={targetFor} onDelete={deleteOne} onEndReached={loadMore} />
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <ActivityIndicator />
              </div>
            )}
          </Section>
        )}
      </List>
    </Screen>
  );
}

function useNeighbors(messageId: string) {
  const nav = useNavigation();
  const queryClient = useQueryClient();
  const list = queryClient
    .getQueriesData<InfiniteData<{ messages: AdminMessageItem[] }>>({ queryKey: adminKeys.messages })
    .map(([, data]) => data?.pages.flatMap((p) => p.messages) ?? [])
    .find((messages) => messages.some((m) => m.id === messageId));
  const index = list?.findIndex((m) => m.id === messageId) ?? -1;
  const prevId = index > 0 ? list?.[index - 1]?.id : undefined;
  const nextId = index >= 0 ? list?.[index + 1]?.id : undefined;
  useEffect(() => {
    for (const id of [prevId, nextId]) if (id) void queryClient.prefetchQuery(adminMessageQuery(id));
  }, [prevId, nextId, queryClient]);
  const go = (id: string) => nav.replace({ name: "adminMessage", params: { messageId: id } });
  return {
    goPrev: prevId ? () => go(prevId) : undefined,
    goNext: nextId ? () => go(nextId) : undefined,
    afterDelete: () => {
      const target = nextId ?? prevId;
      if (target) go(target);
      else nav.pop();
    },
  };
}

export function AdminMessageScreen(props: ScreenProps) {
  return (
    <AdminGate title="邮件">
      <AdminMessage {...props} />
    </AdminGate>
  );
}

function AdminMessage({ params }: ScreenProps) {
  const { messageId } = params;
  const { data: message, error } = useAdminMessage(messageId);
  const deleteMessage = useUndoableDeleteAdminMessage();
  const neighbors = useNeighbors(messageId);

  const model: MessageViewModel = {
    message,
    error,
    recipient: message?.toAddress,
    goPrev: neighbors.goPrev,
    goNext: neighbors.goNext,
    aside: message && (
      <Section>
          {message.catchAll ? (
            <Row icon={<IconTile color="orange"><Radar /></IconTile>} title="Catch-all" subtitle="没人创建过这个地址，只有管理员能看到" multiline />
          ) : message.ownerId ? (
            <Row
              icon={<Avatar seed={`user:${message.ownerName}`} text={message.ownerName ?? "?"} size={32} />}
              title={message.ownerName ?? "未知用户"}
              subtitle="邮箱所有者"
              to={{ name: "adminUser", params: { userId: message.ownerId } }}
            />
          ) : (
            <Row icon={<IconTile color="gray"><Inbox /></IconTile>} title="公共地址" subtitle="任何知道这个地址的人都能看到" />
          )}
      </Section>
    ),
    onDelete: () => {
      deleteMessage(messageId);
      neighbors.afterDelete();
    },
  };
  return <MessageDetailScreen model={model} />;
}
