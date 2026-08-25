# PathMark landing page

Static multilingual landing page for Cloudflare Pages.

Production URL: `https://pathmark.elenchlab.app`

## Local preview

```bash
python3 -m http.server 4173 --directory web
```

Open a completed locale such as `http://localhost:4173/en/`, `http://localhost:4173/ja/`, or `http://localhost:4173/ko/`.

Privacy policy pages used by the browser stores are available under every completed locale at `/<locale>/privacy/`.

## Locale workflow

`locales.json` is the source of truth for planned and completed website locales. A locale marked `complete` must also have a matching extension locale, translated home page, translated privacy page, and locale-specific Chrome Web Store UTM values.

After adding or completing a locale, synchronize generated browser routing, hreflang tags, and the sitemap, then verify the complete surface:

```bash
node web/scripts/sync-locales.mjs
node web/scripts/verify-locales.mjs
```

Before declaring the full language rollout complete, run verification with `--require-all`.

## Cloudflare Pages settings

- Project: `pathmark`
- Production branch: `main`
- Preview branch: `dev`
- Build watch path: `web/*`
- Framework preset: None
- Build command: empty
- Build output directory: `web`
- Root directory: repository root
