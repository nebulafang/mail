"use client";

import { Inbox, Settings, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { preloadOverlays } from "@/components/presentation/host";
import { useEnvironment } from "@/environment/environment";
import type { NavigatorConfig, ScreenProps } from "@/navigation/types";
import { hideSplash } from "@/lib/splash";
import { useAdminSession } from "@/services/admin";
import { authKeys, useAccount, type AccountUser } from "@/services/auth";
import { useLiveMail } from "@/services/live";
import { useInvitationAlerts } from "./invitations";
import { mailKeys, useSavedMailboxes } from "@/services/mail";
import { appPaths } from "@/lib/app-paths";
import { AboutScreen, PrivacyScreen, TermsScreen } from "./legal";
import { MailboxesScreen } from "./mailboxes";

const load = {
  mailbox: () => import("./mailbox"),
  message: () => import("./message"),
  settings: () => import("./settings"),
  profile: () => import("./profile"),
  shared: () => import("./shared"),
  admin: () => import("./admin"),
  createMailbox: () => import("./create-mailbox"),
  shareSheet: () => import("./share-sheet"),
};
const blank = () => null;
const MailboxScreen = dynamic<ScreenProps>(() => load.mailbox().then((m) => m.MailboxScreen), { loading: blank });
const MessageScreen = dynamic<ScreenProps>(() => load.message().then((m) => m.MessageScreen), { loading: blank });
const SettingsScreen = dynamic<ScreenProps>(() => load.settings().then((m) => m.SettingsScreen), { loading: blank });
const SharedInboxScreen = dynamic<ScreenProps>(() => load.shared().then((m) => m.SharedInboxScreen), { loading: blank });
const SharedMessageScreen = dynamic<ScreenProps>(() => load.shared().then((m) => m.SharedMessageScreen), { loading: blank });
const ProfileScreen = dynamic<ScreenProps>(() => load.profile().then((m) => m.ProfileScreen), { loading: blank });
const AdminScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminScreen), { loading: blank });
const AdminStatsScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminStatsScreen), { loading: blank });
const AdminUsersScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminUsersScreen), { loading: blank });
const AdminUserScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminUserScreen), { loading: blank });
const AdminMailScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminMailScreen), { loading: blank });
const AdminMessageScreen = dynamic<ScreenProps>(() => load.admin().then((m) => m.AdminMessageScreen), { loading: blank });

function whenIdle(task: () => void) {
  if ("requestIdleCallback" in window) {
    const id = requestIdleCallback(task, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 1500);
  return () => clearTimeout(id);
}

const appConfig: NavigatorConfig = {
  fallback: { name: "mailboxes" },
  tabs: [
    { id: "inbox", title: "邮箱", icon: Inbox, root: { name: "mailboxes" } },
    { id: "admin", title: "管理", icon: ShieldCheck, root: { name: "admin" } },
    { id: "settings", title: "设置", icon: Settings, root: { name: "settings" } },
  ],
  routes: {
    mailboxes: { path: appPaths.mailboxes, tab: "inbox", screen: MailboxesScreen },
    mailbox: {
      path: appPaths.mailbox,
      tab: "inbox",
      screen: MailboxScreen,
      parent: () => ({ name: "mailboxes" }),
    },
    message: {
      path: appPaths.message,
      tab: "inbox",
      screen: MessageScreen,
      hidesTabBar: true,
      parent: (p) => ({ name: "mailbox", params: { address: p.address } }),
    },
    shared: { path: appPaths.shared, tab: "inbox", screen: SharedInboxScreen },
    sharedMessage: {
      path: appPaths.sharedMessage,
      tab: "inbox",
      screen: SharedMessageScreen,
      hidesTabBar: true,
      parent: (p) => ({ name: "shared", params: { token: p.token } }),
    },
    admin: { path: appPaths.admin, tab: "admin", screen: AdminScreen },
    adminStats: { path: appPaths.adminStats, tab: "admin", screen: AdminStatsScreen, parent: () => ({ name: "admin" }) },
    adminUsers: { path: appPaths.adminUsers, tab: "admin", screen: AdminUsersScreen, parent: () => ({ name: "admin" }) },
    adminUser: { path: appPaths.adminUser, tab: "admin", screen: AdminUserScreen, parent: () => ({ name: "adminUsers" }) },
    adminUserMail: {
      path: appPaths.adminUserMail,
      tab: "admin",
      screen: AdminMailScreen,
      parent: (p) => ({ name: "adminUser", params: { userId: p.userId } }),
    },
    adminUserMailbox: {
      path: appPaths.adminUserMailbox,
      tab: "admin",
      screen: AdminMailScreen,
      parent: (p) => ({ name: "adminUser", params: { userId: p.userId } }),
    },
    adminCatchAll: { path: appPaths.adminCatchAll, tab: "admin", screen: AdminMailScreen, parent: () => ({ name: "admin" }) },
    adminMessage: {
      path: appPaths.adminMessage,
      tab: "admin",
      screen: AdminMessageScreen,
      hidesTabBar: true,
      parent: () => ({ name: "admin" }),
    },
    settings: { path: appPaths.settings, tab: "settings", screen: SettingsScreen },
    profile: { path: appPaths.profile, tab: "settings", screen: ProfileScreen, parent: () => ({ name: "settings" }) },
    about: { path: appPaths.about, tab: "settings", screen: AboutScreen, parent: () => ({ name: "settings" }) },
    privacy: { path: appPaths.privacy, tab: "settings", screen: PrivacyScreen, parent: () => ({ name: "settings" }) },
    terms: { path: appPaths.terms, tab: "settings", screen: TermsScreen, parent: () => ({ name: "settings" }) },
  },
};

export type InitialData = {
  domains: string[];
  contact?: string;
  account?: { enabled: boolean; user: AccountUser | null };
};

function useSeed({ domains, contact, account }: InitialData) {
  const queryClient = useQueryClient();
  useState(() => {
    const seed = (key: readonly unknown[], data: unknown) => {
      if (data !== undefined && !queryClient.getQueryData(key)) queryClient.setQueryData(key, data);
    };
    seed(mailKeys.config, { domains, contact });
    seed(authKeys.session, account);
  });
}

const USER_TABS = ["inbox", "settings"];

export function MailApp({ initialPathname, initial }: { initialPathname: string; initial: InitialData }) {
  useSeed(initial);
  const { data: admin } = useAdminSession();
  const showAdmin = !!admin?.admin || initialPathname.startsWith("/admin");
  const saved = useSavedMailboxes();
  const { data: account } = useAccount();
  useLiveMail(saved.addresses, account?.user?.username ?? null);
  useInvitationAlerts(account?.user?.username ?? null);

  useEffect(() => {
    if (initialPathname !== "/") hideSplash();
  }, [initialPathname]);

  const { lowEnd } = useEnvironment();
  useEffect(
    () =>
      whenIdle(() => {
        preloadOverlays();
        load.mailbox();
        load.message();
        load.createMailbox();
        if (lowEnd) return;
        load.shareSheet();
        load.settings();
        if (account?.user) load.profile();
        if (showAdmin) load.admin();
      }),
    [account?.user, lowEnd, showAdmin],
  );
  return <AppShell config={appConfig} initialPathname={initialPathname} visibleTabs={showAdmin ? undefined : USER_TABS} />;
}
