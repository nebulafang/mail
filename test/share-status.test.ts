import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mailbox } from "@/db/schema";
import { shareStatus, toMailboxSharing, type MailboxSharing } from "@/lib/share-status";
import { at, call, createMailbox, createUser, db, expireMember, setShareToken, share, type TestUser } from "./helpers";

type Item = { address: string; owned: boolean; sharing: MailboxSharing | null };

const NOW = Date.parse("2026-10-02T00:00:00Z");
const sharing = (patch: Partial<MailboxSharing>): MailboxSharing => ({ members: 0, pending: 0, link: "off", linkExpiresAt: null, ...patch });

async function listed(as: TestUser, address: string) {
  const res = await call<{ mailboxes: Item[] }>("GET", "/api/mailboxes", { as });
  return res.body.mailboxes.find((m) => m.address === address);
}

async function detail(as: TestUser, address: string) {
  return (await call<{ mailbox: Item }>("GET", `/api/mailboxes/${at(address)}`, { as })).body.mailbox;
}

describe("共享状态文案", () => {
  it("没有共享时显示仅你可见，没有额外说明", () => {
    expect(shareStatus(sharing({}), NOW)).toEqual({ state: "private", icon: "lock", label: "仅你可见", caption: null, notes: [] });
    expect(shareStatus(null, NOW).state).toBe("private");
  });

  it("只有待接受的邀请时仍是仅你可见，但会单独提示", () => {
    expect(shareStatus(sharing({ pending: 2 }), NOW)).toMatchObject({
      state: "pending",
      icon: "lock",
      label: "仅你可见",
      caption: "2 人待接受",
      notes: ["2 人待接受"],
    });
  });

  it("成员和链接同时生效时都会列出", () => {
    const status = shareStatus(sharing({ members: 2, pending: 1, link: "active" }), NOW);
    expect(status).toMatchObject({ state: "shared", icon: "users", label: "你和 2 位成员、持有链接的人可见", caption: "共享 2 人 + 链接" });
    expect(status.notes).toEqual(["1 人待接受"]);
  });

  it("只有链接时使用链接图标，快到期和已过期都有提示", () => {
    const soon = new Date(NOW + 3 * 3_600_000).toISOString();
    expect(shareStatus(sharing({ link: "active", linkExpiresAt: soon }), NOW)).toMatchObject({
      icon: "link",
      label: "你和持有链接的人可见",
      caption: "链接共享中",
      notes: ["链接即将到期"],
    });
    expect(shareStatus(sharing({ link: "expired" }), NOW)).toMatchObject({ state: "private", icon: "lock", caption: "链接已过期" });
  });

  it("根据链接和成员计数计算状态", () => {
    expect(toMailboxSharing({ active: 1, pending: 0 }, "tok", null, NOW)).toEqual(sharing({ members: 1, link: "active" }));
    expect(toMailboxSharing(undefined, "tok", new Date(NOW - 1), NOW)).toMatchObject({ link: "expired" });
    expect(toMailboxSharing(undefined, null, new Date(NOW + DAY), NOW)).toEqual(sharing({}));
  });
});

const DAY = 86_400_000;

describe("邮箱列表和详情里的共享状态", () => {
  it("随邀请、接受、过期、移除实时变化", async () => {
    const owner = await createUser("own");
    const bob = await createUser("bob");
    const { box } = await createMailbox(owner.id);
    const path = `/api/mailboxes/${at(box.address)}`;

    expect((await listed(owner, box.address))?.sharing).toEqual(sharing({}));

    const granted = await call<{ results: { memberId: string }[] }>("POST", `${path}/members`, {
      as: owner,
      body: { usernames: [bob.username] },
    });
    const memberId = granted.body.results[0].memberId;
    expect((await listed(owner, box.address))?.sharing).toMatchObject({ members: 0, pending: 1 });

    await call("POST", `/api/invitations/${memberId}`, { as: bob, body: { accept: true } });
    expect((await listed(owner, box.address))?.sharing).toMatchObject({ members: 1, pending: 0 });
    expect((await detail(owner, box.address)).sharing).toMatchObject({ members: 1, pending: 0 });

    await expireMember(memberId);
    expect((await listed(owner, box.address))?.sharing).toMatchObject({ members: 0, pending: 0 });

    const carol = await createUser("car");
    const carolId = await share(owner, box.address, carol);
    expect((await detail(owner, box.address)).sharing?.members).toBe(1);
    await call("DELETE", `${path}/members/${carolId}`, { as: owner });
    expect((await detail(owner, box.address)).sharing).toMatchObject({ members: 0, pending: 0 });
  });

  it("公开链接的开启、过期、关闭都会反映出来", async () => {
    const owner = await createUser("own");
    const { box } = await createMailbox(owner.id);
    const path = `/api/mailboxes/${at(box.address)}`;

    await call("POST", `${path}/share`, { as: owner, body: { expiresAt: new Date(Date.now() + 7 * DAY).toISOString() } });
    expect((await listed(owner, box.address))?.sharing).toMatchObject({ link: "active" });

    const d = await db();
    await d.update(mailbox).set({ shareExpiresAt: new Date(Date.now() - 1000) }).where(eq(mailbox.id, box.id));
    expect((await detail(owner, box.address)).sharing).toMatchObject({ link: "expired" });

    await call("DELETE", `${path}/share`, { as: owner });
    expect((await listed(owner, box.address))?.sharing).toEqual(sharing({}));
  });

  it("一次请求里分别统计多个邮箱，成员看不到主人的共享详情", async () => {
    const owner = await createUser("own");
    const bob = await createUser("bob");
    const carol = await createUser("car");
    const { box: first } = await createMailbox(owner.id);
    const { box: second } = await createMailbox(owner.id);
    const { box: third } = await createMailbox(owner.id);
    await share(owner, first.address, bob);
    await share(owner, first.address, carol);
    await setShareToken(second.id, `st_${second.id}`);

    const res = await call<{ mailboxes: Item[] }>("GET", "/api/mailboxes", { as: owner });
    const byAddress = new Map(res.body.mailboxes.map((m) => [m.address, m.sharing]));
    expect(byAddress.get(first.address)).toMatchObject({ members: 2, link: "off" });
    expect(byAddress.get(second.address)).toMatchObject({ members: 0, link: "active" });
    expect(byAddress.get(third.address)).toEqual(sharing({}));

    const asMember = await listed(bob, first.address);
    expect(asMember).toMatchObject({ owned: false, sharing: null });
    expect((await detail(bob, first.address)).sharing).toBeNull();
  });
});
