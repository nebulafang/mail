"use client";

import { haptic } from "@/design-system/haptics";
import { copyText } from "@/lib/utils";
import { toast } from "./api";

export async function copyWithToast(label: string, value: string) {
  if (await copyText(value)) {
    haptic("success");
    toast.success(`${label}已复制`);
  } else toast.error("复制失败");
}
