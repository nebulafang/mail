"use client";

import { site } from "@/lib/seo-copy";
import { SiteLink } from "./site-link";

const LINKS = [
  { href: "/about", label: "关于本站" },
  { href: "/privacy", label: "隐私政策" },
  { href: "/terms", label: "服务条款" },
];

export function SiteFooter() {
  return (
    <footer className="on-scene flex flex-col items-center gap-2 px-(--margin) pt-2 text-center type-footnote text-label-2">
      <nav aria-label="站点信息" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LINKS.map((l) => (
          <SiteLink key={l.href} href={l.href} className="text-tint outline-none focus-visible:underline">
            {l.label}
          </SiteLink>
        ))}
      </nav>
      <p>{site.name} · 免费一次性邮箱</p>
    </footer>
  );
}
