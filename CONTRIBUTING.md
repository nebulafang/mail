# 参与贡献

感谢你愿意改进这个项目。提交 Issue 或 Pull Request 之前，请先读完这份说明。

## 项目边界

- 本项目只做**收信**：不提供撰写、回复、发信、SMTP 或 IMAP 功能，相关 PR 不会被合并。唯一的外发行为是管理员配置的全站转发（`FORWARD_TO`）。
- 目标是在 Cloudflare 免费套餐上长期运行。新功能要考虑 Workers 请求数、D1 读写行数和 Durable Object 用量，不要引入高频轮询或全表扫描。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开提 Issue。

## 本地开发

需要 Node.js 22（见 `.node-version`）和 npm。

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

完整的 Worker 路由、WebSocket、收信和定时任务需要用 Worker 模式验证：

```bash
npm run build
npx wrangler dev --test-scheduled
```

更多说明见 [README](README.md#本地开发)。

## 提交前检查

下面三条命令必须全部通过，CI 会在每个 PR 上运行它们：

```bash
npm run lint
npm run typecheck
npm test
```

- 修复 bug 或新增接口时，在 `test/` 下补充测试，沿用 `test/helpers.ts` 的 `call`、`createUser`、`createMailbox` 等辅助函数。
- 修改数据库模型后运行 `npm run db:generate`，并把生成的迁移文件一起提交。
- 涉及界面的改动，请在 PR 中附上截图，并检查深色模式、窄屏和「减弱动态效果」下的表现。

## 代码风格

- **不写注释**：用清楚的命名和小函数表达意图。工具必须的指令（如 `"use client"`）除外。
- 沿用现有的组件、设计令牌和目录结构，不要为一次性需求新增依赖。
- 权限校验必须在服务端完成，不能只靠前端隐藏按钮。

## 提交 Pull Request

1. 从 `main` 新建分支，一个 PR 只做一件事。
2. 提交信息用中文简要说明改了什么、为什么改。
3. 按 PR 模板填写验证方式和检查清单。

提交贡献即表示你同意以 [AGPL-3.0-only](LICENSE) 许可发布你的代码，并遵守[行为准则](CODE_OF_CONDUCT.md)。
