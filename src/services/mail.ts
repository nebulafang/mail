"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDebounceValue, useLocalStorage } from "usehooks-ts";
import { MAX_SAVED_MAILBOXES, type ExpiryUpdate } from "@/lib/config";
import type { CreateMailboxInput } from "@/lib/rules";
import { can, type AccessRole } from "@/lib/share-rules";
import { toast } from "@/presentation/api";
import { POLL, pollWhileLive } from "./live-state";
import { scheduleUndoableDelete, withoutPendingDeletes } from "./undo";
import type { MailboxSharing } from "@/lib/share-status";

type LatestMessage = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  code: string | null;
  seen: boolean;
  receivedAt: string;
};

export type MailboxItem = {
  id: string;
  address: string;
  expiresAt: string;
  createdAt: string;
  total: number;
  unread: number;
  owned?: boolean;
  shared?: boolean;
  note?: string | null;
  shareToken?: string | null;
  shareExpiresAt?: string | null;
  shareLocked?: boolean;
  sharing?: MailboxSharing | null;
  role?: AccessRole;
  sharedBy?: string | null;
  latest?: LatestMessage | null;
};

export type MessageItem = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  preview: string;
  code: string | null;
  seen: boolean;
  receivedAt: string;
};

export type MessageListItem = MessageItem & { toAddress?: string };

export type MessageDetail = MessageItem & {
  mailboxId: string;
  text: string | null;
  html: string | null;
  size: number;
  headers?: { key: string; value: string }[] | null;
  attachments: { id: string; filename: string; mimeType: string; size: number; inline: boolean; saved: boolean }[];
};

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    throw new RequestError(body.error ?? `请求失败（${res.status}）`, res.status, body);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const enc = encodeURIComponent;

const ACCOUNT_KEY = ["auth", "session"] as const;

export const mailKeys = {
  config: ["config"] as const,
  mailboxes: ["mailboxes"] as const,
  mailbox: (address: string) => ["mailbox", address] as const,
  messages: (address: string) => ["mailbox", address, "messages"] as const,
  message: (id: string) => ["message", id] as const,
  shared: (token: string) => ["shared", token] as const,
  sharedMessage: (token: string, id: string) => ["shared", token, id] as const,
};

export function useSavedMailboxes() {
  const [addresses, setAddresses] = useLocalStorage<string[]>("saved-mailboxes", [], {
    initializeWithValue: false,
  });

  const add = useCallback(
    (address: string) =>
      setAddresses((list) => [address, ...list.filter((a) => a !== address)].slice(0, MAX_SAVED_MAILBOXES)),
    [setAddresses],
  );
  const remove = useCallback(
    (address: string) => setAddresses((list) => list.filter((a) => a !== address)),
    [setAddresses],
  );
  const retain = useCallback(
    (alive: string[]) =>
      setAddresses((list) => (list.every((a) => alive.includes(a)) ? list : list.filter((a) => alive.includes(a)))),
    [setAddresses],
  );

  return { addresses, add, remove, retain, isFull: addresses.length >= MAX_SAVED_MAILBOXES };
}

type LocalNotes = Record<string, string>;

export function useLocalNotes() {
  const [notes, setNotes] = useLocalStorage<LocalNotes>("mailbox-notes", {}, { initializeWithValue: false });
  const setNote = useCallback(
    (address: string, note: string) =>
      setNotes((all) => {
        const next = { ...all };
        if (note) next[address] = note;
        else delete next[address];
        return next;
      }),
    [setNotes],
  );
  return { notes, setNote };
}

export function useMailboxNote(mailbox: Pick<MailboxItem, "address" | "role" | "note"> | undefined) {
  const { notes, setNote } = useLocalNotes();
  const update = useUpdateMailbox(mailbox?.address ?? "");
  const synced = !!mailbox && can(mailbox.role ?? null, "note");
  const note = mailbox ? (synced ? (mailbox.note ?? "") : (notes[mailbox.address] ?? mailbox.note ?? "")) : "";
  const save = useCallback(
    async (next: string) => {
      if (!mailbox) return;
      const value = next.trim();
      if (synced) await update.mutateAsync({ note: value });
      else setNote(mailbox.address, value);
    },
    [mailbox, synced, update, setNote],
  );
  return { note, save, synced };
}

export function useConfig() {
  return useQuery({
    queryKey: mailKeys.config,
    queryFn: () => request<{ domains: string[]; contact?: string }>("/api/config"),
    staleTime: Infinity,
  });
}

export function useMailboxes(addresses: string[], account: string | null = null) {
  return useQuery({
    queryKey: [...mailKeys.mailboxes, addresses, account],
    queryFn: () =>
      request<{ mailboxes: MailboxItem[] }>(`/api/mailboxes?${addresses.map((a) => `address=${enc(a)}`).join("&")}`).then(
        (r) => r.mailboxes,
      ),
    enabled: addresses.length > 0 || !!account,
    refetchInterval: pollWhileLive(POLL.mailboxesLive, POLL.mailboxesFallback),
  });
}

export function useMailbox(address: string) {
  return useQuery({
    queryKey: mailKeys.mailbox(address),
    queryFn: () => request<{ mailbox: MailboxItem }>(`/api/mailboxes/${enc(address)}`).then((r) => r.mailbox),
    retry: false,
  });
}

const MESSAGE_PAGE = 50;
const MESSAGE_PAGE_MAX = 200;
const messageWindows = new Map<string, { limit: number; hasMore: boolean }>();

export function useMessages(address: string) {
  const query = useQuery({
    queryKey: mailKeys.messages(address),
    queryFn: async () => {
      const limit = messageWindows.get(address)?.limit ?? MESSAGE_PAGE;
      const r = await request<{ messages: MessageItem[]; hasMore?: boolean }>(`/api/mailboxes/${enc(address)}/messages?limit=${limit}`);
      messageWindows.set(address, { limit, hasMore: !!r.hasMore });
      return withoutPendingDeletes(r.messages);
    },
    refetchInterval: pollWhileLive(POLL.messagesLive, POLL.messagesFallback),
    retry: false,
  });
  const { refetch } = query;
  const loadMore = useCallback(() => {
    const current = messageWindows.get(address);
    if (!current?.hasMore || current.limit >= MESSAGE_PAGE_MAX) return;
    messageWindows.set(address, { limit: Math.min(MESSAGE_PAGE_MAX, current.limit + MESSAGE_PAGE), hasMore: false });
    void refetch();
  }, [address, refetch]);
  return { ...query, loadMore };
}

export type AddressStatus = "free" | "shared" | "taken";

export function useAddressAvailability(address: string | undefined) {
  const [debounced] = useDebounceValue(address, 300);
  const query = useQuery({
    queryKey: ["availability", debounced],
    queryFn: () =>
      request<{ status: AddressStatus }>(`/api/availability?address=${enc(debounced!)}`).then((r) => r.status),
    enabled: !!debounced,
    staleTime: 10_000,
    retry: false,
  });
  const settled = !!address && address === debounced && !query.isFetching;
  return { pending: !!address && !settled, status: settled ? query.data : undefined };
}

export const messageQuery = (id: string) => ({
  queryKey: mailKeys.message(id),
  queryFn: () => request<{ message: MessageDetail }>(`/api/messages/${id}`).then((r) => r.message),
  staleTime: 30_000,
  retry: false,
});

export function useMessage(id: string) {
  return useQuery(messageQuery(id));
}

export function useOpenMailbox() {
  return useMutation({
    mutationFn: (address: string) =>
      request<{ mailbox: MailboxItem }>(`/api/mailboxes/${enc(address)}`).then((r) => r.mailbox),
  });
}

export function useCreateMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMailboxInput) =>
      request<{ mailbox: MailboxItem }>("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify(input),
      }).then(
        (r) => r.mailbox,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
    },
  });
}

export function useUpdateMailbox(address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { expiry?: ExpiryUpdate; note?: string }) =>
      request<{ mailbox: MailboxItem }>(`/api/mailboxes/${enc(address)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.mailbox(address), exact: true });
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
    },
  });
}

export function useDeleteMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => request(`/api/mailboxes/${enc(address)}`, { method: "DELETE" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
    },
  });
}

export function useUndoableDeleteMessage(address: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => {
      const key = mailKeys.messages(address);
      const list = queryClient.getQueryData<MessageItem[]>(key) ?? [];
      const index = list.findIndex((m) => m.id === id);
      const removed = index >= 0 ? list[index] : undefined;

      const restore = () =>
        queryClient.setQueryData<MessageItem[]>(key, (old) => {
          if (!old || !removed || old.some((m) => m.id === id)) return old;
          const next = [...old];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });

      queryClient.setQueryData<MessageItem[]>(key, (old) => old?.filter((m) => m.id !== id));
      scheduleUndoableDelete({
        id,
        title: "邮件已删除",
        undo: restore,
        commit: async () => {
          try {
            await request(`/api/messages/${id}`, { method: "DELETE" });
            queryClient.setQueryData<MessageItem[]>(key, (old) => old?.filter((m) => m.id !== id));
            queryClient.removeQueries({ queryKey: mailKeys.message(id) });
          } catch (e) {
            restore();
            toast.error((e as Error).message);
          } finally {
            queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
          }
        },
      });
    },
    [address, queryClient],
  );
}

export function useMarkSeen(address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seen }: { id: string; seen: boolean }) =>
      request(`/api/messages/${id}`, { method: "PATCH", body: JSON.stringify({ seen }) }),
    onMutate: async ({ id, seen }) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.messages(address) });
      await queryClient.cancelQueries({ queryKey: mailKeys.message(id) });
      const prev =
        queryClient.getQueryData<MessageItem[]>(mailKeys.messages(address))?.find((m) => m.id === id)?.seen ??
        queryClient.getQueryData<MessageDetail>(mailKeys.message(id))?.seen;
      queryClient.setQueryData<MessageItem[]>(mailKeys.messages(address), (old) =>
        old?.map((m) => (m.id === id ? { ...m, seen } : m)),
      );
      queryClient.setQueryData<MessageDetail>(mailKeys.message(id), (old) => old && { ...old, seen });
      queryClient.setQueriesData<MailboxItem[]>({ queryKey: mailKeys.mailboxes }, (old) =>
        old?.map((b) =>
          b.address === address && prev !== undefined && prev !== seen
            ? { ...b, unread: Math.max(0, b.unread + (seen ? -1 : 1)) }
            : b,
        ),
      );
    },
    onError: (_error, { id, seen }) => {
      queryClient.setQueryData<MessageItem[]>(mailKeys.messages(address), (old) =>
        old?.map((m) => (m.id === id ? { ...m, seen: !seen } : m)),
      );
      queryClient.setQueryData<MessageDetail>(mailKeys.message(id), (old) => old && { ...old, seen: !seen });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.messages(address) });
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
    },
  });
}

export function useClearMessages(address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request(`/api/mailboxes/${enc(address)}/messages`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.messages(address) });
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
    },
  });
}

export type ShareLinkInfo = { shareToken: string; shareExpiresAt: string | null };

export function useShareLink(address: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: mailKeys.mailbox(address), exact: true });
    queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
  };
  return {
    create: useMutation({
      mutationFn: (expiresAt: string | null) =>
        request<ShareLinkInfo>(`/api/mailboxes/${enc(address)}/share`, { method: "POST", body: JSON.stringify({ expiresAt }) }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: (expiresAt: string | null) =>
        request<ShareLinkInfo>(`/api/mailboxes/${enc(address)}/share`, { method: "PATCH", body: JSON.stringify({ expiresAt }) }),
      onSuccess,
    }),
    revoke: useMutation({
      mutationFn: () => request(`/api/mailboxes/${enc(address)}/share`, { method: "DELETE" }),
      onSuccess,
    }),
  };
}

export type SharedInbox = { mailbox: { address: string; expiresAt: string; linkExpiresAt: string | null }; messages: MessageItem[] };

export function useSharedInbox(token: string) {
  return useQuery({
    queryKey: mailKeys.shared(token),
    queryFn: () => request<SharedInbox>(`/api/share/${enc(token)}`),
    refetchInterval: pollWhileLive(POLL.sharedLive, POLL.sharedFallback),
    retry: false,
  });
}

export function useSharedMessage(token: string, id: string) {
  return useQuery({
    queryKey: mailKeys.sharedMessage(token, id),
    queryFn: () =>
      request<{ message: MessageDetail }>(`/api/share/${enc(token)}/messages/${enc(id)}`).then((r) => r.message),
    retry: false,
  });
}
