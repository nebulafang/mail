"use client";

import { promptText } from "@/components/presentation/prompt";
import { MAX_NOTE_LENGTH } from "@/lib/config";
import { toast } from "@/presentation/api";

export async function editMailboxNote(address: string, current: string, save: (note: string) => Promise<void>, owned?: boolean) {
  const next = await promptText({
    title: "备注",
    value: current,
    placeholder: "例如：注册某某网站",
    maxLength: MAX_NOTE_LENGTH,
    footer: owned ? `${address} · 备注会同步到你的所有设备` : `${address} · 备注只保存在这台设备上`,
  });
  if (next === null || next === current) return;
  try {
    await save(next);
    toast.success(next ? "备注已保存" : "已删除备注");
  } catch (e) {
    toast.error((e as Error).message);
  }
}
