"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./mail";

export type AccountUser = { username: string; mailboxes: number; permanent: number };
export type AccountProfile = AccountUser & { createdAt: string };
type AccountSession = { enabled: boolean; user: AccountUser | null; registration?: boolean };
type Credentials = { username: string; password: string };

export const authKeys = {
  session: ["auth", "session"] as const,
  profile: ["auth", "profile"] as const,
};

function useRefreshAfterAuth() {
  const queryClient = useQueryClient();
  return (user: AccountUser | null) => {
    queryClient.setQueryData<AccountSession>(authKeys.session, (old) => ({ enabled: old?.enabled ?? true, user }));
    if (!user) queryClient.invalidateQueries({ queryKey: authKeys.session });
    queryClient.removeQueries({ queryKey: authKeys.profile });
    queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    queryClient.invalidateQueries({ queryKey: ["mailbox"] });
    queryClient.removeQueries({ queryKey: ["message"] });
  };
}

export function useAccount() {
  return useQuery({
    queryKey: authKeys.session,
    queryFn: () => request<AccountSession>("/api/auth/session"),
    staleTime: 60_000,
  });
}

export function useRegister() {
  const refresh = useRefreshAfterAuth();
  return useMutation({
    mutationFn: (body: Credentials) =>
      request<{ user: AccountUser }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: ({ user }) => refresh(user),
  });
}

export function useLogin() {
  const refresh = useRefreshAfterAuth();
  return useMutation({
    mutationFn: (body: Credentials) =>
      request<{ user: AccountUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: ({ user }) => refresh(user),
  });
}

export function useLogout() {
  const refresh = useRefreshAfterAuth();
  return useMutation({
    mutationFn: () => request("/api/auth/session", { method: "DELETE" }),
    onSuccess: () => refresh(null),
  });
}

export function useClaimMailboxes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addresses: string[]) =>
      request<{ claimed: string[] }>("/api/auth/claim", {
        method: "POST",
        body: JSON.stringify({ addresses }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.session });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      queryClient.invalidateQueries({ queryKey: ["mailbox"] });
    },
  });
}

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: () => request<{ account: AccountProfile }>("/api/account").then((r) => r.account),
    enabled,
    staleTime: 30_000,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current: string; next: string }) =>
      request<{ revoked: number }>("/api/account/password", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useDeleteAccount() {
  const refresh = useRefreshAfterAuth();
  return useMutation({
    mutationFn: (password: string) => request("/api/account", { method: "DELETE", body: JSON.stringify({ password }) }),
    onSuccess: () => refresh(null),
  });
}
