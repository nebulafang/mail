import { matchPath } from "@/navigation/store";

export const appPaths = {
  mailboxes: "/",
  mailbox: "/mailbox/:address",
  message: "/mailbox/:address/:messageId",
  shared: "/s/:token",
  sharedMessage: "/s/:token/:messageId",
  admin: "/admin",
  adminStats: "/admin/stats",
  adminUsers: "/admin/users",
  adminUser: "/admin/users/:userId",
  adminUserMail: "/admin/users/:userId/mail",
  adminUserMailbox: "/admin/users/:userId/mail/:address",
  adminCatchAll: "/admin/catch-all",
  adminMessage: "/admin/message/:messageId",
  settings: "/settings",
  profile: "/me",
  about: "/about",
  privacy: "/privacy",
  terms: "/terms",
} as const;

export const isAppPath = (pathname: string) => Object.values(appPaths).some((p) => matchPath(p, pathname));
