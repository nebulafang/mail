"use client";

import { useNavigation } from "@/navigation/context";

const PAGES: Record<string, string> = { "/about": "about", "/privacy": "privacy", "/terms": "terms" };

export function SiteLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const nav = useNavigation();
  const go = () => {
    const path = href.split(/[?#]/)[0];
    if (path === "/") {
      nav.selectTab("inbox");
      nav.popToRoot("inbox", { animated: false });
      return true;
    }
    const page = PAGES[path];
    if (!page) return false;
    nav.push({ name: page });
    return true;
  };
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (go()) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
