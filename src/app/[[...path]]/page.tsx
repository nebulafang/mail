import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Splash } from "@/components/splash";
import { isAppPath } from "@/lib/app-paths";
import { USER_COOKIE } from "@/lib/session-cookie";
import { initialData } from "@/lib/initial-data";
import { indexRobots, isIndexable, noIndexRobots, site, siteOpenGraph, siteUrl } from "@/lib/seo";
import { faq } from "@/lib/seo-copy";
import { MailApp } from "@/screens/app";

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const toPathname = (path: string[] = []) => `/${path.map((s) => encodeURIComponent(safeDecode(s))).join("/")}`;

const STATIC_PAGES = new Set(["/about", "/privacy", "/terms"]);

const TITLES: Record<string, string> = {
  "/about": "关于本站",
  "/privacy": "隐私政策",
  "/terms": "服务条款",
  "/settings": "设置",
  "/me": "个人中心",
  "/admin": "管理",
  "/admin/stats": "统计",
  "/admin/users": "用户",
  "/admin/catch-all": "Catch-all 邮件",
};

const DESCRIPTIONS: Record<string, string> = {
  "/about": "临时邮箱是一个免费、免注册的一次性邮箱服务：一键生成地址，实时接收验证码，到期自动删除。了解它是做什么的、适合什么场景，以及如何联系我们。",
  "/privacy": "临时邮箱隐私政策：谁能看到你的邮件、数据保存多久，以及公共邮箱与账号邮箱在隐私上的区别。",
  "/terms": "临时邮箱服务条款：可以和不可以用本服务做什么、邮箱有效期与数据删除规则，以及免责声明。",
};

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const { path } = await params;
  const pathname = toPathname(path);
  if (!isAppPath(pathname)) notFound();
  const base = await siteUrl();
  const title = TITLES[pathname];
  const description = DESCRIPTIONS[pathname];
  return {
    metadataBase: base,
    ...(title && { title }),
    ...(description && { description }),
    alternates: { canonical: pathname, languages: { "zh-CN": pathname } },
    openGraph: {
      ...siteOpenGraph,
      url: pathname,
      ...(title && { title: `${title} · ${site.name}` }),
      ...(description && { description }),
    },
    robots: isIndexable(pathname) ? indexRobots : noIndexRobots,
  };
}

export default async function AppPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pathname = toPathname(path);
  if (!isAppPath(pathname)) notFound();
  const [base, initial, jar] = await Promise.all([siteUrl(), initialData(), cookies()]);
  const signedIn = jar.has(USER_COOKIE);
  const jsonLd =
    pathname === "/"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${base.href}#website`,
              url: base.href,
              name: site.name,
              description: site.description,
              inLanguage: "zh-CN",
            },
            {
              "@type": "WebApplication",
              "@id": `${base.href}#app`,
              name: site.name,
              url: base.href,
              description: site.description,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Any",
              browserRequirements: "Requires JavaScript",
              inLanguage: "zh-CN",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
              isBasedOn: site.sourceRepo,
              isPartOf: { "@id": `${base.href}#website` },
            },
            {
              "@type": "FAQPage",
              "@id": `${base.href}#faq`,
              inLanguage: "zh-CN",
              mainEntity: faq.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
              })),
            },
          ],
        }
      : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {!STATIC_PAGES.has(pathname) && <Splash skipWhenNothingSaved={pathname === "/" && !signedIn} />}
      <MailApp initialPathname={pathname} initial={initial} />
    </>
  );
}
