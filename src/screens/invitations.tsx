"use client";

import { MailPlus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";
import { Section } from "@/components/list";
import { Button, IconTile } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets, springs } from "@/design-system/motion";
import { formatRelative, formatRemaining } from "@/lib/format";
import { ROLE_INFO } from "@/lib/share-rules";
import { useNavigation } from "@/navigation/context";
import { toast, toastError } from "@/presentation/api";
import { useInvitations, useReplyInvitation, type Invitation } from "@/services/share";

export function useInvitationAlerts(account: string | null) {
  const { data } = useInvitations(!!account);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((i) => i.id));
    const fresh = known.current ? data.filter((i) => !known.current!.has(i.id)) : [];
    known.current = ids;
    if (!fresh.length) return;
    haptic("success");
    toast.info(fresh.length > 1 ? `收到 ${fresh.length} 个共享邀请` : `${fresh[0].invitedBy ?? fresh[0].owner} 邀请你共享邮箱`, {
      description: "在首页顶部接受后即可查看",
    });
  }, [data]);
}

export function InvitationsSection({ enabled }: { enabled: boolean }) {
  const { data } = useInvitations(enabled);
  const list = data ?? [];
  return (
    <AnimatePresence initial={false}>
      {list.length > 0 && (
        <m.div key="invitations" {...presets.cardIn} transition={springs.hero}>
          <Section header={`共享邀请 · ${list.length}`} footer="接受后会出现在“共享给我的”里，你可以随时退出">
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((invite) => (
                <m.div key={invite.id} {...presets.contentAppear}>
                  <InvitationRow invite={invite} />
                </m.div>
              ))}
            </AnimatePresence>
          </Section>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function InvitationRow({ invite }: { invite: Invitation }) {
  const nav = useNavigation();
  const reply = useReplyInvitation();
  const from = invite.invitedBy ?? invite.owner;
  const [local, domain] = invite.address.split("@");

  const answer = (accept: boolean) =>
    reply.mutate(
      { id: invite.id, accept },
      {
        onSuccess: () => {
          if (!accept) return toast.success("已拒绝邀请");
          haptic("success");
          toast.success("已加入共享", {
            description: invite.address,
            action: { label: "打开", onClick: () => nav.push({ name: "mailbox", params: { address: invite.address } }) },
          });
        },
        onError: toastError,
      },
    );

  return (
    <div data-sep className="flex flex-col gap-3 border-b-(length:--hairline) border-separator p-(--card-pad)">
      <div className="flex items-start gap-3">
        <IconTile color="indigo">
          <MailPlus />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="type-subheadline text-label-2">
            <span className="font-semibold text-label">{from}</span> 邀请你共享邮箱
          </p>
          <p className="mt-0.5 font-mono type-body break-all text-label">
            {local}
            <span className="text-label-2">@{domain}</span>
          </p>
          <p className="mt-1 type-caption1 text-label-2">
            {ROLE_INFO[invite.role].label}：{ROLE_INFO[invite.role].description} · {formatRelative(invite.createdAt)}
            {invite.expiresAt && ` · 授权${formatRemaining(invite.expiresAt)}`}
          </p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <Button variant="prominent" size="small" className="flex-1" haptic="success" loading={reply.isPending && reply.variables?.accept} disabled={reply.isPending} onClick={() => answer(true)}>
          接受
        </Button>
        <Button variant="gray" size="small" className="flex-1" disabled={reply.isPending} onClick={() => answer(false)}>
          拒绝
        </Button>
      </div>
    </div>
  );
}
