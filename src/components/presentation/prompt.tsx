"use client";

import { useState } from "react";
import { TextField } from "@/components/form";
import { List, Section } from "@/components/list";
import { useSheetEntrance } from "@/hooks/use-sheet-entrance";
import { present } from "@/presentation/api";
import { SheetHeader, useSheet } from "./sheet";

type PromptOptions = {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  footer?: string;
  maxLength?: number;
  confirmLabel?: string;
  allowEmpty?: boolean;
};

export async function promptText(options: PromptOptions) {
  const { closed } = present.sheet({ title: options.title, content: <PromptSheet {...options} />, detents: ["fit"] });
  return closed;
}

function PromptSheet({ title, label, value = "", placeholder, footer, maxLength, confirmLabel = "完成", allowEmpty = true }: PromptOptions) {
  const sheet = useSheet();
  const [text, setText] = useState(value);
  const { content } = useSheetEntrance();
  const disabled = !allowEmpty && !text.trim();

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;
    sheet.dismiss(text.trim());
  };

  return (
    <form onSubmit={submit} noValidate>
      <SheetHeader title={title} onConfirm={submit} confirmLabel={confirmLabel} confirmDisabled={disabled} />
      <div ref={content}>
        <List className="pt-2">
          <Section
            footer={
              <span className="flex justify-between gap-3">
                <span>{footer}</span>
                {maxLength && (
                  <span className="shrink-0 tabular-nums">
                    {text.length}/{maxLength}
                  </span>
                )}
              </span>
            }
          >
            <TextField
              label={label}
              placeholder={placeholder}
              maxLength={maxLength}
              enterKeyHint="done"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onClear={() => setText("")}
            />
          </Section>
        </List>
      </div>
    </form>
  );
}
