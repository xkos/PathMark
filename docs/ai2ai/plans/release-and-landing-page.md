# GitHub 发布与引流页方案

## 目标

- `main` 与 Pull Request 自动测试、构建 Chromium 扩展，并上传 ZIP/CRX 制品。
- `v*` 标签在构建成功后自动创建 GitHub Release。
- `web/` 提供可直接部署到 Cloudflare Pages 的静态多语言引流页。

## CRX 签名

CRX 的扩展 ID 来源于签名公钥，因此必须长期复用同一把 RSA 私钥。私钥不得提交到仓库，应以 base64 形式保存到 GitHub Actions Secret `CRX_PRIVATE_KEY_B64`。

首次生成密钥：

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out pathmark.pem
base64 < pathmark.pem | tr -d '\n'
```

将第二条命令的输出保存为仓库 Secret。`pathmark.pem` 应离线备份；丢失后无法继续生成相同扩展 ID 的 CRX。

普通 `main`/PR 构建不接触签名密钥，只产生保留 14 天的 ZIP artifact。推送 `v*` 标签时，独立的 `release` environment job 才会读取 Secret，生成 CRX、SHA-256 校验文件和 GitHub Release；未配置密钥时发布会明确失败，而不会产生扩展 ID 不稳定的临时 CRX。

## Cloudflare Pages

- Framework preset：None
- Build command：留空
- Build output directory：`web`
- Root directory：仓库根目录

根路径根据浏览器语言转到 `/zh-CN/` 或 `/en/`，两个语言页都有独立 canonical 与 hreflang。

正式域名为 `https://pathmark.elenchlab.app`，两个语言页面、`robots.txt` 与 `sitemap.xml` 均使用该域名。
