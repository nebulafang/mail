"use client";

import { create } from "zustand";

type LiveState = { connected: boolean; watched: Record<string, number> };

export const useLiveState = create<LiveState>(() => ({ connected: false, watched: {} }));

export const liveConnected = () => useLiveState.getState().connected;

export const SHARE_CHANNEL = "share:";

export const watchAddress = (address: string) => watch(address.toLowerCase());

export const watchShare = (token: string) => watch(`${SHARE_CHANNEL}${token}`);

function watch(key: string) {
  useLiveState.setState((s) => ({ watched: { ...s.watched, [key]: (s.watched[key] ?? 0) + 1 } }));
  return () =>
    useLiveState.setState((s) => {
      const { [key]: count = 0, ...rest } = s.watched;
      return { watched: count > 1 ? { ...rest, [key]: count - 1 } : rest };
    });
}

const LIVE_SAFETY_POLL = 20 * 60_000;

export const POLL = {
  messagesLive: LIVE_SAFETY_POLL,
  messagesFallback: 60_000,
  mailboxesLive: LIVE_SAFETY_POLL,
  mailboxesFallback: 2 * 60_000,
  sharedLive: LIVE_SAFETY_POLL,
  sharedFallback: 2 * 60_000,
  invitationsLive: false,
  invitationsFallback: 5 * 60_000,
} as const;

export const pollWhileLive = (live: number | false, fallback: number) => () => (liveConnected() ? live : fallback);
