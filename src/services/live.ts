"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { MAX_SAVED_MAILBOXES } from "@/lib/config";
import { SHARE_CHANNEL, useLiveState, watchAddress, watchShare } from "./live-state";
import { withNewMail } from "@/lib/new-mail";
import { mailKeys, type MailboxItem, type MessageItem, type SharedInbox } from "./mail";
import { shareKeys } from "./share";

const LIVE_PATH = "/api/live";
const HEARTBEAT_MS = 50_000;
const MAX_BACKOFF_MS = 60_000;
const CATCH_UP_KEYS = [["mailbox"], ["mailboxes"], ["shared"]];

type MailEvent = { type?: undefined; address: string; message: MessageItem };
type ShareLiveEvent = { type: "share"; address: string };
type LiveEvent = MailEvent | ShareLiveEvent;

const sameAddress = (key: QueryKey, address: string) =>
  typeof key[1] === "string" && key[1].toLowerCase() === address;

export function useWatchAddress(address: string | undefined) {
  useEffect(() => (address ? watchAddress(address) : undefined), [address]);
}

export function useWatchShare(token: string | undefined) {
  useEffect(() => (token ? watchShare(token) : undefined), [token]);
}

export function useLiveMail(saved: string[], account: string | null = null) {
  const queryClient = useQueryClient();
  const watched = useLiveState((s) => s.watched);
  const channel = [...new Set([...Object.keys(watched).sort(), ...saved.map((a) => a.toLowerCase()).sort()])]
    .slice(0, MAX_SAVED_MAILBOXES)
    .join(",");

  useEffect(() => {
    if (!channel && !account) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let opened = false;
    let closed = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const refreshShare = (address: string) => {
      queryClient.invalidateQueries({ queryKey: shareKeys.all });
      queryClient.invalidateQueries({ queryKey: mailKeys.mailboxes });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "mailbox" && sameAddress(q.queryKey, address) });
    };

    const deliver = (event: LiveEvent) => {
      if (event.type === "share") return refreshShare(event.address.toLowerCase());
      const { address, message } = event;
      queryClient.setQueriesData<MessageItem[]>(
        { predicate: (q) => q.queryKey[0] === "mailbox" && q.queryKey[2] === "messages" && sameAddress(q.queryKey, address) },
        (old) => (old && !old.some((m) => m.id === message.id) ? [message, ...old] : old),
      );
      queryClient.setQueriesData<SharedInbox>(
        { predicate: (q) => q.queryKey[0] === "shared" && q.queryKey.length === 2 },
        (old) =>
          old && old.mailbox.address.toLowerCase() === address.toLowerCase() && !old.messages.some((m) => m.id === message.id)
            ? { ...old, messages: [message, ...old.messages] }
            : old,
      );
      for (const [key, list] of queryClient.getQueriesData<MailboxItem[]>({ queryKey: mailKeys.mailboxes })) {
        if (!list) continue;
        const next = withNewMail(list, address.toLowerCase(), message);
        if (next) queryClient.setQueryData(key, next);
        else queryClient.invalidateQueries({ queryKey: key, exact: true });
      }
    };

    const connect = () => {
      const url = new URL(LIVE_PATH, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      for (const entry of channel ? channel.split(",") : []) {
        if (entry.startsWith(SHARE_CHANNEL)) url.searchParams.append("share", entry.slice(SHARE_CHANNEL.length));
        else url.searchParams.append("address", entry);
      }
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => {
        if (opened) for (const queryKey of CATCH_UP_KEYS) queryClient.invalidateQueries({ queryKey, refetchType: "active" });
        opened = true;
        retry = 0;
        useLiveState.setState({ connected: true });
        heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), HEARTBEAT_MS);
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string" || e.data === "pong") return;
        try {
          deliver(JSON.parse(e.data) as LiveEvent);
        } catch {}
      };
      ws.onclose = () => {
        clearInterval(heartbeat);
        useLiveState.setState({ connected: false });
        if (closed || socket !== ws) return;
        reconnect = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 500 * 2 ** retry++));
      };
    };

    const wake = () => {
      if (document.visibilityState !== "visible" || (socket && socket.readyState <= WebSocket.OPEN)) return;
      clearTimeout(reconnect);
      retry = 0;
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      closed = true;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      socket?.close();
      useLiveState.setState({ connected: false });
    };
  }, [channel, account, queryClient]);
}
