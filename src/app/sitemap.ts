import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  const url = (path: string) => new URL(path, base).href;
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    ...["/about", "/privacy", "/terms"].map((path) => ({ url: url(path), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
