import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { systemColors } from "@/design-system/colors";
import { DEFAULT_SCENE, isSceneId, SCENE_COOKIE } from "@/design-system/scenes";
import { perfInitScript } from "@/environment/perf-script";
import { themeInitScript } from "@/environment/theme-script";

import { indexRobots, site, siteOpenGraph, siteShareImage, siteUrl } from "@/lib/seo";
import "./globals.css";

const verification = () => {
  const other: Record<string, string> = {};
  if (process.env.BAIDU_SITE_VERIFICATION) other["baidu-site-verification"] = process.env.BAIDU_SITE_VERIFICATION;
  if (process.env.BING_SITE_VERIFICATION) other["msvalidate.01"] = process.env.BING_SITE_VERIFICATION;
  return { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other };
};

export const generateMetadata = async (): Promise<Metadata> => ({
  metadataBase: await siteUrl(),
  title: { default: site.title, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [...site.keywords],
  category: "utilities",
  authors: [{ name: site.name }],
  creator: site.name,
  publisher: site.name,
  robots: indexRobots,
  verification: verification(),
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: siteOpenGraph,
  twitter: { card: "summary_large_image", title: site.title, description: site.description, images: [siteShareImage.url] },
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: systemColors.groupedBackground.light },
    { media: "(prefers-color-scheme: dark)", color: systemColors.groupedBackground.dark },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const saved = (await cookies()).get(SCENE_COOKIE)?.value;
  const scene = isSceneId(saved) ? saved : DEFAULT_SCENE;
  return (
    <html lang="zh-CN" data-first-load="" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: perfInitScript }} />
      </head>
      <body className="min-h-full bg-canvas">
        <Providers scene={scene}>{children}</Providers>
      </body>
    </html>
  );
}
