# Preset harness logos — provenance

Third-party marks bundled to identify tier-2 preset harnesses in the runtime
gallery (`PRESET_LOGOS` in `desktop/src/features/onboarding/ui/RuntimeIcon.tsx`).
Nominative use only — each mark identifies its own vendor's harness.

Add a row here when adding a preset logo; only bundle marks whose upstream
license permits redistribution.

| File | Upstream | Commit | License | Source path | Modifications |
|---|---|---|---|---|---|
| `hermes.png` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | `6ad632b` | MIT © 2025 Nous Research | `website/static/img/logo.png` | Cropped the baked-in border frame, padded to square, resized to 64×64, quantised to a 16-colour palette |
| `openclaw.svg` | [openclaw/openclaw](https://github.com/openclaw/openclaw) | `b06f40a` | MIT © 2026 OpenClaw Foundation | `ui/public/favicon.svg` | Removed the SMIL animation elements (renders the upstream rest pose statically — verified pixel-identical to the upstream frame at t=0); minified paths |

`amp.png`, `cursor.png`, `grok.png`, `kimi.png`, `omp.png`, and `opencode.svg`
predate this file; their provenance was not recorded when they were added.
