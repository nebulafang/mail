import { EXPIRY_OPTIONS } from "@/lib/config";
import { site, siteUrl } from "@/lib/seo";
import { faq, features } from "@/lib/seo-copy";

export async function GET() {
  const base = await siteUrl();
  const url = (path: string) => new URL(path, base).href;
  const expiries = Object.values(EXPIRY_OPTIONS)
    .map((o) => o.label)
    .join("、");

  const text = `# ${site.name}

> ${site.description}

${site.name}是一个免费、免注册的一次性邮箱（临时邮箱）服务，只能收信、不能发信。打开网页即可生成地址，邮件实时推送到页面，验证码自动识别。地址有效期可选 ${expiries}，到期后地址、邮件和附件自动删除；登录账号后可以把地址设为永久。

## 功能

${features.map((f) => `- ${f.title}：${f.text}`).join("\n")}

## 页面

- [首页：生成临时邮箱](${url("/")})：一键生成地址、打开已有邮箱、常见问题
- [关于本站](${url("/about")})
- [隐私政策](${url("/privacy")})
- [服务条款](${url("/terms")})

## 常见问题

${faq.map(({ q, a }) => `### ${q}\n\n${a}`).join("\n\n")}

## Optional

- [站点地图](${url("/sitemap.xml")})
`;
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
