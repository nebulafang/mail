"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "@/presentation/api";
import { request, type MessageDetail, type MessageListItem } from "./mail";
import { scheduleUndoableDelete, withoutPendingDeletes } from "./undo";

type AdminStatus = { enabled: boolean; admin: boolean };

export type AdminUserItem = {
  id: string;
  username: string;
  disabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  mailboxes: number;
};

export type AdminUserMailbox = { id: string; address: string; note: string | null; expiresAt: string; createdAt: string; total: number };

export type AdminUserSession = { id: string; ip: string | null; model: string | null; createdAt: string; lastSeenAt: string };

export type AdminUserDetail = Omit<AdminUserItem, "mailboxes"> & { sessions: AdminUserSession[]; mailboxes: AdminUserMailbox[] };

export type AdminMessageItem = MessageListItem & { toAddress: string };

export type AdminMessageDetail = MessageDetail & { toAddress: string; catchAll: boolean; ownerId: string | null; ownerName: string | null };

export type AdminMailScope = { userId?: string; address?: string; catchAll?: boolean };

export type AdminUserStatus = "all" | "active" | "disabled";

type MessagePage = { messages: AdminMessageItem[]; nextCursor: string | null };

export const adminKeys = {
  all: ["admin"] as const,
  session: ["admin", "session"] as const,
  stats: ["admin", "stats"] as const,
  settings: ["admin", "settings"] as const,
  users: ["admin", "users"] as const,
  userList: (q: string, status: AdminUserStatus) => ["admin", "users", "list", q, status] as const,
  user: (id: string) => ["admin", "users", "detail", id] as const,
  messages: ["admin", "messages"] as const,
  messageList: (scope: AdminMailScope, q: string) => ["admin", "messages", "list", scope, q] as const,
  message: (id: string) => ["admin", "message", id] as const,
};

const query = (entries: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(entries).filter((e): e is [string, string] => !!e[1]));

export function useAdminSession() {
  return useQuery({
    queryKey: adminKeys.session,
    queryFn: () => request<AdminStatus>("/api/admin/session"),
    staleTime: 5 * 60_000,
  });
}

export function useAdminLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => request<AdminStatus>("/api/admin/session", { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: (status) => queryClient.setQueryData(adminKeys.session, status),
  });
}

export function useAdminLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request("/api/admin/session", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: adminKeys.users });
      queryClient.removeQueries({ queryKey: adminKeys.messages });
      queryClient.setQueryData<AdminStatus>(adminKeys.session, { enabled: true, admin: false });
    },
  });
}

export type AdminStats = {
  users: { total: number; active: number; disabled: number; recent: number };
  mailboxes: { total: number; owned: number; permanent: number; catchAll: number };
  messages: { total: number; recent: number };
  countedAt: string;
  storage: { size: number; softLimit: number; hardLimit: number; level: "normal" | "soft" | "hard" };
};

export function useAdminStats() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => request<AdminStats>("/api/admin/stats"),
    staleTime: 60_000,
  });
  const recount = useCallback(
    async () => queryClient.setQueryData(adminKeys.stats, await request<AdminStats>("/api/admin/stats?fresh=1")),
    [queryClient],
  );
  return { ...query, recount };
}

export type AdminSettings = { registrationOpen: boolean };

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => request<AdminSettings>("/api/admin/settings"),
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AdminSettings) => request<AdminSettings>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (settings) => queryClient.setQueryData(adminKeys.settings, settings),
  });
}

export function useAdminUsers(q: string, status: AdminUserStatus) {
  return useInfiniteQuery({
    queryKey: adminKeys.userList(q, status),
    queryFn: ({ pageParam }) =>
      request<{ users: AdminUserItem[]; nextCursor: string | null }>(
        `/api/admin/users?${query({ cursor: pageParam, q, status: status === "all" ? undefined : status })}`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => request<{ user: AdminUserDetail }>(`/api/admin/users/${id}`).then((r) => r.user),
    enabled: !!id,
    retry: false,
  });
}

export function useAdminUserActions(id: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.users });
  return {
    setDisabled: useMutation({
      mutationFn: (disabled: boolean) => request(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ disabled }) }),
      onSettled: refresh,
    }),
    revokeSession: useMutation({
      mutationFn: (sid: string) => request(`/api/admin/users/${id}/sessions/${encodeURIComponent(sid)}`, { method: "DELETE" }),
      onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.user(id) }),
    }),
    remove: useMutation({
      mutationFn: () => request(`/api/admin/users/${id}`, { method: "DELETE" }),
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: adminKeys.user(id) });
        queryClient.invalidateQueries({ queryKey: adminKeys.messages });
      },
      onSettled: refresh,
    }),
  };
}

export function useAdminMessages(scope: AdminMailScope, q: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.messageList(scope, q),
    queryFn: ({ pageParam }) =>
      request<MessagePage>(
        `/api/admin/messages?${query({
          cursor: pageParam,
          q,
          userId: scope.userId,
          address: scope.address,
          scope: scope.catchAll ? "catchAll" : undefined,
        })}`,
      ).then((page) => ({ ...page, messages: withoutPendingDeletes(page.messages) })),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export const adminMessageQuery = (id: string) => ({
  queryKey: adminKeys.message(id),
  queryFn: () => request<{ message: AdminMessageDetail }>(`/api/admin/messages/${id}`).then((r) => r.message),
  staleTime: 30_000,
  retry: false,
});

export function useAdminMessage(id: string) {
  return useQuery(adminMessageQuery(id));
}

export function useUndoableDeleteAdminMessage() {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => {
      const hide = () =>
        queryClient.setQueriesData<InfiniteData<MessagePage>>({ queryKey: adminKeys.messages }, (old) =>
          old && { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== id) })) },
        );
      const restore = () => queryClient.invalidateQueries({ queryKey: adminKeys.messages });

      void queryClient.cancelQueries({ queryKey: adminKeys.messages }).then(hide);
      scheduleUndoableDelete({
        id,
        title: "邮件已删除",
        undo: restore,
        commit: async () => {
          try {
            await request(`/api/admin/messages/${id}`, { method: "DELETE" });
            hide();
            queryClient.removeQueries({ queryKey: adminKeys.message(id) });
          } catch (e) {
            restore();
            toast.error((e as Error).message);
          } finally {
            queryClient.invalidateQueries({ queryKey: adminKeys.users });
          }
        },
      });
    },
    [queryClient],
  );
}
