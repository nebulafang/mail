import getpass
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
DEFAULT_TOPICS = [
    "cloudflare-workers",
    "cloudflare-d1",
    "durable-objects",
    "temporary-email",
    "disposable-email",
    "email",
    "nextjs",
    "self-hosted",
]
TOPIC_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,49}")
SOURCE_REPO = "nebulafang/mail"
SOURCE_OWNER = "nebulafang"

FILES = {
    "CODE_OF_CONDUCT.md": """# 贡献者行为准则

## 我们的承诺

身为社区成员、贡献者和维护者，我们承诺：无论年龄、体型、是否残障、族裔、性征、性别认同与表达、经验水平、教育程度、社会经济地位、国籍、外貌、种族、宗教信仰、性取向如何，都让每个人在参与本社区时不受骚扰。

我们承诺以开放、友善、多元、包容和健康的方式参与和行事。

## 我们的准则

有助于营造积极环境的行为包括：

- 对他人保持同理心与善意
- 尊重不同的观点、看法和经验
- 给出并大方接受建设性的反馈
- 为自己的错误承担责任，向受影响的人道歉，并从中学习
- 关注对整个社区最有利的事，而不只是对个人有利的事

不可接受的行为包括：

- 使用带有性暗示的言语或图像，以及任何形式的性关注或性骚扰
- 挑衅、侮辱或贬损的评论，以及人身或政治攻击
- 公开或私下的骚扰
- 未经明确许可，公开他人的私人信息，例如住址或电子邮箱地址
- 其他在职业场合中可以合理认定为不恰当的行为

## 执行责任

社区维护者有责任阐明和执行可接受行为的标准，并对任何不当、威胁、冒犯或有害的行为采取适当、公平的纠正措施。

维护者有权删除、编辑或拒绝与本准则不符的评论、提交、代码、Wiki 编辑、Issue 和其他贡献，并会在适当时说明处理理由。

## 适用范围

本准则适用于所有社区空间，也适用于个人在公共场合正式代表社区的情形，例如使用官方邮箱、通过官方社交账号发帖，或在线上、线下活动中担任指定代表。

## 举报与执行

如遇辱骂、骚扰或其他不可接受的行为，请通过 GitHub 私信联系维护者 [@nebulafang](https://github.com/nebulafang)，或使用 [私密报告](https://github.com/nebulafang/mail/security/advisories/new) 渠道。所有投诉都会被及时、公正地审查和调查。

所有维护者都有义务尊重举报者的隐私和安全。

## 执行指引

维护者会按以下社区影响指引，决定对违反本准则的行为采取的措施：

1. **更正**：针对不恰当的用语或其他被认为不专业、不受欢迎的行为。维护者会私下提出书面警告，说明违规的性质和原因，必要时要求公开道歉。
2. **警告**：针对单次事件或一系列行为。在规定时间内不得与相关人员互动，包括不得主动与维护者互动；违反可能导致临时或永久封禁。
3. **临时封禁**：针对严重违规，包括持续的不当行为。在规定时间内禁止与社区进行任何形式的互动或公开交流。
4. **永久封禁**：针对一再违反社区规范的行为，包括持续骚扰个人，或攻击、贬低某一类人群。永久禁止参与社区的任何公开互动。

## 致谢

本行为准则改编自 [Contributor Covenant](https://www.contributor-covenant.org) 2.1 版，原文见 <https://www.contributor-covenant.org/version/2/1/code_of_conduct.html>。执行指引参考了 [Mozilla 的行为准则执行阶梯](https://github.com/mozilla/diversity)。
""",
    "CONTRIBUTING.md": """# 参与贡献

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
""",
    "SECURITY.md": """# 安全策略

## 支持的版本

只维护 `main` 分支的最新代码。自行部署的实例请定期同步上游后重新部署。

## 报告漏洞

请**不要**通过公开 Issue、讨论区或 PR 报告安全问题。

请通过 GitHub 的私密漏洞报告提交：打开仓库的 [Security → Report a vulnerability](https://github.com/nebulafang/mail/security/advisories/new)，说明以下内容：

- 影响范围，例如越权读取邮件、会话劫持、XSS
- 复现步骤或概念验证
- 你认为合适的修复方向（可选）

我们会在 7 天内确认收到，修复后在安全公告中致谢（如果你愿意署名）。请在修复发布前不要公开细节。

## 设计上的取舍

下面这些是有意为之或已知的限制，不属于漏洞：

- **匿名公共邮箱只靠地址保护。** 任何知道完整地址的人都能读信和删信。按地址查询的接口按 IP 限流，用来减缓枚举，但随机地址本身是便于记忆的格式，敏感用途请登录后使用账号邮箱。
- **站点运营者可以读取所有邮件。** 能访问 D1 数据库的人在技术上可以读取全部数据；设置 `ADMIN_PASSWORD` 后，管理员也能在后台查看。
- **管理员会话不能单独撤销。** 管理员会话是无状态的签名 Cookie，有效期 7 天；需要立即让所有管理员会话失效时，请修改 `ADMIN_PASSWORD`。
- **登录限流按 IP 计算。** 没有按用户名或全站做限流，避免攻击者故意输错密码把正常用户或管理员锁在外面。请为账号和 `ADMIN_PASSWORD` 使用足够长的随机密码。
- **密码哈希使用 PBKDF2-SHA256，迭代 10 万次。** 这是 Cloudflare Workers 的 Web Crypto 允许的上限。
- **邮件 HTML 中的远程图片会直接加载。** 邮件在没有脚本权限的沙箱 iframe 中显示，并且禁止加载远程字体等其他资源，但远程图片仍会加载，发件人可以借此得知邮件被打开。
""",
    ".github/ISSUE_TEMPLATE/bug_report.yml": """name: 问题反馈
description: 报告一个可以复现的错误
labels: [bug]
body:
  - type: textarea
    id: what
    attributes:
      label: 发生了什么
      description: 描述你看到的现象，以及你期望的结果
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: 复现步骤
      placeholder: |
        1. 打开 ...
        2. 点击 ...
        3. 看到 ...
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: 版本
      description: 部署的提交哈希或日期
  - type: dropdown
    id: environment
    attributes:
      label: 运行环境
      options:
        - 已部署到 Cloudflare
        - 本地 wrangler dev
        - 本地 next dev
    validations:
      required: true
  - type: input
    id: browser
    attributes:
      label: 浏览器和设备
      placeholder: iOS 18 Safari / Chrome 140 on Windows
  - type: textarea
    id: logs
    attributes:
      label: 日志或截图
      description: Worker 日志、浏览器控制台报错等。请先去掉邮箱地址、密钥等隐私信息
      render: text
""",
    ".github/ISSUE_TEMPLATE/feature_request.yml": """name: 功能建议
description: 提出新功能或改进
labels: [enhancement]
body:
  - type: markdown
    attributes:
      value: 本项目只做收信，不提供撰写、发信、SMTP 或 IMAP 功能，这类建议不会被采纳。
  - type: textarea
    id: problem
    attributes:
      label: 想解决什么问题
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: 建议的做法
  - type: textarea
    id: alternatives
    attributes:
      label: 考虑过的其他方案
""",
    ".github/ISSUE_TEMPLATE/config.yml": """blank_issues_enabled: false
contact_links:
  - name: 报告安全漏洞
    url: https://github.com/nebulafang/mail/security/advisories/new
    about: 安全问题请私下报告，不要公开提 Issue
  - name: 部署指南
    url: https://github.com/nebulafang/mail/blob/main/docs/deploy.md
    about: 部署和 Email Routing 配置问题请先查看部署指南
""",
    ".github/pull_request_template.md": """## 改动内容



## 验证方式

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] 涉及界面的改动已在 `npx wrangler dev` 中手动验证

## 检查清单

- [ ] 代码里没有新增注释
- [ ] 没有引入发信相关功能
- [ ] 修改数据库模型后已运行 `npm run db:generate` 并提交迁移文件
""",
    ".github/workflows/ci.yml": """name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
""",
    ".github/dependabot.yml": """version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    ignore:
      - dependency-name: eslint
        update-types: [version-update:semver-major]
      - dependency-name: typescript
        update-types: [version-update:semver-major]
      - dependency-name: vitest
        update-types: [version-update:semver-major]
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
""",
}

GROUPS = [
    ("社区文件（行为准则、贡献指南、安全策略）", ["CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "SECURITY.md"]),
    (
        "Issue / PR 模板",
        [
            ".github/ISSUE_TEMPLATE/bug_report.yml",
            ".github/ISSUE_TEMPLATE/feature_request.yml",
            ".github/ISSUE_TEMPLATE/config.yml",
            ".github/pull_request_template.md",
        ],
    ),
    ("CI 和 Dependabot", [".github/workflows/ci.yml", ".github/dependabot.yml"]),
]


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(f"HTTP {status}: {message}")
        self.status = status


class GitHub:
    def __init__(self, token):
        self.token = token

    def call(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            API + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "repo-setup-script",
                **({"Content-Type": "application/json"} if data else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read().decode(errors="replace")
            try:
                message = json.loads(raw).get("message", raw)
            except ValueError:
                message = raw
            raise ApiError(error.code, message) from None
        except urllib.error.URLError as error:
            raise ApiError(0, f"网络错误：{error.reason}") from None

    def get(self, path):
        return self.call("GET", path)


def ask(prompt, default=""):
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        answer = ""
    return answer or default


def ask_bool(prompt, default):
    hint = "Y/n" if default else "y/N"
    while True:
        try:
            answer = input(f"{prompt} [{hint}]: ").strip().lower()
        except EOFError:
            answer = ""
        if not answer:
            return default
        if answer in ("y", "yes", "是", "1"):
            return True
        if answer in ("n", "no", "否", "0"):
            return False
        print("  请输入 y 或 n")


def ask_repo_name(prompt, default):
    while True:
        repo = ask(prompt, default)
        if re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
            return repo
        print("  格式应为 owner/name")


def section(title):
    print(f"\n── {title} ──")


def gh_cli_token():
    if not shutil.which("gh"):
        return None
    result = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None


def choose_token():
    candidates = [(f"环境变量 {name}", os.environ[name]) for name in ("GITHUB_TOKEN", "GH_TOKEN") if os.environ.get(name)]
    cli = gh_cli_token()
    if cli:
        candidates.append(("gh 命令行当前登录的账号", cli))
    for source, token in candidates:
        if ask_bool(f"检测到 {source} 的 token，使用它", True):
            return token
    while True:
        token = getpass.getpass("输入 GitHub token（输入内容不显示）: ").strip()
        if token:
            return token


def git_remote_repo():
    if not shutil.which("git"):
        return ""
    result = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
    match = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?/?$", result.stdout.strip())
    return match.group(1) if match else ""


def choose_repo(gh):
    while True:
        repo = ask_repo_name("仓库（owner/name）", git_remote_repo())
        try:
            info = gh.get(f"/repos/{repo}")
        except ApiError as error:
            print(f"  读取失败：{error}")
            continue
        if not info.get("permissions", {}).get("admin"):
            print("  这个 token 对该仓库没有管理员权限，换一个仓库或 token")
            continue
        return repo, info


def choose_topics(current):
    print(f"当前主题标签：{', '.join(current) or '（无）'}")
    if not ask_bool("设置主题标签", True):
        return None
    while True:
        answer = ask("主题标签（逗号分隔，输入 - 清空）", ", ".join(DEFAULT_TOPICS))
        if answer == "-":
            return []
        topics = list(dict.fromkeys(t.strip().lower() for t in re.split(r"[,，\s]+", answer) if t.strip()))
        invalid = [t for t in topics if not TOPIC_RE.fullmatch(t)]
        if invalid:
            print(f"  不合法：{', '.join(invalid)}（只能用小写字母、数字和连字符，最长 50 个字符）")
        elif len(topics) > 20:
            print("  最多 20 个主题标签")
        else:
            return None if sorted(topics) == sorted(current) else topics


def render(content, link_repo):
    owner = link_repo.split("/")[0]
    return content.replace(f"github.com/{SOURCE_REPO}/", f"github.com/{link_repo}/").replace(
        f"[@{SOURCE_OWNER}](https://github.com/{SOURCE_OWNER})", f"[@{owner}](https://github.com/{owner})"
    )


def blob_sha(text):
    data = text.encode()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def choose_files(gh, repo, info):
    paths = []
    for title, group in GROUPS:
        if ask_bool(f"提交{title}", True):
            paths.extend(group)
    if not paths:
        return None
    link_repo = ask_repo_name("文件里的链接（安全报告入口、部署指南、维护者）指向哪个仓库", repo if not info["private"] else SOURCE_REPO)
    branch = info["default_branch"]
    try:
        head = gh.get(f"/repos/{repo}/git/ref/heads/{urllib.parse.quote(branch)}")["object"]["sha"]
    except ApiError as error:
        if error.status in (404, 409):
            print("  仓库还没有任何提交，无法通过 API 提交文件，请先推送一次代码")
            return None
        raise
    tree = gh.get(f"/repos/{repo}/git/trees/{head}?recursive=1")
    existing = {item["path"]: item["sha"] for item in tree["tree"] if item["type"] == "blob"}
    changes = []
    for path in paths:
        content = render(FILES[path], link_repo)
        sha = existing.get(path)
        if sha != blob_sha(content):
            changes.append((path, content, "更新" if sha else "新增"))
    if not changes:
        print("  这些文件都已是最新内容")
        return None
    print("\n将要提交：")
    for path, _, kind in changes:
        print(f"  {kind} {path}")
    direct = not ask_bool(f"新建分支并开 Pull Request（选 n 则直接提交到 {branch}）", True)
    target = branch
    if not direct:
        while True:
            target = ask("新分支名", "repo-setup")
            try:
                gh.get(f"/repos/{repo}/git/ref/heads/{urllib.parse.quote(target)}")
                print("  这个分支已存在，换一个名字")
            except ApiError as error:
                if error.status != 404:
                    raise
                break
    message = ask("提交说明", "添加社区文件、Issue/PR 模板、CI 与 Dependabot 配置")
    return {"head": head, "base": branch, "target": target, "direct": direct, "changes": changes, "message": message}


def commit_files(gh, repo, plan):
    base_tree = gh.get(f"/repos/{repo}/git/commits/{plan['head']}")["tree"]["sha"]
    entries = [{"path": path, "mode": "100644", "type": "blob", "content": content} for path, content, _ in plan["changes"]]
    tree = gh.call("POST", f"/repos/{repo}/git/trees", {"base_tree": base_tree, "tree": entries})
    commit = gh.call("POST", f"/repos/{repo}/git/commits", {"message": plan["message"], "tree": tree["sha"], "parents": [plan["head"]]})
    if plan["direct"]:
        gh.call("PATCH", f"/repos/{repo}/git/refs/heads/{urllib.parse.quote(plan['base'])}", {"sha": commit["sha"], "force": False})
        return f"已提交到 {plan['base']}：{commit['html_url']}"
    gh.call("POST", f"/repos/{repo}/git/refs", {"ref": f"refs/heads/{plan['target']}", "sha": commit["sha"]})
    lines = [f"- {kind} `{path}`" for path, _, kind in plan["changes"]]
    pr = gh.call(
        "POST",
        f"/repos/{repo}/pulls",
        {"title": plan["message"], "head": plan["target"], "base": plan["base"], "body": "\n".join(lines)},
    )
    return f"已创建 Pull Request：{pr['html_url']}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("GitHub 仓库一键配置：主题标签、社区文件、Issue/PR 模板、CI 与 Dependabot。按 Ctrl+C 随时退出。")

    section("登录")
    gh = GitHub(choose_token())
    try:
        print(f"已登录：{gh.get('/user')['login']}")
    except ApiError as error:
        sys.exit(f"token 无效：{error}")

    section("仓库")
    repo, info = choose_repo(gh)
    print(f"{info['full_name']}（{'私有' if info['private'] else '公开'}），默认分支 {info['default_branch']}")

    section("主题标签")
    topics = choose_topics(info.get("topics") or [])

    section("仓库文件")
    plan = choose_files(gh, repo, info)

    if topics is None and plan is None:
        print("\n没有需要修改的内容。")
        return

    section("确认")
    if topics is not None:
        print(f"主题标签设置为：{', '.join(topics) or '（清空）'}")
    if plan:
        where = f"直接提交到 {plan['base']}" if plan["direct"] else f"提交到新分支 {plan['target']} 并开 Pull Request"
        print(f"{len(plan['changes'])} 个文件，{where}")
    if not ask_bool(f"确认对 {repo} 执行", False):
        print("已取消，没有做任何修改。")
        return

    section("执行")
    failures = 0
    if topics is not None:
        try:
            result = gh.call("PUT", f"/repos/{repo}/topics", {"names": topics})
            print(f"• 主题标签：{', '.join(result['names']) or '（无）'}")
        except ApiError as error:
            failures += 1
            print(f"• 主题标签失败：{error}")
    if plan:
        try:
            print(f"• {commit_files(gh, repo, plan)}")
        except ApiError as error:
            failures += 1
            hint = "（提交 workflow 文件需要 token 带 workflow 权限）" if error.status in (403, 404) else ""
            print(f"• 提交文件失败：{error}{hint}")
    print(f"\n完成，{failures} 项失败。" if failures else "\n全部完成。")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已退出。")
        sys.exit(130)
