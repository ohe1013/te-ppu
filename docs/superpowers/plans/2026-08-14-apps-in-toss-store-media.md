# Apps-in-Toss Store Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reviewable Apps-in-Toss store-media set for `테뿌리스`: one corrected app logo, one landscape thumbnail, and three real-app portrait screenshots.

**Architecture:** Keep generated marketing art separate from runtime assets under `artifacts/apps-in-toss/store-media/`. Use the built-in image generation editor for the logo and thumbnail, and Playwright against the existing E2E build for deterministic title, tower, and battle captures. A small Node validator owns PNG signature, dimensions, and logo-opacity checks so the upload files can be regenerated and checked without visual guesswork.

**Tech Stack:** built-in image generation, React/Vite E2E mode, Playwright 1.62.1, Node.js 24, `node:test`, PNG IHDR parsing.

## Global Constraints

- Do not overwrite `public/assets/brand/app-logo.png` during this review pass.
- Write final candidates under `artifacts/apps-in-toss/store-media/`.
- `app-logo-teppu.png` must be an opaque 600×600 PNG with no text, rounded corners, transparency, or watermark.
- The logo must preserve the current sunset tower and glowing yellow four-cell falling block while replacing the foreground character with `hero-engineer` and the lower-left owl with `owl-companion`.
- Rivet must retain blue hair, silver goggles, red scarf, cream workwear, yellow gloves, and the red/teal tool pack; the head and goggles must not touch the frame.
- Coil must retain blue/cream feathers, gold goggles, red cape, and a visible gear perch.
- `thumbnail-teppu.png` must be 1932×828 PNG and must not invent payment, reward, or unavailable gameplay elements.
- Each screenshot must be a direct app capture at 636×1048 PNG: title, tower, and active battle.
- Keep `tmp/` untouched because it predates this task.

---

### Task 1: Store-media PNG validator

**Files:**
- Create: `scripts/qa/store-media.mjs`
- Create: `scripts/qa/store-media.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `artifacts/apps-in-toss/store-media/*.png`
- Produces: `validateStoreMedia(root: string): Promise<readonly MediaResult[]>` and the `npm run check:store-media` command.

- [ ] **Step 1: Write failing validator tests**

Create synthetic PNG buffers containing a valid signature and IHDR. Assert that the validator accepts this exact manifest:

```js
const EXPECTED = {
  'app-logo-teppu.png': [600, 600, true],
  'thumbnail-teppu.png': [1932, 828, false],
  'screenshot-01-title.png': [636, 1048, false],
  'screenshot-02-tower.png': [636, 1048, false],
  'screenshot-03-battle.png': [636, 1048, false],
};
```

Also assert rejection for a missing file, a 599×600 logo, an invalid PNG signature, and a logo whose IHDR color type is `6` or which declares a `tRNS` chunk.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test scripts/qa/store-media.test.mjs
```

Expected: FAIL because `scripts/qa/store-media.mjs` does not exist.

- [ ] **Step 3: Implement the minimal validator**

Parse only the PNG signature and chunks needed for upload validation:

```js
export const STORE_MEDIA = Object.freeze({
  'app-logo-teppu.png': { width: 600, height: 600, opaque: true },
  'thumbnail-teppu.png': { width: 1932, height: 828, opaque: false },
  'screenshot-01-title.png': { width: 636, height: 1048, opaque: false },
  'screenshot-02-tower.png': { width: 636, height: 1048, opaque: false },
  'screenshot-03-battle.png': { width: 636, height: 1048, opaque: false },
});

export async function validateStoreMedia(root = process.cwd()) {
  const mediaRoot = join(root, 'artifacts', 'apps-in-toss', 'store-media');
  return Promise.all(Object.entries(STORE_MEDIA).map(async ([fileName, expected]) => {
    const parsed = parsePng(await readFile(join(mediaRoot, fileName)), fileName);
    assertDimensions(parsed, expected.width, expected.height, fileName);
    if (expected.opaque) assertOpaque(parsed, fileName);
    return { fileName, width: parsed.width, height: parsed.height };
  }));
}
```

`parsePng` must walk bounded PNG chunks, require exactly one 13-byte `IHDR`, and return `{ width, height, colorType, hasTransparencyChunk }`. `assertOpaque` accepts color type `2` only and rejects `tRNS`.

The CLI success line is `STORE_MEDIA_OK files=5`; failures use `STORE_MEDIA_FAIL <message>` and a non-zero exit code.

- [ ] **Step 4: Add and run the package command**

Add:

```json
"check:store-media": "node scripts/qa/store-media.mjs"
```

Run `node --test scripts/qa/store-media.test.mjs` and expect all tests to pass.

- [ ] **Step 5: Commit the validator**

```powershell
git add package.json scripts/qa/store-media.mjs scripts/qa/store-media.test.mjs
git commit -m "test: validate Apps-in-Toss store media"
```

### Task 2: Deterministic real-app screenshot capture

**Files:**
- Create: `playwright.store-media.config.ts`
- Create: `tests/store-media/store-media.spec.ts`
- Modify: `package.json`
- Generate: `artifacts/apps-in-toss/store-media/screenshot-01-title.png`
- Generate: `artifacts/apps-in-toss/store-media/screenshot-02-tower.png`
- Generate: `artifacts/apps-in-toss/store-media/screenshot-03-battle.png`

**Interfaces:**
- Consumes: E2E Vite app at `http://127.0.0.1:5173`, local-storage schema v5, `data-testid` screen selectors.
- Produces: the `npm run capture:store-media` command and three exact-size PNG screenshots.

- [ ] **Step 1: Write the capture spec before its dedicated config exists**

Use a single Chromium project with viewport `{ width: 636, height: 1048 }`, seed profile `{ initials: 'RVT', characterId: 'hero-engineer' }`, and wait for `document.fonts.ready` plus all visible images to complete before every capture.

The spec performs these transitions:

```ts
await page.goto('/');
await expect(page.getByTestId('title-screen')).toBeVisible();
await capture('screenshot-01-title.png');

await page.getByTestId('title-screen').locator('.title-screen__action--start').click();
await expect(page.getByTestId('tower-screen')).toBeVisible();
await capture('screenshot-02-tower.png');

await page.getByTestId('tower-screen').locator('.floor-card').first().click();
await page.getByTestId('floor-intro-screen').locator('.screen-actions button').last().click();
await expect(page.getByTestId('match-screen')).toBeVisible();
```

After the countdown, perform six downward joystick gestures with at least 280 ms between gestures so both boards have readable block state, then capture `screenshot-03-battle.png`.

- [ ] **Step 2: Run the missing command to verify failure**

Run `npm run capture:store-media` and expect npm to report a missing script.

- [ ] **Step 3: Add the dedicated Playwright configuration and command**

Configure `testDir: './tests/store-media'`, `workers: 1`, `fullyParallel: false`, `viewport: { width: 636, height: 1048 }`, and the existing `npm run dev:e2e` web server. Add:

```json
"capture:store-media": "playwright test -c playwright.store-media.config.ts"
```

- [ ] **Step 4: Capture and verify the screenshots**

Run:

```powershell
npm run capture:store-media
```

Expected: one Playwright test passes and all three screenshot files exist. Open all three images and check that Rivet's face, the tower route, both battle boards, and the touch controls are not clipped.

- [ ] **Step 5: Commit the reusable capture path**

```powershell
git add package.json playwright.store-media.config.ts tests/store-media/store-media.spec.ts artifacts/apps-in-toss/store-media/screenshot-*.png
git commit -m "test: capture Apps-in-Toss store screenshots"
```

### Task 3: Corrected Rivet and Coil app logo

**Files:**
- Reference: `public/assets/brand/app-logo.png`
- Reference: `public/assets/characters/hero-engineer/full.webp`
- Reference: `public/assets/characters/owl-companion/full.webp`
- Generate: `artifacts/apps-in-toss/store-media/app-logo-teppu-source.png`
- Generate: `artifacts/apps-in-toss/store-media/app-logo-teppu.png`

**Interfaces:**
- Consumes: the three reference images above.
- Produces: the 600×600 opaque upload candidate used by Task 4.

- [ ] **Step 1: Edit with the built-in image-generation tool**

Use the existing app logo as the edit target and the two character files as identity references. Use this prompt:

```text
Use case: logo-brand
Asset type: Apps-in-Toss square game app icon
Primary request: Preserve the current sunset sky, Gearlight tower, glowing yellow four-cell falling-block emblem, dynamic raised-arm pose, and square composition. Replace only the foreground human with the exact hero-engineer reference character and replace only the lower-left owl with the exact owl-companion reference character.
Input images: Image 1 is the edit target and composition reference; Image 2 is the hero-engineer identity/outfit reference; Image 3 is the owl-companion identity reference.
Character invariants: hero has navy-blue spiky hair, silver cyan-lens goggles, red scarf, cream mechanic jumpsuit, yellow gloves, red and teal tool backpack; owl has blue and cream feathers, oversized gold goggles, red cape, and stands on a brass gear.
Composition: hero smiles and raises the same glowing yellow four-cell block overhead; owl stays readable in the lower-left; tower remains on the right; keep generous padding above the hero hair and goggles.
Style: polished colorful pixel-art game icon matching the existing target.
Constraints: no text, no logo lettering, no watermark, no rounded-corner mask, no transparent background; do not crop the hero hair or goggles; do not change the block silhouette, tower, or sunset.
```

- [ ] **Step 2: Inspect character identity and framing**

Reject the result if Rivet lacks any signature outfit color, Coil becomes a generic metal owl, the raised block changes shape, or any head/goggle edge touches the canvas.

- [ ] **Step 3: Normalize the accepted image**

Save the untouched generated result as `app-logo-teppu-source.png`. Resize/crop the accepted square to exactly 600×600 and flatten it to 24-bit RGB PNG as `app-logo-teppu.png`; do not overwrite the existing runtime logo.

- [ ] **Step 4: Run the validator test and visual small-size check**

Run `node --test scripts/qa/store-media.test.mjs`. Create a temporary 96×96 preview and confirm that Rivet, Coil, and the glowing block remain individually recognizable.

### Task 4: Landscape thumbnail and complete-set verification

**Files:**
- Reference: `artifacts/apps-in-toss/store-media/app-logo-teppu.png`
- Reference: `artifacts/apps-in-toss/store-media/screenshot-03-battle.png`
- Reference: `public/assets/characters/hero-engineer/full.webp`
- Reference: `public/assets/characters/owl-companion/full.webp`
- Generate: `artifacts/apps-in-toss/store-media/thumbnail-teppu-source.png`
- Generate: `artifacts/apps-in-toss/store-media/thumbnail-teppu.png`

**Interfaces:**
- Consumes: the approved logo, real battle screenshot, and exact character references.
- Produces: the final five-file upload set validated by `npm run check:store-media`.

- [ ] **Step 1: Generate the thumbnail with the built-in image-generation tool**

Use this prompt:

```text
Use case: ads-marketing
Asset type: Apps-in-Toss landscape game thumbnail
Primary request: Create a wide promotional illustration for Teppu that matches the corrected app icon and accurately communicates a colorful falling-block duel inside Gearlight Tower.
Input images: Image 1 is the approved visual identity reference; Image 2 is the real gameplay layout reference; Image 3 is the hero-engineer identity reference; Image 4 is the owl-companion identity reference.
Composition: Rivet and Coil occupy the left third; Rivet presents a glowing yellow four-cell falling block; the right two-thirds show Gearlight Tower and two clearly separated colorful block boards facing each other; preserve open breathing room around the central action.
Style: polished bright fantasy arcade illustration with pixel-art detailing consistent with the icon.
Constraints: no text, no watermark, no store badges, no currency, no prizes, no payment or ad imagery, no characters absent from the references, no copied third-party branding or logos.
```

- [ ] **Step 2: Inspect accuracy and normalize**

Reject a thumbnail that changes Rivet or Coil identity, shows only one board, hides the falling-block mechanic, or invents rewards. Save the original as `thumbnail-teppu-source.png`, then crop/resize to exactly 1932×828 as `thumbnail-teppu.png`.

- [ ] **Step 3: Validate the complete upload set**

Run:

```powershell
npm run check:store-media
npm run typecheck
node --test scripts/qa/store-media.test.mjs
```

Expected: `STORE_MEDIA_OK files=5`, typecheck passes, and validator tests pass.

- [ ] **Step 4: Perform visual review**

Open all five final images at original size. Confirm no clipped faces, unreadable boards, browser chrome, debug copy, third-party marks, or generated text. Compare the logo and thumbnail directly against both character reference files.

- [ ] **Step 5: Commit the final generated set**

```powershell
git add artifacts/apps-in-toss/store-media/app-logo-teppu*.png artifacts/apps-in-toss/store-media/thumbnail-teppu*.png
git commit -m "feat: add Apps-in-Toss store media"
```
