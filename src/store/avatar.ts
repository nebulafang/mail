"use client";

import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";

import { BRAND_IMAGE } from "@/design-system/brand";

const DEFAULT_AVATAR = BRAND_IMAGE;

function useStoredImage(key: string) {
  const [custom, setCustom, removeCustom] = useLocalStorage<string | null>(key, null, { initializeWithValue: false });

  const set = useCallback(
    (dataUrl: string) => {
      setCustom(dataUrl);
      if (window.localStorage.getItem(key) !== JSON.stringify(dataUrl)) throw new Error("本地存储空间不足");
    },
    [key, setCustom],
  );

  return { custom, set, reset: removeCustom };
}

export function useMailboxAvatar() {
  const { custom, set, reset } = useStoredImage("mailbox-avatar");
  return { src: custom ?? DEFAULT_AVATAR, isCustom: custom !== null, set, reset };
}

export function useUserAvatar(username: string | undefined) {
  const { custom, set, reset } = useStoredImage(`avatar:user:${username ?? ""}`);
  return { src: custom ?? undefined, isCustom: custom !== null, set, reset };
}
