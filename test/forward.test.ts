import { beforeAll, describe, expect, it } from "vitest";
import { handleEmail } from "@/email/handler";
import { forwardTarget, ORIGINAL_TO_HEADER } from "@/lib/forward";
import { db, testEnv, unique } from "./helpers";
import { fakeCtx, fakeMessage, rawEmail, type Forwarded } from "./mail-fixtures";

beforeAll(async () => {
  await db();
});

const withForward = (value: string | undefined) => ({ ...testEnv, FORWARD_TO: value }) as CloudflareEnv;

async function receive(env: CloudflareEnv) {
  const to = `${unique("fw")}@example.com`;
  const forwarded: Forwarded[] = [];
  await handleEmail(fakeMessage(to, rawEmail(to, "<p>hi</p>"), forwarded), env, fakeCtx);
  return { to, forwarded };
}

describe("全站转发由 FORWARD_TO 控制", () => {
  it("只接受合法、不属于本站收信域名的地址", () => {
    expect(forwardTarget(withForward(undefined))).toBeNull();
    expect(forwardTarget(withForward(""))).toBeNull();
    expect(forwardTarget(withForward("not-an-email"))).toBeNull();
    expect(forwardTarget(withForward("me@example.com"))).toBeNull();
    expect(forwardTarget(withForward("me@sub.example.com"))).toBeNull();
    expect(forwardTarget(withForward(" Me@Outside.org "))).toBe("me@outside.org");
  });

  it("设置后收到的信转发一份，并带上原收件地址", async () => {
    const { to, forwarded } = await receive(withForward("me@outside.org"));
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].to).toBe("me@outside.org");
    expect(forwarded[0].headers.get(ORIGINAL_TO_HEADER)).toBe(to);
  });

  it("不设置就不转发", async () => {
    const { forwarded } = await receive(testEnv);
    expect(forwarded).toEqual([]);
  });
});
