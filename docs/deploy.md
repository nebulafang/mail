# 部署指南

这份指南带你把「临时邮箱」部署到自己的 Cloudflare 账号上。跟着做大约需要 10～15 分钟，全程可以只用浏览器。

点击 **Deploy to Cloudflare** 按钮，按提示配置代码、数据库、实时推送、限流、定时清理和变量；之后往连接的 GitHub 生产分支推送代码会自动重新部署。本项目没有自动配置收信规则，还需要手动启用 Email Routing 并将 Catch-all 指向 Worker。

## 部署完你会得到

- 一个临时邮箱网站：一键生成邮箱地址，新邮件实时出现在页面上，验证码自动识别、一键复制
- 可以添加到手机主屏幕，像 App 一样全屏使用
- 可选的用户账号：用户名 + 密码注册，邮箱列表多设备同步，账号邮箱默认私有，也可分级共享给其他用户或生成只读链接
- 可选的全站转发：把收到的每封邮件额外转发一份到你自己的邮箱

## 开始前准备

| 需要什么 | 说明 |
| --- | --- |
| Cloudflare 账号 | [免费注册](https://dash.cloudflare.com/sign-up)，免费套餐就够用 |
| 一个域名，并且 DNS 托管在 Cloudflare | 用来收信（Email Routing 只支持托管在 Cloudflare 的域名），也用来访问网站。还没托管的话，在 Cloudflare 后台点 **添加域（Add a domain）**，按提示把域名的 NS 服务器改成 Cloudflare 给的地址，等状态变成「有效」 |
| GitHub 账号 | 用网页方式部署时需要，代码会放在你的 GitHub 里 |

**关于收信域名**：开启收信后，这个域名原有的邮箱（如果有）会收不到信，因为 MX 记录要指向 Cloudflare。建议用一个专门的域名或子域名收信，比如 `a.com` 用来收信，网站放在 `mail.a.com`，或者干脆收信和网站用两个不同的域名。收信域名可以有多个。

## 整体流程

1. [部署 Worker](#第-1-步部署-worker)：把代码部署到 Cloudflare，数据库等资源会自动创建，部署完马上能通过 `workers.dev` 地址访问
2. [设置变量](#第-2-步设置变量)：告诉网站用哪些域名收信，按需开启账号和转发功能（一键部署时已经在配置页填过）
3. [配置收信](#第-3-步配置收信email-routing)：让发到你域名的邮件转给网站，**唯一必须手动做的一步**
4. [验证](#第-4-步验证)：打开网站，发一封信试试
5. [绑定自己的域名](#第-5-步绑定自己的域名可选)（可选，推荐）：用 `mail.a.com` 这样的网址代替 `workers.dev` 地址

---

## 第 1 步：部署 Worker

三种方式任选一种。**不熟悉命令行的话选方式 A。**

### 方式 A：一键部署（推荐）

1. 打开项目主页，点 README 顶部的 **Deploy to Cloudflare** 按钮。
2. 登录 Cloudflare，按提示授权 GitHub。Cloudflare 会在你的 GitHub 账号下创建一个新仓库，内容是这个项目的一份副本，以后在那里改代码。
3. 在配置页面按下表填写，每一项旁边也有说明：

   | 配置项 | 填什么 |
   | --- | --- |
   | Git 仓库名称 | 随意，这是在你 GitHub 里新建的仓库 |
   | Worker 名称 | 默认 `mail`，可以改。网址会是 `https://<Worker 名称>.<你的子域>.workers.dev`，第 3 步配置收信时也要选这个名字 |
   | D1 数据库 | 保持「新建」，名称用默认的 `mail` 即可 |
   | **`MAIL_DOMAINS`** | **必填**。你的收信域名，多个用英文逗号分隔，比如 `a.com,b.net`。默认值 `example.com` 一定要换掉 |
   | `SESSION_SECRET` | 可选。至少 32 个字符的随机字符串，留空就没有注册 / 登录。生成方法见 [第 2 步](#第-2-步设置变量) |
   | `CONTACT_EMAIL` | 可选。显示在「关于本站」等页面的联系邮箱 |
   | `ADMIN_PASSWORD` | 可选。管理后台的密码，留空就没有管理后台，也不保存 Catch-all 邮件 |
   | `FORWARD_TO` | 可选。全站转发的目标邮箱，要先验证，见 [全站邮件转发](#全站邮件转发) |
   | 构建命令 / 部署命令 | 会自动填成 `npm run build` 和 `npm run deploy`，**不要改** |

   可选项留空也没关系，以后随时可以在后台补上，见 [第 2 步](#第-2-步设置变量)。
4. 点 **创建并部署（Create and deploy）**。第一次构建大约需要 3～5 分钟。

构建成功后，第 2 步的变量已经填好了，直接看 [第 3 步](#第-3-步配置收信email-routing)。以后在 Cloudflare 新建的那个 GitHub 仓库里推送代码，会自动重新构建和部署。

### 方式 B：连接自己的 GitHub 仓库

适合你已经 fork 了这个项目，或者想自己维护一份代码。

1. 在 GitHub 上 fork 本项目（或者把代码推送到你自己的仓库）。
2. 登录 [Cloudflare 后台](https://dash.cloudflare.com)，左侧菜单 **Workers 和 Pages（Workers & Pages）→ 创建（Create）→ 导入存储库（Import a repository）**。
3. 授权 GitHub，选择你的仓库。
4. 按下表填写：

   | 字段 | 填写内容 |
   | --- | --- |
   | 项目名称（Project name） | `mail`。想用别的名字的话，先把仓库里 `wrangler.jsonc` 的 `"name"` 改成同一个名字再导入，两者不一致会构建失败 |
   | 生产分支 | `main` |
   | 构建命令（Build command） | `npm run build` |
   | 部署命令（Deploy command） | `npm run deploy` |
   | 根目录 | 留空 |

5. 点 **保存并部署（Save and Deploy）**，等待构建完成，第一次大约需要 3～5 分钟。
6. 接着做 [第 2 步](#第-2-步设置变量)，至少要设置 `MAIL_DOMAINS`。

以后往 `main` 分支推送代码，Cloudflare 会自动重新构建和部署。

### 方式 C：命令行

需要 Node.js 22 或更高版本，仓库的 `.node-version` 指定为 22。Windows 上构建和预览建议使用 WSL。

```bash
git clone https://github.com/nebulafang/mail.git
cd mail
npm install
npx wrangler login          # 浏览器里授权 Cloudflare 账号
npm run release             # 构建并部署
```

然后用命令设置变量（也可以在后台设置，见 [第 2 步](#第-2-步设置变量)）：

```bash
npx wrangler secret put MAIL_DOMAINS      # 必填
npx wrangler secret put SESSION_SECRET    # 可选
npx wrangler secret put ADMIN_PASSWORD    # 可选
```

以后更新代码后，再运行一次 `npm run release` 即可。

### 部署时自动完成的事

不管用哪种方式，下面这些都不用手动配置：

- **访问地址**：部署完就能通过 `https://<Worker 名称>.<你的子域>.workers.dev` 打开网站，在 **Workers 和 Pages → mail** 的概览页可以看到这个地址。
- **D1 数据库**：部署时自动创建一个名为 `mail` 的数据库。表由网站在第一次访问数据库时自己建好，以后更新代码后也会自动更新表结构，不用执行任何 SQL。
- **实时推送（Durable Object `MailHub`）**：新邮件到达后立即推送到打开的页面。免费套餐可以用。
- **防刷限流**：每个 IP 每分钟最多创建 10 个邮箱、10 次账号注册 / 登录。
- **定时清理**：每小时删除一次过期的邮箱和邮件。

---

## 第 2 步：设置变量

进入 **Workers 和 Pages → mail → 设置（Settings）→ 变量和机密（Variables and Secrets）**，点 **添加（Add）**，填好后点 **部署（Deploy）**。立即生效，不用重新构建。

| 名称 | 类型 | 必填 | 作用 | 不设置时 |
| --- | --- | --- | --- | --- |
| `MAIL_DOMAINS` | 文本或密钥都可以（一键部署时存成密钥） | **是** | 收信域名，多个用英文逗号分隔，比如 `a.com,b.net` | 无法创建邮箱 |
| `SESSION_SECRET` | 密钥 | 否 | 用户账号的会话密钥，**至少 32 个字符** | 没有注册 / 登录功能 |
| `CONTACT_EMAIL` | 文本 | 否 | 联系邮箱，显示在「关于本站」「隐私政策」「服务条款」页 | 这几页不显示联系方式 |
| `ADMIN_PASSWORD` | 密钥 | 否 | 管理后台的密码，设置 → 管理后台里登录；设置后开始保存 Catch-all 邮件 | 没有管理后台，发到未创建地址的邮件直接丢弃 |
| `FORWARD_TO` | 文本 | 否 | 把全站收到的邮件转发一份到这个邮箱，要先验证，见 [全站邮件转发](#全站邮件转发) | 不转发 |
| `GOOGLE_SITE_VERIFICATION` | 文本 | 否 | Google Search Console 的验证码 | 不输出验证标签 |
| `BING_SITE_VERIFICATION` | 文本 | 否 | Bing 站长工具的验证码 | 同上 |
| `BAIDU_SITE_VERIFICATION` | 文本 | 否 | 百度搜索资源平台的验证码 | 同上 |

**怎么生成 `SESSION_SECRET`**：用密码管理器生成一个 32 位以上的随机字符串；或者在电脑浏览器里按 F12 打开「控制台（Console）」，输入 `crypto.randomUUID() + crypto.randomUUID()` 回车，复制输出的那串字符（不含引号）。不需要记住它，也不要泄露。以后更换它，所有用户会被退出登录，但账号和邮箱都还在。

**注意**：

- `CONTACT_EMAIL` 不要用本站的收信域名。那样的地址是公共邮箱，任何人都能读信。
- 站长验证码只填平台给出的 `content` 值，不要填整段 `<meta>` 标签。
- 这些变量只在后台设置，不要写进 `wrangler.jsonc`。项目开启了 `keep_vars`，重新部署不会清掉后台的变量；但如果写进了 `wrangler.jsonc`，每次部署都会用文件里的值覆盖后台的值。

---

## 第 3 步：配置收信（Email Routing）

`MAIL_DOMAINS` 里的**每一个**域名都要做一次：

1. Cloudflare 后台首页点进这个域名，左侧菜单选 **电子邮件（Email）→ 电子邮件路由（Email Routing）**。
2. 点 **开始使用 / 启用**，按提示点 **添加记录并启用**，Cloudflare 会自动添加 MX 和 TXT 记录。
   - 如果这个域名原来在别的服务商收邮件，要先删掉已有的 MX 记录，否则无法启用。
3. 切到 **路由规则（Routing rules）** 标签，找到页面底部的 **Catch-all 地址**，点 **编辑**：
   - 操作（Action）：**发送到 Worker（Send to a Worker）**
   - 目标（Destination）：你的 Worker（默认叫 **mail**）
   - 点 **保存**，确认开关是 **已启用**。

**为什么用 Catch-all**：用户可以随意起邮箱前缀，所以要把这个域名下所有地址的邮件都交给网站。发到没人创建过（或已过期）的地址的邮件：没设置 `ADMIN_PASSWORD` 时直接丢弃，不入库、不占额度；设置后会存进 Catch-all 邮箱，只在管理后台能看到，最后一封 7 天后自动清理，数据库达到硬水位时不再保存。设置了 `FORWARD_TO` 时都会转发一份。

---

## 第 4 步：验证

1. **打开网站**：在 **Workers 和 Pages → mail** 的概览页点开 `workers.dev` 地址（绑定了自己的域名就用那个网址），应该能看到首页。
2. **收信**：点 **一键新建** 得到一个地址，用 QQ 邮箱、Gmail 等真实邮箱给它发一封信。保持页面打开，邮件到达后会立即出现，不用刷新。首页那一行会直接显示验证码，点一下就能复制。
3. **用户账号**（设置了 `SESSION_SECRET` 才有）：**设置** 页最上面会出现「登录 / 注册」。注册一个账号，换一台设备登录，应该能看到同样的邮箱列表。
4. **安装到手机**：安卓用 Chrome 打开网站，点右上角菜单里的 **添加到主屏幕 / 安装应用**。

都正常的话，部署就完成了。

---

## 第 5 步：绑定自己的域名（可选）

部署完网站已经可以通过 `workers.dev` 地址访问。想用 `mail.a.com` 这样更好记的网址：

1. 进入 **Workers 和 Pages → mail → 设置（Settings）→ 域和路由（Domains & Routes）**，点 **添加（Add）→ 自定义域（Custom domain）**。
2. 填你想用的网址，比如 `mail.a.com`，点 **添加**。DNS 记录和 HTTPS 证书会自动创建，通常一两分钟内生效。

以后重新部署不会改动这里的设置。

`workers.dev` 地址会一直保留，方便你在自定义域出问题时也能打开网站。它返回的每个响应都带 `X-Robots-Tag: noindex`，搜索引擎不会收录，所以不会和你的域名抢排名。想彻底关掉它：把仓库里 `wrangler.jsonc` 的 `"workers_dev": true` 改成 `false` 再推送（只在后台关掉的话，下次部署会被重新打开）。

---

## 部署之后

### 全站邮件转发

设置 `FORWARD_TO` 后，发到本站**任意地址**的邮件（包括用户创建的邮箱，也包括没人创建过的 Catch-all 地址）都会额外转发一份到你指定的邮箱。网站照常收信、存库、实时推送、识别验证码，转发只是多发一份。

转发用的是 Email Routing 自带的转发功能，Cloudflare 规定**转发的目标邮箱必须先验证**，所以要分两步：

**第一步：在 Cloudflare 验证目标邮箱（只做一次）**

1. Cloudflare 后台点进任意一个收信域名，左侧菜单选 **电子邮件（Email）→ 电子邮件路由（Email Routing）**。
2. 切到 **目标地址（Destination addresses）** 标签，点 **添加目标地址（Add destination address）**，填你想接收转发的邮箱，比如你的 Gmail / QQ 邮箱。
3. 去那个邮箱找到 Cloudflare 发来的验证邮件（可能在垃圾箱），点里面的验证链接。
4. 回到 Cloudflare，确认这个地址的状态变成 **已验证（Verified）**。

目标地址是**账户级别**的：验证一次，账号下所有收信域名都能用，不用每个域名都做一遍。**不要在「路由规则」里新增规则或改动 Catch-all**，Catch-all 仍然保持「发送到 Worker → mail」，转发由网站来做。

**第二步：设置 `FORWARD_TO`**

1. 进入 **Workers 和 Pages → mail → 设置 → 变量和机密**，添加文本变量 `FORWARD_TO`，值填刚才验证过的邮箱，点 **部署**。
2. 往任意一个本站地址发一封测试信，你的邮箱应该很快收到这封信。

想关闭转发，删掉 `FORWARD_TO` 或把它清空即可。

**看转发有没有生效**：转发失败会写进 Worker 日志。到 **Workers 和 Pages → mail → 日志**，点「开始日志流」后再发一封信，失败时会看到以「转发」开头的说明。

**几点说明**：

- 转发失败（目标邮箱没验证、对方服务器拒收、10 秒超时等）**不会影响网站收信**，只会写一条日志，也不会重试。最常见的失败原因是目标邮箱没验证或验证后又被删掉了，按第一步重新验证即可。
- 转发的是原始邮件，发件人、主题、正文、附件都保持原样。额外加了一个 `X-Mail-Original-To` 头，写着这封信原本发给本站的哪个地址。
- 不能填本站收信域名（`MAIL_DOMAINS` 里的域名及其子域名）下的地址，否则会自己转给自己；填了这种地址或格式不对时，网站会直接不转发。
- 修改 `FORWARD_TO` 后，下一封邮件立即生效，不需要重新构建。
- 超过 10 MB 被网站拒收的邮件不会转发。
- 开启后你的邮箱会收到全站所有邮件，包括垃圾邮件，量可能很大。可以在你的邮箱里按 `X-Mail-Original-To` 头或收件人设置过滤规则。

### 自定义

| 想改什么 | 怎么改 |
| --- | --- |
| 网站图标 | 替换 `assets/brand-icon.png`（白底上的圆角方块图），运行 `npm run icons`，提交代码 |
| 邮件大小上限、邮箱数量上限等 | `src/lib/config.ts` |
| 限流次数 | `wrangler.jsonc` 的 `ratelimits` |
| 首页介绍和常见问题文字 | `src/lib/seo-copy.ts` |

改完推送到 GitHub（方式 A、B）或运行 `npm run release`（方式 C）即可生效。

> **开源协议提醒**：本项目以 [AGPL-3.0](../LICENSE) 发布。只要你改了代码并部署给别人用，就必须公开修改后的完整源代码：把仓库设为公开，并把 `src/lib/seo-copy.ts` 里的 `site.sourceCode` 改成你的仓库地址（显示在「关于本站 → 本站源代码」）。同时保留 `LICENSE` 和 `NOTICE` 文件。详见 [NOTICE](../NOTICE)。

---

## 更新到新版本

**方式 B（fork）**：在你的 GitHub 仓库页面点 **Sync fork → Update branch**，Cloudflare 会自动重新部署。

**方式 A（一键部署）**：一键部署创建的是独立仓库，不是 fork，GitHub 上没有同步按钮，要用命令行合并一次：

```bash
git clone https://github.com/<你的用户名>/<你的仓库名>.git
cd <你的仓库名>
git remote add upstream https://github.com/nebulafang/mail.git
git pull upstream main --allow-unrelated-histories -X theirs   # 以后再更新时去掉 --allow-unrelated-histories
git push
```

`-X theirs` 表示有冲突时以新版本为准。一键部署时 Cloudflare 往你仓库的 `wrangler.jsonc` 里写了数据库 ID，合并后这一行会消失，没关系，部署时会按数据库名字找到原来的数据库。**如果部署时改过数据库名称或 Worker 名称**，合并后检查 `wrangler.jsonc`：`database_name` 要是你的数据库名，否则会新建一个空数据库；`name` 要是你的 Worker 名称，否则构建会提示名称不匹配。不对的话改回来再推送。

推送后 Cloudflare 会自动重新部署。

**方式 C（命令行）**：`git pull` 后运行 `npm run release`。

数据库表结构的变化会在更新后第一次访问时自动完成，数据不受影响。

---

## 常见问题

### 构建失败

在 **Workers 和 Pages → mail → 部署（Deployments）** 里点失败的那次，查看构建日志：

- **提示 Worker 名称不匹配**：`wrangler.jsonc` 里的 `"name"` 要和 Cloudflare 后台的 Worker 名称一致。把它改成后台显示的名字，推送后会自动重新构建。

### 页面显示「This page couldn't load」

在 **Workers 和 Pages → mail → 日志（Logs）** 里点「开始日志流」，刷新出错的页面，查看具体报错。

浏览器控制台里的 `Error with Permissions-Policy header: Unrecognized feature` 是浏览器对 Cloudflare 默认响应头的提示，和页面是否正常无关，可以忽略。

### 网站打不开

- 先试 `workers.dev` 地址（在 **Workers 和 Pages → mail** 的概览页）。它能打开、自定义域打不开的话，确认 [第 5 步](#第-5-步绑定自己的域名可选) 的自定义域已添加，并且状态是「有效」，刚添加时可能要等几分钟。
- 第一次使用 Workers 的账号要先在 **Workers 和 Pages** 页面设置一次 `workers.dev` 子域，按页面提示填一个名字即可。
- 打开 `https://你的网址/api/config`，应该返回你的收信域名列表。如果是空的，检查 `MAIL_DOMAINS` 是否设置正确。

### 收不到邮件

1. 先看域名的 **Email Routing → 概览 / 活动日志（Activity log）**：这封邮件是被投递给 Worker 了，还是被拒绝了。没有记录的话，检查 MX 记录和 Catch-all 规则（[第 4 步](#第-4-步配置收信email-routing)）。
2. 再看 **Workers 和 Pages → mail → 日志（Logs）**：点「开始日志流」后再发一封信，查看实时报错。
3. 发到没人创建过的地址的邮件不会出现在任何收件箱，先在网站上创建这个地址再发信。
4. 确认收件地址的域名在 `MAIL_DOMAINS` 里。

### 打开了邮件转发，但我的邮箱收不到

1. 确认 `FORWARD_TO` 已设置，并且不是本站收信域名下的地址。
2. 看 **Workers 和 Pages → mail → 日志**：开始日志流后再发一封信，有以「转发」开头的失败说明就按说明处理。
3. 失败原因提到「验证 / verified」：目标邮箱没在 Email Routing 的 **目标地址** 里验证，按 [全站邮件转发](#全站邮件转发) 的第一步处理。注意 `FORWARD_TO` 要和验证过的邮箱**完全一致**。
4. 日志里没有报错但邮箱里没有：去邮箱的垃圾箱找找，或者看收信域名的 **Email Routing → 活动日志**，里面有每封转发的投递结果。

### 能收到，但要等几秒才出现

实时推送没连上，页面自动退回了每 30 秒一次的轮询，功能不受影响。可以在 **日志** 里查看访问 `/api/live` 时的报错，重新部署一次通常就能恢复。

### 设置页没有「登录 / 注册」

检查 `SESSION_SECRET` 是否已添加、长度是否至少 32 个字符。添加后刷新页面即可。

### 登录提示「尝试次数太多」

同一个 IP 每分钟最多尝试 10 次，等一分钟再试。

### 可以给 Worker 换个名字吗

可以。一键部署时直接在配置页改就行，Cloudflare 会把新名字写进你仓库的 `wrangler.jsonc`。用方式 B、C 部署的话，把 `wrangler.jsonc` 里的 `"name"` 改成新名字再部署。

改名后记得：Email Routing 的 Catch-all 目标选新名字；`workers.dev` 地址也会变成 `https://<新名字>.<你的子域>.workers.dev`。本文里的 **Workers 和 Pages → mail** 都换成你的 Worker 名称。

---

## 费用和限制

- **免费套餐够个人使用**：Workers、D1、Durable Objects 的免费额度都包含在内。如果日志里出现 CPU 超时，通常是收到很大的邮件时解析太慢，可以升级到 Workers 付费版（每月 5 美元）。
- **附件**：为节省 D1 空间，附件只保存文件名和大小，不保存内容，界面上显示「未保存」；整封邮件超过 10 MB 会被拒收。
- **垃圾邮件**：开启 Catch-all 后，发到这个域名的所有邮件都会交给 Worker，每封算一次 Worker 请求；没设置 `ADMIN_PASSWORD` 时只有发给有效邮箱的才入库，发给不存在地址的垃圾邮件不占 D1 写入和存储；设置后这些邮件也会存进 Catch-all 邮箱，垃圾邮件多的域名要留意存储用量。注意 D1 的存储用量（免费版单个数据库最大 500 MB）。数据库接近上限时，收信会自动少存正文，定时任务还会自动删除附件内容、Catch-all 邮箱、旧邮件的 HTML 等低价值数据腾出空间。
- **免费额度**：长期运行建议做 [第 5 步](#第-5-步绑定自己的域名可选) 绑定自己的域名，首页缓存只在自定义域名上生效。
- **访问权限**：不登录时创建的是公共地址，任何知道地址的人都能读信、删信；账号邮箱默认仅所有者可见，主动共享后成员或链接持有者也能按授权访问。设置了 `ADMIN_PASSWORD` 时管理员能在后台查看所有账号邮箱和 Catch-all 邮件；能访问 D1 数据库的人技术上也可以读取所有邮件；设置 `FORWARD_TO` 后目标邮箱也会收到一份。
- **删除与保留**：删除邮件、清空收件箱、删除邮箱和注销账号都会立即永久删除相关数据，无法恢复；每个邮箱（包括永久邮箱）只保留最近 1,000 封邮件，详见 [README](../README.md#访问权限与数据保留)。
- **HTTPS**：证书由 Cloudflare 自动签发，HTTP 请求会自动跳转到 HTTPS。
