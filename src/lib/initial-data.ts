import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { admit, viewerQuery } from "@/edge/core";
import { accountSummaryQuery, toAccountSummary } from "./account";
import { contactEmail, parseDomains } from "./config";
import { getServer } from "./server";
import { readSessionClaim, sessionEnabled } from "./session-cookie";

export async function initialData() {
  const { env, db } = await getServer();
  const domains = parseDomains(env.MAIL_DOMAINS);
  const contact = contactEmail();
  try {
    const enabled = sessionEnabled(env.SESSION_SECRET);
    const claim = enabled ? await readSessionClaim((await headers()).get("cookie"), env.SESSION_SECRET) : null;
    if (!claim) return { domains, contact, account: { enabled, user: null } };
    const [rows, counts] = await db.batch([viewerQuery(db, claim), accountSummaryQuery(db, claim.userId)]);
    const { ctx } = await getCloudflareContext({ async: true });
    const viewer = admit({ ctx }, db, claim, rows);
    return { domains, contact, account: { enabled, user: viewer ? toAccountSummary(viewer.username, counts) : null } };
  } catch {
    return { domains, contact, account: undefined };
  }
}
