import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: {
          MAIL_DOMAINS: "example.com",
          SESSION_SECRET: "test-secret-test-secret-test-secret-0123",
          ADMIN_PASSWORD: "test-admin-password",
        },
        ratelimits: {
          LOOKUP_LIMITER: { namespace_id: "9001", simple: { limit: 1000, period: 60 } },
          AUTH_LIMITER: { namespace_id: "9003", simple: { limit: 1000, period: 60 } },
          READ_LIMITER: { namespace_id: "9007", simple: { limit: 100000, period: 60 } },
        },
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["test/**/*.test.ts"] },
});
