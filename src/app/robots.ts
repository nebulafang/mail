import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/mailbox/", "/admin"] },
    sitemap: new URL("/sitemap.xml", base).href,
    host: base.host,
  };
}
