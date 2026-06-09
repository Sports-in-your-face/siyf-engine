# siyf-engine

Cloud-hosted sports engine for [Sports in your face!](https://github.com/Sports-in-your-face) — parsers, scoreboard orchestration, parse adjuster, and live smoke harness.

**Users never run this repo.** The Chrome extension consumes the engine; [siyf-watch](https://github.com/Sports-in-your-face/siyf-watch) and GitHub Actions verify it daily.

## What's inside

```
engine/           Sport engines, sources, core merge/cache/fetch
engine/adjuster/  Parse adjuster — registry, invariants, chaos sim, live smoke
services/parsers/ ESPN → Game parsers + sport context
config/           SIYF-API + CDN + sport profiles
utils/            Coercion, timing, assets
types.ts          Shared domain types
```

## Quality gates (automated)

| Script | Ring | What |
|--------|------|------|
| `npm run drift:check` | 1 | Golden fixtures + invariants + kill switch |
| `npm run drift:chaos` | 2 | Schema chaos simulator |
| `npm run drift:merge` | 6 | Merge + odds normalization |
| `npm run drift:kill` | 7 | Paid API kill switch stress |
| `npm run drift:live` | 3 | Live ESPN/AN smoke via SIYF-API |

CI runs on every push to `main` (`.github/workflows/engine-ci.yml`).

## Chrome extension consumption

`siyf-chrome` installs this package from GitHub and junctions it on `npm install`:

```
src/engine   → node_modules/@sports-in-your-face/siyf-engine/engine
src/config   → …/config
src/services → …/services
src/utils    → …/utils
```

Update everyone's engine without a local rebuild:

```bash
cd siyf-chrome
npm run engine:update
```

Push a fix here → users/extensions pick it up on next `engine:update` or fresh `npm ci`.

## Related repos

| Repo | Role |
|------|------|
| [siyf-api](https://github.com/Sports-in-your-face/siyf-api) | Cloudflare worker proxy (ESPN, odds, BDL) |
| [siyf-watch](https://github.com/Sports-in-your-face/siyf-watch) | Daily makesure cron + API pulse |
| siyf-chrome | Extension UI — consumes this package via `link-engine.mjs` |

## API URL

Defaults to `https://siyf-api.nic-58f.workers.dev`. Override with `SIYF_API_URL` (CI) or `VITE_SIYF_API_URL` (bundlers).

## Org

Maintained by [@nicholasxdavis](https://github.com/nicholasxdavis) under **Sports-in-your-face**.
