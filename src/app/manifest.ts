import type { MetadataRoute } from "next";
import { systemColors } from "@/design-system/colors";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "临时邮箱 - 免费一次性邮箱",
    short_name: "临时邮箱",
    description: "免费临时邮箱：无需注册，一键生成一次性邮箱地址，实时接收验证码",
    lang: "zh-CN",
    dir: "ltr",
    categories: ["utilities", "productivity"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: systemColors.groupedBackground.light,
    theme_color: systemColors.groupedBackground.light,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
