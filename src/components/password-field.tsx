"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { TextField } from "@/components/form";

export function PasswordField({
  value,
  ...input
}: { value: string } & Omit<React.ComponentProps<typeof TextField>, "type" | "trailing" | "value">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...input}
      value={value}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        value && (
          <button
            type="button"
            aria-label={visible ? "隐藏密码" : "显示密码"}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
            className="press-fade grid size-(--icon-button-sm) shrink-0 place-items-center text-label-2 [&_svg]:size-5"
          >
            {visible ? <EyeOff /> : <Eye />}
          </button>
        )
      }
    />
  );
}
