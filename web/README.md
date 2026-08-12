# PathMark landing page

Static multilingual landing page for Cloudflare Pages.

Production URL: `https://pathmark.elenchlab.app`

## Local preview

```bash
python3 -m http.server 4173 --directory web
```

Open `http://localhost:4173/zh-CN/` or `http://localhost:4173/en/`.

## Cloudflare Pages settings

- Project: `pathmark`
- Production branch: `main`
- Preview branch: `dev`
- Build watch path: `web/*`
- Framework preset: None
- Build command: empty
- Build output directory: `web`
- Root directory: repository root
