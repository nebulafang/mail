# 临时邮箱

基于 Cloudflare Workers 的自托管临时邮箱，支持免注册收信、验证码提取、账号私有邮箱和分级共享，可在 Cloudflare 免费套餐上长期运行。

适合接收短期验证码、隔离注册邮件、测试邮件投递，以及部署个人或小团队的收信服务。项目只提供收信和可选的全站转发，不提供邮件撰写、发信、SMTP 或 IMAP 服务。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nebulafang/mail) [![CI](https://github.com/nebulafang/mail/actions/workflows/ci.yml/badge.svg)](https://github.com/nebulafang/mail/actions/workflows/ci.yml) [![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)

## 功能

| 功能 | 说明 |
| --- | --- |
| 临时收信 | 随机生成或自定义邮箱前缀，支持多个收信域名、有效期调整、备注和收件箱清空 |
| 邮件阅读 | 查看纯文本、HTML、附件列表（只记录文件名和大小，不保存内容）和部分邮件头；自动提取验证码并支持复制；按未读、验证码和关键词筛选邮件 |
| 实时更新 | 通过 Durable Object 与 WebSocket 推送新邮件和共享变动，断线后自动重连并回退到轮询 |
| 可选账号 | 用户名和密码注册，无需手机号或邮箱；同步账号邮箱与备注，支持永久邮箱、密码修改和账号注销 |
| 邮箱共享 | 邀请注册用户并分配只读、可整理、可管理权限；支持授权有效期、撤销、操作记录和无需登录的只读链接 |
| 管理后台 | 设置 `ADMIN_PASSWORD` 后，可以查看统计、开关新用户注册，停用、删除用户，让用户的某台设备退出登录，查看任意用户的全部邮件，以及发到未创建地址的 Catch-all 邮件 |
| 全站转发 | 设置 `FORWARD_TO` 后，把全站收到的邮件额外转发到一个已验证的外部邮箱 |
| 移动端界面 | Liquid Glass 风格，支持主屏幕独立窗口、深浅色、场景背景、字号、减弱动态效果、降低透明度和性能模式 |

## 访问权限与数据保留

| 邮箱类型 | 谁可以访问 | 如何保存或找回 |
| --- | --- | --- |
| 匿名公共邮箱 | 任何知道地址的人都可以读信、删信、调整有效期或删除邮箱 | 本地列表最多保存 10 个地址；换设备后可输入完整地址重新打开 |
| 账号邮箱 | 默认只有所有者可以访问；主动共享后，成员或链接持有者按授权访问 | 登录同一账号即可同步，最多拥有 50 个邮箱；所有者可设为永久 |
| 未创建或已过期的地址 | 未设置 `ADMIN_PASSWORD` 时不入库，直接丢弃；设置后存进 Catch-all 邮箱，只有管理员能看到，最后一封 7 天后清理（设置了 `FORWARD_TO` 时都会转发一份） | 有人创建这个地址时，旧的 Catch-all 邮件会被清掉，创建之后收到的信才会出现在收件箱 |

设置 `ADMIN_PASSWORD` 后，管理员可以在管理后台查看所有账号邮箱和 Catch-all 邮件；未设置时没有管理后台，网站上看不到别人的邮件。无论是否设置，能访问 D1 数据库的站点运营者技术上都可以读取所有邮件。**账号私有指的是对其他用户的访问隔离。** 设置 `FORWARD_TO` 后，转发目标也会收到全站邮件。公共地址和只读链接都应按访问凭据保管。

数据保留规则：

- 新建邮箱可选 1 小时、1 天或 7 天；「一键新建」默认为 1 天。调整有效期从操作时重新计算，永久邮箱不参与过期清理。
- 每个邮箱最多保留最近 1,000 封邮件，更早的由定时任务自动删除（永久邮箱同样适用）。
- 定时任务每小时清理过期邮箱及其邮件、附件（每轮最多 500 个邮箱）。到期地址立即不能继续访问，可能被重新使用。
- 删除邮件、清空收件箱、删除邮箱和注销账号都会立即从数据库永久删除相关数据，没有恢复功能。
- D1 用量达到 `STORAGE_HARD_LIMIT_MB`（默认 470 MB）时，定时任务会依次自动回收：附件内容、Catch-all 邮箱、旧邮件的 HTML 和 30 天前的共享日志，直到低于 `STORAGE_SOFT_LIMIT_MB`。账号、账号邮箱和邮件纯文本不会被自动删除。
- 共享操作日志保留 180 天。公开链接不记录访客的访问日志。
- 登录会话会记录登录时的 IP 和设备型号，只有管理员能在用户详情里看到，用户退出或被停用后随会话一起删除；不保存 UA 和地理位置，不采集浏览器指纹和统计数据。清除本地邮箱列表只影响当前浏览器，不会删除服务器中的邮箱。

## 部署

### 准备条件

- Cloudflare 账号，以及 DNS 托管在 Cloudflare、可启用 Email Routing 的收信域名。
- 网页部署需要 GitHub 账号；命令行部署需要 Node.js 22 或更高版本和 npm，仓库的 `.node-version` 指定为 22。
- 为收信准备专用域名或子域名。Email Routing 需要使用 Cloudflare 的 MX 记录，启用前应确认与已有邮箱服务的关系。

收信域名和网站访问域名可以不同，例如用 `example.com` 收信、用 `mail.example.com` 访问网站。详细操作说明见[部署指南](docs/deploy.md)。

### 方式一：网页部署

1. 点击上方 **Deploy to Cloudflare** 按钮，按提示授权 GitHub、创建代码副本和 Worker。填写 `MAIL_DOMAINS`，按需设置 `SESSION_SECRET`、`CONTACT_EMAIL` 和 `FORWARD_TO`，保留 D1 数据库的新建选项。
2. 构建命令使用 `npm run build`，部署命令使用 `npm run deploy`。默认 Worker 名称为 `mail`；如果修改名称，确保它与 `wrangler.jsonc` 中的 `name` 一致。
3. 部署成功后，按下方步骤配置 Email Routing，再打开 Worker 提供的 `workers.dev` 地址验证收信。

也可以先 fork [本项目](https://github.com/nebulafang/mail)，在 Cloudflare **Workers & Pages** 中导入自己的仓库，使用相同构建与部署命令。连接 [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) 后，向配置的生产分支推送代码会自动构建并部署。

### 方式二：命令行部署

```bash
git clone https://github.com/nebulafang/mail.git
cd mail
npm ci
npx wrangler login
npm run release
```

部署后设置运行时变量，也可以在 Cloudflare 的 Worker 设置中添加：

```bash
npx wrangler secret put MAIL_DOMAINS
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
```

`MAIL_DOMAINS` 必填，`SESSION_SECRET` 和 `ADMIN_PASSWORD` 按需设置。Windows 上构建和预览建议使用 WSL，OpenNext 的原生 Windows 支持并不完整。

### 配置收信

对 `MAIL_DOMAINS` 中的每个域名分别操作：

1. 在 Cloudflare 中找到域名的 **Email Routing（电子邮件路由）**，按提示启用并添加所需 MX、TXT 记录。
2. 打开 **Routing rules（路由规则）**，启用 **Catch-all**，将操作设为 **Send to a Worker（发送到 Worker）**，目标选择刚部署的 Worker。
3. 在网站创建邮箱，用外部邮箱发送测试邮件，确认收件箱能够显示邮件和验证码。

项目的部署配置不会自动设置域名收信规则，必须完成这一步；仅填写 `MAIL_DOMAINS` 不会接通收信。具体规则行为见 [Cloudflare Email Routing 文档](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)。

网站可直接使用 `https://<Worker 名称>.<账号子域>.workers.dev`。如需自己的网址，在 Worker 的 **Domains & Routes（域和路由）** 添加自定义域名。首页和说明页的边缘缓存只在自定义域名上生效，长期运行建议绑定，可以明显减少 Worker 请求和 CPU 消耗。`workers.dev` 响应带有 `noindex`，避免与自定义域名重复收录。

### 自动配置与更新

`wrangler.jsonc` 已声明 D1 数据库 `DB`、实时推送 `MAIL_HUB`、限流绑定和每小时运行的清理任务。D1 按配置的数据库名称查找或创建，表结构在首次访问数据库时自动迁移。邮件正文存储在 D1，附件不保存内容，不需要额外配置 R2。

更新代码后，网页部署通过推送触发构建，命令行部署运行 `npm run release`。保留自己的 Worker 名称、数据库名称和绑定关系；数据库迁移随构建打包，并在下一次访问时应用。项目启用了 `keep_vars`，重新部署会保留后台设置的普通变量；密钥应使用 Cloudflare 后台或 `wrangler secret put` 管理，不要提交到仓库。

## 配置

生产环境在 Worker 的 **Variables and Secrets（变量和机密）** 中设置，本地开发写入 `.dev.vars`。

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `MAIL_DOMAINS` | 是 | 收信域名，多个用英文逗号分隔，例如 `example.com,example.net`；每个域名都需配置 Email Routing |
| `SESSION_SECRET` | 否 | 用户会话密钥，至少 32 个字符，建议存为密钥；未设置或长度不足则关闭注册、登录 |
| `CONTACT_EMAIL` | 否 | 关于本站、隐私政策和服务条款中的联系邮箱，建议使用独立的外部邮箱 |
| `ADMIN_PASSWORD` | 否 | 管理后台的密码，建议存为密钥；设置后同时开始保存发到未创建地址的 Catch-all 邮件，留空则没有管理后台 |
| `FORWARD_TO` | 否 | 全站转发的目标邮箱，需先在 Email Routing 的目标地址中验证，不能属于收信域名；留空则不转发 |
| `GOOGLE_SITE_VERIFICATION` | 否 | Google Search Console 验证标签的 `content` 值 |
| `BING_SITE_VERIFICATION` | 否 | Bing 验证标签的 `content` 值 |
| `BAIDU_SITE_VERIFICATION` | 否 | 百度验证标签的 `content` 值 |
| `STORAGE_SOFT_LIMIT_MB` | 否 | D1 用量超过该大小后收信截短正文；也是自动回收的目标线，默认 `400` |
| `STORAGE_HARD_LIMIT_MB` | 否 | D1 用量超过该大小后收信只保留纯文本，并由定时任务自动回收旧数据直到低于软水位，默认 `470` |
| `NEXTJS_ENV` | 仅本地 | 本地开发设为 `development`，生产环境不要设置 |

生成 `SESSION_SECRET`：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

更换会话密钥会使现有用户会话失效，账号和邮箱数据仍保留。匿名收信不依赖账号功能。

## 使用

### 创建和管理邮箱

1. 在首页点击「一键新建」，或通过新建入口选择域名、前缀和有效期。前缀支持字母、数字及 `. _ -`，统一转为小写，不能以符号开头或结尾。
2. 复制地址用于收信，保持收件箱打开即可看到更新。邮件详情可查看正文、附件和邮件头，识别出的验证码可直接复制。
3. 在邮箱菜单中修改备注、有效期、已读状态或清空收件箱。公共邮箱的备注仅存于本机；账号邮箱由所有者或可管理成员编辑的备注会同步。
4. 在首页输入已有的完整地址重新打开邮箱。已被其他账号占用的地址无法自行创建或读取；已有公共地址可以共同使用。

### 账号与永久邮箱

站点启用账号功能后，从「设置 → 登录 / 注册」进入。用户名为 3–20 位字母、数字或下划线，密码为 8–64 位。登录后新建邮箱归当前账号所有，也可按提示将本机已有、未被占用且未过期的公共邮箱加入账号。

邮箱所有者可在有效期菜单中设为「永久」，也可改回限时。个人中心提供密码修改和账号注销；修改密码会使其他设备退出。项目没有找回密码功能，忘记密码只能由站点运营者在 D1 中处理。

### 共享邮箱

只有账号邮箱可以共享。在邮箱菜单中选择「共享给用户」，填写完整用户名、权限和有效期；对方接受邀请后，邮箱会出现在「共享给我的」中。

| 角色 | 权限 |
| --- | --- |
| 只读 | 查看邮件和附件 |
| 可整理 | 只读权限，加上标记已读、删除邮件和清空收件箱 |
| 可管理 | 可整理权限，加上管理成员、查看共享操作记录、修改备注和限时有效期 |
| 所有者 | 全部权限，包括永久有效期、删除邮箱及管理公开链接 |

每个邮箱最多共享给 50 人，待接受邀请也占名额；每次最多邀请 20 人。成员可以退出，授权可修改、撤销或自动到期。成员不能自行设为永久、删除整个邮箱或管理公开链接。

所有者可开启只读链接，持有链接的人无需登录即可查看该邮箱当前及后续的邮件和附件。链接默认有效期为 7 天，可以修改有效期、重置链接或停止分享；重置后旧链接失效。成员和链接都受邮箱本身的有效期限制。

### 全站转发

设置 `FORWARD_TO` 后，每封收到的邮件都会额外转发一份到该地址：

1. 在 Cloudflare Email Routing 的 **Destination addresses（目标地址）** 添加并验证外部邮箱。
2. 在 Worker 的变量中设置 `FORWARD_TO` 为这个邮箱，Catch-all 仍指向 Worker。

转发会复制全站收到的邮件，包括账号邮箱和未创建地址，保留原始内容（含附件）并附加 `X-Mail-Original-To` 邮件头。转发目标不能属于本站收信域名或其子域名。转发失败只写入 Worker 日志，不影响站内收信，也不会自动重试；超过项目收信大小上限的邮件会被拒收且不会转发。目标验证要求见 [Cloudflare 邮件处理 API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)。

## 默认限制

| 项目 | 默认值或行为 |
| --- | --- |
| 整封邮件 | 最大 10 MiB，超过即拒收 |
| 附件 | 不保存内容，只记录文件名、类型和大小，不能预览或下载；设置 `FORWARD_TO` 时转发出去的原始邮件仍带附件 |
| 邮件正文 | 纯文本和 HTML 分别最多保存 300,000 个字符 |
| 用户收件箱列表 | 按需加载最近 200 封以内的邮件；搜索和筛选作用于已加载内容 |
| 邮箱列表计数 | 总数和未读数最多显示到「99+」 |
| 单个邮箱保留 | 最近 1,000 封，更早的每小时自动清理，可修改 `src/lib/config.ts` 的 `MAX_MESSAGES_PER_MAILBOX` |
| 创建邮箱 | 按 IP 限流，每分钟 10 次 |
| 账号操作 | 注册、登录、修改密码、注销等共用按 IP 的每分钟 10 次限流 |
| 共享用户查询 | 按登录用户每分钟 30 次限流 |
| 按地址读取 | 查询地址是否可用、按地址打开邮箱和收件箱、认领邮箱、建立实时连接，共用按 IP 的每分钟 120 次限流 |

邮箱及正文限制在 `src/lib/config.ts`，共享限制在 `src/lib/share-rules.ts`，限流配置在 `wrangler.jsonc`。Cloudflare 的平台配额仍然适用，实际容量和费用取决于所用服务与套餐。

HTML 邮件会经 DOMPurify 净化，再放入禁止脚本执行、只允许加载图片的 sandbox iframe；邮件内容不应视为可信来源。主屏幕模式提供独立窗口，项目未实现离线收信。

## 本地开发

### 界面和接口开发

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

启动前编辑 `.dev.vars`：设置 `MAIL_DOMAINS`，取消 `NEXTJS_ENV=development` 的注释；按需填写会话密钥。访问 `http://localhost:3000`，D1 使用本地模拟数据库并自动迁移。

`next dev` 用于界面与 Next.js 接口开发；完整的自定义 Worker 路由、WebSocket、收信和定时任务应在 Worker 模式下验证。生产部署使用 `npm run release`，`npm run start` 不会运行完整的自定义 Worker。

### 测试完整 Worker

```bash
npm run build
npx wrangler dev --test-scheduled
```

访问 `http://localhost:8787` 并创建测试邮箱。在项目目录保存 `test.eml`，将收件地址替换为刚创建的地址；文件需包含 `Message-ID`：

```eml
From: sender@test.example
To: demo@example.com
Message-ID: <local-test-1@test.example>
Subject: Verification code 123456
Content-Type: text/plain; charset=utf-8

Your verification code is 123456.
```

另开终端模拟收信和定时任务，URL 中的 `to` 也要替换为实际地址：

```bash
curl -X POST "http://localhost:8787/cdn-cgi/handler/email?from=sender@test.example&to=demo@example.com" --data-binary @test.eml
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

Windows PowerShell 中可用 `Copy-Item` 复制配置、用 `curl.exe` 发送请求。本地模式不会接收公网投递的真实邮件；真实收信仍需部署并配置 Email Routing。

## 技术栈与维护

前端使用 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Base UI、Motion、Zustand 和 TanStack Query。服务端通过 OpenNext 部署到 Cloudflare Workers，D1 与 Drizzle 保存数据，Email Routing 与 PostalMime 接收解析邮件，Durable Objects 提供实时通知，iron-session 管理会话。

```text
worker.ts               Worker 入口：HTTP、WebSocket、收信、定时清理
wrangler.jsonc          Cloudflare 资源绑定、限流和定时任务
src/edge/               直接在 Worker 中处理的接口
src/app/                Next.js 页面、接口和 SEO
src/email/              邮件解析、入库、数据清理和存储回收
src/realtime/           Durable Object 与实时通知
src/db/ + drizzle/      数据模型、SQL 迁移与迁移打包
src/lib/                配置、鉴权、权限、查询和业务规则
src/screens/            邮箱、账号、共享和设置界面
src/components/         通用组件与邮件阅读
src/services/           客户端接口调用、缓存和实时状态
src/design-system/      视觉样式、材质和动效
src/environment/        主题、显示偏好和性能适配
src/navigation/         导航栈、URL 同步与页面转场
src/presentation/       弹层、菜单和提示管理
test/                   Vitest 单元与 Worker/D1 集成测试
```

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Next.js 开发服务 |
| `npm run preview` | 构建并在本地预览 Worker |
| `npm run build` | 打包数据库迁移、生成构建标识并构建 OpenNext Worker |
| `npm run deploy` | 部署已有构建产物 |
| `npm run release` | 构建并部署 |
| `npm run test` | 运行现有测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 根据 `src/db/schema.ts` 导出的模型生成并打包 SQL 迁移 |
| `npm run cf-typegen` | 更新 Cloudflare 绑定类型 |
| `npm run icons` | 根据 `assets/brand-icon.png` 重新生成图标和默认品牌图片 |

自定义站点文案、名称和源代码链接可修改 `src/lib/seo-copy.ts`。修改数据库模型后执行 `npm run db:generate` 并提交迁移文件；Worker 会自动应用，无需额外手动执行 SQL。迁移打包文件由脚本生成，不应手动编辑。

## 许可证

Copyright © 2026 nebulafang。本项目采用 [AGPL-3.0-only](LICENSE)，适用范围及第三方声明见 [NOTICE](NOTICE)。使用、修改和部署时应保留版权与许可声明；将修改版本作为网络服务提供时，应按协议向用户提供对应的完整源代码，并将 `src/lib/seo-copy.ts` 中的 `site.sourceCode` 指向自己的源码仓库。具体条件以许可证原文为准。

本项目参考并部分基于 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email)，其 MIT 许可声明保留在 `NOTICE` 中。
