"use client";

import { Ellipsis } from "lucide-react";
import { IconButton } from "@/design-system/atoms";
import { useMenuTrigger } from "@/hooks/use-menu-trigger";
import { cn } from "@/lib/utils";
import type { MenuPointer } from "@/presentation/store";

type MenuButtonProps = Omit<React.ComponentProps<typeof IconButton>, "children" | "onClick" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"> & {
  onOpen: (anchor: HTMLElement, pointer?: MenuPointer) => void;
  icon?: React.ReactNode;
};

export function MenuButton({ onOpen, icon, className, ...rest }: MenuButtonProps) {
  const trigger = useMenuTrigger(onOpen);
  return (
    <IconButton aria-haspopup="menu" {...rest} {...trigger} className={cn("touch-none", className)}>
      {icon ?? <Ellipsis />}
    </IconButton>
  );
}
