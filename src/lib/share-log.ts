import type { DB } from "../db";
import { mailboxShareEvent, type ShareAction, type ShareEventDetail, type ShareSource } from "../db/schema";

type Person = { id: string; username: string } | null | undefined;

export type LinkAccessAction = Extract<ShareAction, "link_view" | "link_read">;
export const LINK_ACCESS_ACTIONS: LinkAccessAction[] = ["link_view", "link_read"];

export type ShareLogInput = {
  box: { id: string; address: string };
  action: ShareAction;
  actor?: Person;
  target?: Person;
  detail?: ShareEventDetail;
  source?: ShareSource;
  at?: Date;
};

export const logShare = (db: DB, { box, action, actor, target, detail, source, at = new Date() }: ShareLogInput) =>
  db.insert(mailboxShareEvent).values({
    mailboxId: box.id,
    address: box.address,
    action,
    actorId: actor?.id ?? null,
    actorName: actor?.username ?? null,
    targetId: target?.id ?? null,
    targetName: target?.username ?? null,
    detail: detail ?? null,
    source: source ?? (action === "expire" ? "system" : "user"),
    at,
  });

