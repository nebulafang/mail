"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ShareAction, ShareEventDetail } from "@/db/app-schema";
import type { AccessRole, ShareRole, ShareTargetProblem } from "@/lib/share-rules";
import { toast } from "@/presentation/api";
import { POLL, pollWhileLive } from "./live-state";
import { mailKeys, request } from "./mail";
import { scheduleUndoableDelete } from "./undo";

export type Member = {
  id: string;
  username: string;
  role: ShareRole;
  status: "pending" | "active";
  expiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  invitedBy: string | null;
  self: boolean;
};

export type MembersResponse = { role: AccessRole; owner: string | null; limit: number; members: Member[] };

export type Invitation = {
  id: string;
  address: string;
  role: ShareRole;
  expiresAt: string | null;
  createdAt: string;
  owner: string;
  invitedBy: string | null;
};

export type ShareEvent = {
  id: number;
  action: ShareAction;
  actor: string | null;
  target: string | null;
  detail: ShareEventDetail | null;
  at: string;
};

export type LookupResult = { username: string; problem: ShareTargetProblem | null; message: string | null };

export type GrantResult = { username: string; ok: true; memberId: string } | { username: string; ok: false; error: string };

const enc = encodeURIComponent;

export const shareKeys = {
  all: ["share"] as const,
  members: (address: string) => ["share", "members", address] as const,
  activity: (address: string) => ["share", "activity", address] as const,
  invitations: ["share", "invitations"] as const,
};

export function useMembers(address: string, enabled = true) {
  return useQuery({
    queryKey: shareKeys.members(address),
    queryFn: () => request<MembersResponse>(`/api/mailboxes/${enc(address)}/members`),
    enabled,
    retry: false,
  });
}

export function useActivity(address: string, enabled: boolean) {
  return useQuery({
    queryKey: shareKeys.activity(address),
    queryFn: () => request<{ events: ShareEvent[] }>(`/api/mailboxes/${enc(address)}/activity`).then((r) => r.events),
    enabled,
    retry: false,
  });
}

export function useInvitations(enabled: boolean) {
  return useQuery({
    queryKey: shareKeys.invitations,
    queryFn: () => request<{ invitations: Invitation[] }>("/api/invitations").then((r) => r.invitations),
    enabled,
    refetchInterval: pollWhileLive(POLL.invitationsLive, POLL.invitationsFallback),
  });
}

export const lookupUser = (address: string, username: string) =>
  request<LookupResult>(`/api/mailboxes/${enc(address)}/members/lookup?username=${enc(username)}`);

function useRefreshShare(address: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: shareKeys.members(address) });
    queryClient.invalidateQueries({ queryKey: shareKeys.activity(address) });
    queryClient.invalidateQueries({ queryKey: mailKeys.mailbox(address), exact: true });
    queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
  }, [address, queryClient]);
}

export function useGrantMembers(address: string) {
  const refresh = useRefreshShare(address);
  return useMutation({
    mutationFn: (input: { usernames: string[]; role: ShareRole; expiresAt: string | null }) =>
      request<{ results: GrantResult[] }>(`/api/mailboxes/${enc(address)}/members`, { method: "POST", body: JSON.stringify(input) }).then(
        (r) => r.results,
      ),
    onSettled: refresh,
  });
}

export function useRevokeMembers(address: string) {
  const refresh = useRefreshShare(address);
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => request(`/api/mailboxes/${enc(address)}/members/${enc(id)}`, { method: "DELETE" }))),
    onSettled: refresh,
  });
}

export function useUpdateMember(address: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshShare(address);
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: ShareRole; expiresAt?: string | null }) =>
      request<{ member: Member }>(`/api/mailboxes/${enc(address)}/members/${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).then((r) => r.member),
    onSuccess: (member) =>
      queryClient.setQueryData<MembersResponse>(shareKeys.members(address), (old) =>
        old && { ...old, members: old.members.map((m) => (m.id === member.id ? member : m)) },
      ),
    onSettled: refresh,
  });
}

export function useUndoableRemoveMember(address: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshShare(address);
  return useCallback(
    (member: Member) => {
      const key = shareKeys.members(address);
      const snapshot = queryClient.getQueryData<MembersResponse>(key);
      const restore = () => queryClient.setQueryData<MembersResponse>(key, (old) => (old && snapshot ? { ...old, members: snapshot.members } : old));
      queryClient.setQueryData<MembersResponse>(key, (old) => old && { ...old, members: old.members.filter((m) => m.id !== member.id) });
      scheduleUndoableDelete({
        id: `member:${member.id}`,
        title: `已移除 ${member.username}`,
        undo: restore,
        commit: async () => {
          try {
            await request(`/api/mailboxes/${enc(address)}/members/${enc(member.id)}`, { method: "DELETE" });
          } catch (e) {
            restore();
            toast.error((e as Error).message);
          } finally {
            refresh();
          }
        },
      });
    },
    [address, queryClient, refresh],
  );
}

export function useLeaveMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => request(`/api/mailboxes/${enc(address)}/membership`, { method: "DELETE" }),
    onSettled: (_data, _error, address) => {
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
      queryClient.removeQueries({ queryKey: mailKeys.mailbox(address) });
    },
  });
}

export function useReplyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      request<{ address: string; role: ShareRole } | undefined>(`/api/invitations/${enc(id)}`, {
        method: "POST",
        body: JSON.stringify({ accept }),
      }),
    onMutate: ({ id }) =>
      queryClient.setQueryData<Invitation[]>(shareKeys.invitations, (old) => old?.filter((invite) => invite.id !== id)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shareKeys.invitations });
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
    },
  });
}
