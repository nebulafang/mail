"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { MessageDetailScreen, type MessageViewModel } from "@/components/message-view";
import { useNavigation } from "@/navigation/context";
import type { RouteTarget, ScreenProps } from "@/navigation/types";
import { toast, toastError } from "@/presentation/api";
import { can } from "@/lib/share-rules";
import { messageQuery, useMailbox, useMarkSeen, useMessage, useMessages, useUndoableDeleteMessage } from "@/services/mail";

function useNeighbors(
  list: { id: string }[] | undefined,
  id: string,
  targetFor: (id: string) => RouteTarget,
  prefetch: (id: string) => void,
) {
  const nav = useNavigation();
  const index = list?.findIndex((m) => m.id === id) ?? -1;
  const prev = index > 0 ? list?.[index - 1] : undefined;
  const next = index >= 0 ? list?.[index + 1] : undefined;
  const prevId = prev?.id;
  const nextId = next?.id;
  useEffect(() => {
    if (prevId) prefetch(prevId);
    if (nextId) prefetch(nextId);
  }, [prevId, nextId, prefetch]);
  return {
    goPrev: prev && (() => nav.replace(targetFor(prev.id))),
    goNext: next && (() => nav.replace(targetFor(next.id))),
    afterDelete: () => {
      const target = next ?? prev;
      if (target) nav.replace(targetFor(target.id));
      else nav.pop();
    },
  };
}

export function MessageScreen({ params }: ScreenProps) {
  const address = params.address.toLowerCase();
  const { messageId } = params;
  const queryClient = useQueryClient();
  const { data: message, error } = useMessage(messageId);
  const { data: list } = useMessages(address);
  const { data: mailbox } = useMailbox(address);
  const organize = !!mailbox && can(mailbox.role ?? null, "organize");
  const deleteMessage = useUndoableDeleteMessage(address);
  const markSeen = useMarkSeen(address);
  const nav = useNeighbors(
    list,
    messageId,
    (id) => ({ name: "message", params: { address, messageId: id } }),
    (id) => void queryClient.prefetchQuery(messageQuery(id)),
  );

  const autoMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!message || !organize || autoMarked.current === message.id) return;
    autoMarked.current = message.id;
    if (!message.seen) markSeen.mutate({ id: message.id, seen: true });
  }, [message, organize, markSeen]);

  const model: MessageViewModel = {
    message,
    error,
    recipient: address,
    goPrev: nav.goPrev,
    goNext: nav.goNext,
    toggleSeen: organize
      ? () => {
          if (!message) return;
          toast.success(message.seen ? "已标为未读" : "已标为已读");
          markSeen.mutate({ id: message.id, seen: !message.seen }, { onError: toastError });
        }
      : undefined,
    onDelete: organize
      ? () => {
          deleteMessage(messageId);
          nav.afterDelete();
        }
      : undefined,
  };
  return <MessageDetailScreen model={model} />;
}

