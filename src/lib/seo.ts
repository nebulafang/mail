import { headers } from "next/headers";
import { site } from "./seo-copy";

export const siteShareImage = { url: "/og.png", width: 1200, height: 630 } as const;

export { site };

export const siteOpenGraph = {
  type: "website" as const,
  locale: "zh_CN",
  siteName: site.name,
  title: site.title,
  description: site.description,
  images: [{ ...siteShareImage, alt: site.name }],
};

export async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return new URL(`${proto}://${host}`);
}

const INDEXABLE = new Set(["/", "/about", "/privacy", "/terms"]);

export const isIndexable = (pathname: string) => INDEXABLE.has(pathname);

export const indexRobots = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
} as const;

export const noIndexRobots = { index: false, follow: false } as const;
