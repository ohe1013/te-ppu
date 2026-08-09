# 아케이드 퍼즐 시각 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current generic visual pack with an original bright arcade-puzzle presentation inspired by 1990s versus puzzle games, while preserving the existing Tetris pieces and gameplay contracts.

**Architecture:** Keep `AssetManifestV1`, Pixi board primitives, core state, and input commands unchanged. Replace the raster/vector pack in `public/assets`, update screen/HUD composition in the existing React components and CSS, and keep numerical match data available only to hidden test/a11y hooks. Validate the authored pack before every web/Apps-in-Toss build.

**Tech Stack:** React 19, TypeScript, PixiJS 8, Vite, Pillow, built-in image generation with local chroma-key removal, Node asset validators, Playwright.

## Global Constraints

- Keep the canonical 85 manifest references and `mode: assets`.
- Preserve all existing gameplay, item, attack, input, and platform contracts.
- Use original artwork; do not copy protected characters, logos, sprites, or exact UI from a named commercial game.
- Keep block dimensions at 64×64 PNG with the existing fallback colors and readable Tetris shapes.
- Keep background dimensions at 840×1480 WebP and character full art at 1024×1024 transparent WebP.
- Do not display combo, incoming, inventory counts, freeze ticks, or match tick as visible numbers.
- Validate with `ASSETS_REQUIRED=1 npm run check:assets`, `npm run typecheck`, `npm run build:web`, `npm run test:delivery-gates`, and `npm run test:e2e`.

---

### Task 1: Regenerate the visual asset masters

**Files:**
- Modify: `scripts/generate-authored-assets.py`
- Modify: `scripts/generate-authored-audio.cjs`
- Replace: `public/assets/backgrounds/*.webp`
- Replace: `public/assets/characters/*/full.webp`
- Replace: `public/assets/characters/*/portrait-*.webp`
- Replace: `public/assets/items/*.png`
- Replace: `public/assets/effects/battle-atlas.png`
- Replace: `public/assets/effects/battle-atlas.json`
- Replace: `public/assets/ui/*.svg`

**Interfaces:** The existing `public/assets/manifest.json` paths remain unchanged. The generators must still produce exact atlas group names/counts and the validator’s required dimensions.

- [ ] Generate a new vertical tower map and five floor backgrounds with a consistent saturated arcade palette, stair/path landmarks, clouds, banners, and quiet center space for overlaid UI.
- [ ] Generate seven new original character masters with a unified flat cel/pixel-inspired style and transparent edges: brave repair hero, expressive owl companion, four comic lieutenants, and a composed demon king.
- [ ] Derive all canonical portraits from the new masters, using state overlays that preserve alpha and facial readability.
- [ ] Rebuild item icons, UI icons, and battle atlas effects with thick dark outlines, stars, ribbons, lightning, bubbles, and impact rings; keep text out of raster/vector art.
- [ ] Regenerate MP3 cues with the existing names and deterministic fallback behavior.
- [ ] Run `python scripts/generate-authored-assets.py`, `node scripts/generate-authored-audio.cjs`, and `node scripts/validate-assets.mjs --report`.

### Task 2: Restore the original Tetris block treatment

**Files:**
- Modify: `scripts/generate-authored-assets.py`
- Replace: `public/assets/blocks/tile-{i,j,l,o,s,t,z}.png`
- Replace: `public/assets/blocks/garbage.png`
- Test: `scripts/validate-assets.test.mjs`

**Interfaces:** `BoardSkin` continues resolving these exact 64×64 PNG paths; no changes to `src/render/board-skin.ts` or core piece kinds.

- [ ] Match each authored tile to the existing fallback color table in `src/render/draw-primitives.ts`.
- [ ] Keep a simple dark outline, one highlight edge, one shadow edge, and unmistakable I/J/L/O/S/T/Z silhouette.
- [ ] Keep item markers as a small attached emblem rather than changing the block’s base shape.
- [ ] Run the asset validator and confirm all eight block PNGs retain alpha support and dimensions.

### Task 3: Recompose tower, intro, result, and ending screens

**Files:**
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Test: `src/ui/screens/TowerScreen.test.tsx` (create if absent)

**Interfaces:** Keep existing props, `data-testid` values, floor callbacks, and progress persistence behavior.

- [ ] Render the tower as a vertical route with five floor nodes, each node showing floor label, opponent name, portrait, lock/cleared state, and a connecting path.
- [ ] Make the selected floor card look like an arcade signboard with a large character portrait and short non-numeric status.
- [ ] Use speech-panel framing for intro/result/ending copy and preserve all existing buttons and callbacks.
- [ ] Keep responsive layout valid at 360×640 and 430×932 without hiding the selected floor or action buttons.
- [ ] Add/adjust component tests for five nodes, lock state, and callback behavior.

### Task 4: Recompose battle HUD and hide numeric telemetry

**Files:**
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/match/items.css`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/match/ItemControls.tsx`
- Modify: `src/ui/match/controls.css`
- Modify: `src/ui/match/BattleHud.test.tsx`

**Interfaces:** Keep `BattleHudProps`, item command dispatch, row selection, settings, exit, and existing `data-testid` hooks. Add only optional icon props when needed.

- [ ] Show player and rival portrait plates, next-piece windows, and attack/incoming indicator lights without printing numerical combo/incoming/tick values.
- [ ] Replace item quantity labels with three icon slots whose active/disabled appearance reflects inventory; preserve hidden test ids for the underlying values.
- [ ] Make board pair and HUD share a bright arcade palette, heavy outline, and speech-bubble/medallion framing.
- [ ] Keep joystick, rotate, row-select, settings, and exit interactions unchanged while applying the new visual language.
- [ ] Update BattleHud tests to verify hidden telemetry and visible item/icon structure.

### Task 5: Verify, package, and publish

**Files:**
- Modify: `docs/superpowers/specs/2026-08-08-arcade-puzzle-visual-redesign-design.md`
- Modify: this plan file as completion evidence

- [ ] Run `ASSETS_REQUIRED=1 npm run check:assets`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:web`.
- [ ] Run `npm run test:delivery-gates`.
- [ ] Run `npm run test:e2e` and record the 24-test result.
- [ ] Run `npm run build:ait` and `node scripts/verify-ait-package.mjs artifacts/ait/game.ait`.
- [ ] Review `git diff --check`, commit the redesign, and push `feat/pve-delivery` to `origin`.
