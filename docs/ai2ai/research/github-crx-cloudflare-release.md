# GitHub Actions、CRX3 与 Cloudflare Pages 发布调研

> 调研日期：2026-08-12
> 范围：只采用 GitHub、Google Chrome/Chromium、Cloudflare 的官方资料。

## 结论摘要

建议把发布拆成两条流水线：

1. 所有 `push` / `pull_request` 都构建并测试，上传 ZIP 作为短期 GitHub Actions artifact。
2. 只有形如 `v*` 的 tag 才读取 CRX 私钥，生成固定 ID 的 CRX3，并把 ZIP、CRX、SHA-256 校验文件发布为 GitHub Release assets。

营销站放在仓库根目录的 `web/`，构建后输出 `web/dist/`。Cloudflare Pages 可直接连接 GitHub；若 Pages 的 Root directory 设置为 `web`，Build command 使用 `npm ci && npm run build`，Build output directory 使用 `dist`。多语言采用可索引的显式路径，例如 `/zh-CN/` 和 `/en/`，根路径提供语言选择或轻量跳转。

## 1. GitHub Actions：构建产物与 Release

### 官方行为

- Workflow artifact 用于在 job 之间传递文件，以及在 workflow 结束后保留构建输出；GitHub 官方提供 `actions/upload-artifact` 和 `actions/download-artifact`。[Workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- `actions/upload-artifact@v4` 支持为单个 artifact 设置 `retention-days`，但不能超过仓库、组织或企业配置的上限。[Store and share data with workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)
- Release asset 是与 GitHub Release 绑定的公开下载文件，和会过期的 workflow artifact 不同。官方 REST API 要求上传原始二进制内容，Release 上传需要 `Contents: write` 权限。[Release assets REST API](https://docs.github.com/en/rest/releases/assets)
- Workflow 的 `permissions` 可以最小化授权；GitHub 明确说明 `contents: write` 允许创建 Release，而未声明的权限会被设为 `none`。[Workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax-for-github-actions#permissions)
- GitHub CLI 的 `gh release create <tag> <files...> --generate-notes` 可以创建 Release 并直接附加文件。[gh release create](https://cli.github.com/manual/gh_release_create)

### 对 PathMark 的推荐实现

- CI workflow：
  - 触发：`push`、`pull_request`、`workflow_dispatch`。
  - 权限：`contents: read`。
  - 执行：`npm ci`、测试、构建扩展、制作 ZIP。
  - 上传：`actions/upload-artifact@v4`，例如保留 14 天。
- Release workflow：
  - 触发：`push.tags: ['v*']`，并可补充 `workflow_dispatch`。
  - 在读取签名私钥前再次运行测试和构建，不复用未经验证的外部 artifact。
  - 仅此 job 设置 `permissions: contents: write`。
  - 校验 tag 版本与 `chromium/public/manifest.json` 的 `version` 一致，防止发布名与扩展版本漂移。
  - 生成：`pathmark-<version>-chromium.zip`、`pathmark-<version>.crx`、`SHA256SUMS`。
  - 使用 `gh release create "$GITHUB_REF_NAME" ... --verify-tag --generate-notes` 发布。

Workflow artifact 适合开发者下载测试；面向用户的稳定下载链接应指向 Release asset。若希望进一步证明二进制来自该 workflow，可追加 GitHub 的 artifact attestation；GitHub 官方说明它会生成基于 Sigstore 的构建来源声明。[Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

## 2. 使用 Chrome 生成 CRX3

### Chrome 能否在 CI / 无界面环境打包

可以直接使用 Chrome 自身的命令行打包功能：

```bash
google-chrome \
  --pack-extension=/absolute/path/to/pathmark-extension \
  --pack-extension-key=/absolute/path/to/pathmark.pem
```

Chrome 官方文档列出了 `--pack-extension` 与 `--pack-extension-key` 两个参数。[Self-host for Linux: Package through command line](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux#package-through-command-line) Chromium 当前源码也表明，检测到 `--pack-extension` 后会在正常浏览器启动流程之前完成打包并立即退出。[Chromium `chrome_main_delegate.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/app/chrome_main_delegate.cc)

因此 CI 中不需要启动图形会话，也不需要 Playwright/Xvfb。这里的准确说法是“命令模式下打包并提前退出”，而不是依赖网页自动化的 `--headless` 模式；官方打包示例本身没有要求 `--headless`。建议不要额外加入未经官方打包文档要求的 `--headless` 或 `--no-sandbox`，除非实际 runner 环境证明必要。

### 固定签名密钥与扩展 ID

- 首次打包会生成 `.crx` 和包含私钥的 `.pem`；Chrome 官方明确要求不要遗失该私钥，因为后续更新需要同一把密钥。[Self-host for Linux: Create and update CRX](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux#create-crx-locally)
- Chromium 文档说明扩展 ID 基于公钥哈希；换一把密钥就会得到不同 ID，并可能造成同一扩展出现多个安装实例及独立本地数据。[Chromium extension packaging](https://chromium.googlesource.com/chromium/chromium/+/HEAD/chrome/common/extensions/docs/templates/articles/packaging.html)
- Chromium 的 CRX3 格式定义进一步说明：开发者签名 proof 中，公钥 SHA-256 的前 128 位对应 `crx_id`；这解释了为何固定签名私钥会产生固定扩展 ID。[Chromium `crx3.proto`](https://chromium.googlesource.com/chromium/src/+/HEAD/components/crx_file/crx3.proto)
- Chrome Web Store 的 Verified CRX Uploads 文档同样要求妥善保管私钥，不得上传到公开仓库，并给出了使用 Chrome 终端命令签名 CRX 的方式。[Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update/#opt-in-verified-crx-uploads)

### 密钥安全约束

推荐做法：

1. 离线生成并备份唯一的 PathMark PEM 私钥；不要提交进 Git，不要加入 ZIP/CRX artifact，也不要复制到 `chromium/dist`。
2. 将 PEM 作为 GitHub repository 或 environment secret 保存，例如 `CRX_PRIVATE_KEY`。GitHub secrets 在提交给 GitHub 前使用 Libsodium sealed boxes 加密，只有 workflow 显式引用时才可读取。[GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
3. 在 runner 中把 secret 写到 `$RUNNER_TEMP/pathmark.pem`，设置文件权限 `0600`，打包完成后删除。禁止 `set -x`，禁止输出 secret、PEM 或其派生内容。
4. 更推荐使用受保护的 GitHub Environment，例如 `release`，为签名 job 增加人工审批，并将 secret 只配置在该 Environment。
5. PEM 属于结构化数据；GitHub 提醒结构化 secret 的日志自动遮蔽可靠性较低。因此不要依赖日志脱敏，应从根源上避免输出。若为保留换行而存成 Base64，应明确 Base64 只是一种传输编码，不提供额外加密。[Secrets reference](https://docs.github.com/en/actions/reference/security/secrets#security)
6. PR workflow 不签名；尤其不要让来自 fork 的不受信任代码进入能读取私钥的 job。

### CRX 的分发边界

生成 CRX 不等于所有用户都能从营销页直接安装。Chrome 官方当前只支持两类正式分发：Chrome Web Store，以及由管理员策略控制的托管环境自托管。Windows 和 macOS 普通用户不能直接安装站外自托管 CRX；Linux 用户可以手工安装站外 packed extension。[Distribute your extension](https://developer.chrome.com/docs/extensions/how-to/distribute)

所以 Release 应同时包含：

- ZIP：用于 Chrome Web Store / Edge Add-ons 上传以及开发者模式加载。
- CRX3：用于完整性校验、Linux、自托管或受管部署场景。

营销页不应把 CRX 下载按钮描述成 Windows/macOS 的“一键安装”。在商店尚未上线时，应明确写成“下载开发者版本 / 手动安装”，正式面向大众的主 CTA 最终应链接 Chrome Web Store 和 Microsoft Edge Add-ons。

## 3. Cloudflare Pages：`web/` 多语言静态站

### 官方部署模型

- Cloudflare Pages 支持任意静态 HTML 网站；静态站需指定构建输出目录，站点根路径应包含顶层 `index.html`，否则 `*.pages.dev` 根路径会返回 404。[Deploy a static HTML site](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- Git 集成会把 Build output directory 的内容上传为站点；monorepo 可单独设置 Root directory。[Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/#configure-your-build-settings)
- Pages 会为连接的 Git 仓库自动构建部署，并为 Pull Request 提供 preview deployment。[Static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- `_redirects` 必须放进最终静态输出目录。Cloudflare 明确说明 `_redirects` 不支持按浏览器语言条件匹配，并且 Pages Functions 命中的请求不会应用 `_redirects`。[Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/)
- Pages 对 `about/index.html` 这类文件提供扩展名省略和目录式 URL，适合输出 `/en/`、`/zh-CN/` 结构。[Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- Pages 当前限制单个静态资源最大 25 MiB。因此即使 CRX 目前较小，也建议由 GitHub Release 或扩展商店承载下载，Pages 只做引流，避免把站点部署与扩展二进制大小绑定。[Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

### 推荐目录与 Pages 配置

```text
web/
  package.json
  src/
  public/
    _headers
    robots.txt
  dist/               # 构建输出，不提交
    index.html
    en/index.html
    zh-CN/index.html
```

推荐在 Cloudflare Pages 中配置：

```text
Root directory: web
Build command: npm ci && npm run build
Build output directory: dist
Production branch: main
```

也可以保持仓库根目录为 Root directory，此时命令改为 `npm --prefix web ci && npm --prefix web run build`，输出目录为 `web/dist`；但把 Root directory 设置成 `web` 更清晰，也避免扩展工程与营销站依赖互相干扰。

### 多语言实现建议

- 为每种语言生成独立可访问、可索引的静态路径：`/zh-CN/`、`/en/`。
- 每页设置准确的 `<html lang>`、本语言标题/描述、canonical，并使用 `hreflang` 互相指向。
- `/` 提供可见的语言切换，同时可用少量客户端脚本根据 `navigator.languages` 首次建议语言；应保留手动选择并持久化，不强制覆盖用户选择。
- 如果必须在边缘端根据 `Accept-Language` 返回 302，应使用 Pages Function 或 Worker；不要尝试用 `_redirects`，因为官方明确不支持按语言条件重定向。Cloudflare 也提供了用 Pages/Workers `HTMLRewriter` 做语言适配的官方教程。[Localize a website with HTMLRewriter](https://developers.cloudflare.com/pages/tutorials/localize-a-website/)
- 在 `public/_headers` 中为纯静态响应设置 CSP、`X-Content-Type-Options`、`Referrer-Policy` 等安全头；若未来引入 Pages Functions，函数响应必须自行设置这些 header，因为静态 `_headers` 规则不应用于 Functions 响应。[Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- 对当前纯静态引流站，优先 Pages，不必一开始引入 Worker。只有需要边缘语言协商、动态下载版本 API、A/B 测试或其他服务端逻辑时再加 Worker / Pages Functions。

## 推荐的最终流水线形态

```text
PR / branch push
  -> test Chromium extension
  -> build extension ZIP
  -> build web/dist
  -> upload short-lived Actions artifacts
  -> Cloudflare Pages preview (由 Git 集成完成)

vX.Y.Z tag
  -> clean checkout
  -> test + build
  -> version consistency check
  -> restore protected PEM into RUNNER_TEMP
  -> Chrome command-mode CRX3 packing
  -> SHA256SUMS
  -> GitHub Release: ZIP + CRX + checksums
  -> Cloudflare Pages production deploy from main/tag strategy
```

建议先实现两个独立 workflow：`ci.yml` 与 `release.yml`。站点部署交给 Cloudflare Pages Git integration，避免 GitHub Actions 再持有 Cloudflare API token；只有未来需要 GitHub workflow 精确控制部署顺序时，才改用 Wrangler Direct Upload。
