import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mailbox } from "@/db/schema";
import { liveShares } from "@/realtime/mail-hub";
import { createMailbox, createUser, db, setShareToken, testEnv } from "./helpers";

describe("公开链接订阅实时推送", () => {
  it("只接受当前有效的公开链接", async () => {
    const owner = await createUser("own");
    const live = await createMailbox(owner.id);
    const expired = await createMailbox(owner.id);
    const anonymous = await createMailbox(null);
    await setShareToken(live.box.id, `live_${live.box.id}`);
    await setShareToken(expired.box.id, `gone_${expired.box.id}`);
    await setShareToken(anonymous.box.id, `anon_${anonymous.box.id}`);
    const d = await db();
    await d.update(mailbox).set({ shareExpiresAt: new Date(Date.now() - 1000) }).where(eq(mailbox.id, expired.box.id));

    const tokens = [`live_${live.box.id}`, `gone_${expired.box.id}`, `anon_${anonymous.box.id}`, "missing_token_123", "bad token!"];
    expect(await liveShares(testEnv, tokens)).toEqual([`live_${live.box.id}`]);
  });

  it("最多订阅 3 个链接", async () => {
    const owner = await createUser("own");
    const tokens: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { box } = await createMailbox(owner.id);
      await setShareToken(box.id, `many_${box.id}`);
      tokens.push(`many_${box.id}`);
    }
    expect(await liveShares(testEnv, tokens)).toHaveLength(3);
  });
});
