Launch interactive live variant mode: select elements in the browser, pick a design action, and get AI-generated HTML+CSS variants hot-swapped via the dev server's HMR.

## Prerequisites

- A running development server with hot module replacement (Vite, Next.js, Bun, etc.), OR a static HTML file open in the browser

## Start Live Mode (one command)

The `live.mjs` entry point does everything in a single call: checks config, starts (or reuses) the server, injects the script tag, loads `.impeccable.md` context.

```bash
node {{scripts_path}}/live.mjs
```

### Happy path

Output JSON:
```json
{
  "ok": true,
  "serverPort": 8400,
  "serverToken": "...",
  "pageFile": "public/index.html",
  "hasContext": true,
  "context": "...full .impeccable.md contents..."
}
```

Keep the `context` in mind for variant generation. If browser automation tools are available, navigate to the page so the user can see it. Then proceed directly to the poll loop — no other setup steps needed.

### First-time setup (config missing)

If `live.mjs` outputs `{"ok": false, "error": "config_missing", "configPath": "..."}`, this project has never used live mode before. Create the config at the reported path based on the project's framework:

| Framework | `file` | `insertBefore` | `commentSyntax` |
|-----------|--------|----------------|-----------------|
| Plain HTML | `index.html` | `</body>` | `html` |
| Vite / React | `index.html` | `</body>` | `html` |
| Next.js (App Router) | `app/layout.tsx` | `</body>` | `jsx` |
| Next.js (Pages) | `pages/_document.tsx` | `</body>` | `jsx` |
| Nuxt | `app.vue` | `</body>` | `html` |
| Svelte / SvelteKit | `src/app.html` | `</body>` | `html` |
| Astro | the root layout `.astro` file | `</body>` | `html` |
| Static site with a non-root HTML file | e.g. `public/index.html` | `</body>` | `html` |

Use `insertAfter` instead of `insertBefore` if the anchor should be matched **after** a specific line. Example:

```json
{
  "file": "public/index.html",
  "insertBefore": "</body>",
  "commentSyntax": "html"
}
```

Then re-run `node {{scripts_path}}/live.mjs` to proceed.

## Enter the Poll Loop

Run the poll as a **background task** if your harness supports it (Claude Code does). This keeps the main conversation free for other work while waiting for browser events. Do NOT set a timeout: the poll should wait indefinitely until the user acts.

```
LOOP:
  Run (background, no timeout): node {{scripts_path}}/live-poll.mjs
  When the task completes, read the JSON output. Dispatch based on the "type" field:

  TYPE "generate":
    → See "Handle Generate" below

  TYPE "accept":
    → See "Handle Accept" below

  TYPE "discard":
    → See "Handle Discard" below

  TYPE "exit":
    → Break the loop

  TYPE "timeout":
    → Continue (re-poll)

END LOOP
```

## Handle Generate

The event contains: `{id, action, freeformPrompt, count, pageUrl, element}`.

**Speed matters.** The user is watching a spinner. Minimize tool calls by using the `wrap` helper and writing all variants in a single edit.

### Step 1: Wrap the element (one CLI call)

Use the `wrap` helper to find the element and create the variant container:

```bash
node {{scripts_path}}/live-wrap.mjs --id EVENT_ID --count EVENT_COUNT --element-id "ELEMENT_ID" --classes "class1,class2" --tag "div"
```

Pass the element's id (`event.element.id`), classes (`event.element.classes` joined with commas), and tag name. The command searches in priority order: ID match first, then class names, then tag+class combo. If `event.pageUrl` hints at the file (e.g., `/` is usually `index.html`), pass `--file PATH` to skip the search.

The command outputs JSON with the file path and the insert line:
```json
{"file": "public/index.html", "insertLine": 93, "commentSyntax": {"open": "<!--", "close": "-->"}}
```

If `wrap` fails, fall back to manual grep + edit.

### Step 2a: MANDATORY — Load the action's reference file

**This step is non-negotiable.** Before generating anything, you MUST load the reference file for `event.action`:

- `event.action` is "impeccable" (default, no sub-command chosen): use the main design principles from `SKILL.md` (already loaded). Do NOT load a sub-command reference.
- `event.action` is any other value (e.g. "bolder", "quieter", "distill", "polish", "typeset", "colorize", "layout", "adapt", "animate", "delight", "overdrive"): use Read to load `reference/<action>.md` right now. Do not proceed until it's in context.

Skipping this step is a critical failure. The sub-commands exist precisely because the generic "impeccable" prompt produces generic variants. Each action encodes a specific design discipline — ignoring the reference file means ignoring what the user asked for.

### Step 2b: Plan 3+ distinctly different directions BEFORE writing any code

Before writing the first variant, write out (in your own head or as a short plan) the distinct direction each variant will take. Each direction must differ on at least ONE of these **structural axes**, not just superficial styling:

1. **Hierarchy**: which element is the focal point? (title-first, number-first, image-first, quote-first)
2. **Layout topology**: how are pieces arranged? (stacked, side-by-side, inline, grid, magazine-columns, overlay)
3. **Typographic system**: different font pairing, different scale ratios, different case/weight strategy
4. **Color strategy**: different palette hue, different accent placement, different contrast profile (not just "a slightly different shade of the same accent")
5. **Density**: minimal vs. dense vs. editorial whitespace
6. **Tone/personality**: refined/editorial vs. brutalist/raw vs. soft/pastel vs. technical/utilitarian vs. playful
7. **Structural decomposition**: combining multiple pieces vs. splitting into more pieces vs. hiding secondary info behind progressive disclosure

**Rule of thumb**: if you can summarize two variants in the same one-line description (e.g. "rose accent on the title"), they are too similar. Redo one.

For action-specific rules:
- `bolder`: each variant amplifies a DIFFERENT dimension (one goes huge on scale, one on color saturation, one on structural change). Do not make three "slightly bigger" variants.
- `quieter`: each variant pulls back a DIFFERENT dimension (one strips color, one strips ornament, one widens the spacing).
- `animate`: each variant uses a DIFFERENT motion vocabulary (one cascades, one clips/wipes, one scales/resolves). Not three staggered fades.
- `colorize`: each variant uses a DIFFERENT hue family (not three shades of the same hue).
- `typeset`: each variant uses a DIFFERENT type pairing and a DIFFERENT scale ratio.
- `layout`: each variant changes structural arrangement, not spacing tweaks.

### Step 2c: Apply the freeform prompt (if present)

If `event.freeformPrompt` is set, treat it as the user's ceiling on direction — all variants must honor it — but the variants still need to explore meaningfully different *interpretations* of that direction. Example: prompt "make it feel like a newspaper front page" → variant 1 = broadsheet masthead + rule-divided columns, variant 2 = tabloid headline + single dominant image, variant 3 = minimalist editorial with oversized drop cap. Not three newspapers in the same voice.

### Step 2d: Generate ALL variants and write them in a SINGLE edit

For each variant, create a complete HTML replacement of the original element. Consider the element's context (computed styles, parent structure, CSS custom properties from `event.element`).

Write CSS + HTML together in a SINGLE edit at the insert line reported by `wrap`. Colocate any scoped CSS inside the variant wrapper as a `<style>` tag. `<style>` tags work anywhere in the document in all modern browsers, and this ensures CSS and HTML arrive atomically (no flash of unstyled content).

```html
<!-- Variants: insert below this line -->
<style data-impeccable-css="SESSION_ID">
  @scope ([data-impeccable-variant="1"]) { ... }
  @scope ([data-impeccable-variant="2"]) { ... }
</style>
<div data-impeccable-variant="1">
  <!-- variant 1: full element replacement -->
</div>
<div data-impeccable-variant="2" style="display: none">
  <!-- variant 2: full element replacement -->
</div>
<div data-impeccable-variant="3" style="display: none">
  <!-- variant 3: full element replacement -->
</div>
```

The first variant should NOT have `style="display: none"` (it should be visible by default). All others should. If variants only use inline styles and no scoped CSS, omit the `<style>` tag entirely.

**IMPORTANT**: Write CSS and all variants in ONE edit call. The browser's MutationObserver picks up everything at once.

### Step 3: Signal completion

Include `--file` so the browser can fetch variants directly if the dev server lacks HMR:

```bash
node {{scripts_path}}/live-poll.mjs --reply EVENT_ID done --file RELATIVE_PATH
```

The file path should be relative to the project root (e.g., `public/index.html`, `src/App.tsx`).

## Handle Accept

The event contains: `{id, variantId, _acceptResult}`.

The poll script already ran `live-accept.mjs` to handle the file operation deterministically. The browser has already updated the DOM visually (the user is unblocked).

Check `_acceptResult`:
- If `handled` is true and `carbonize` is false: **no work needed**. Re-poll immediately.
- If `handled` is true and `carbonize` is true: the accepted variant has an inline `<style>` block marked with `impeccable-carbonize-start`/`impeccable-carbonize-end` comments. Spawn a **background agent** to:
  1. Find the carbonize markers in the file
  2. Move the CSS rules into the project's proper stylesheet(s)
  3. Rewrite `@scope` selectors to use the element's real classes instead of `[data-impeccable-variant]`
  4. Remove any helper classes/attributes (e.g. `data-impeccable-variant`) from the accepted HTML
  5. Delete the carbonize markers and inline `<style>` block
  Then re-poll immediately (do not wait for the background agent).
- If `handled` is false: fall back to manual cleanup (read file, find markers, edit).

## Handle Discard

The event contains: `{id, _acceptResult}`.

The poll script already ran `live-accept.mjs` to restore the original and remove all variant markers. The browser has already updated the DOM visually. **No work needed.** Re-poll immediately.

## Stopping Live Mode

The user can stop live mode in several ways:
- Saying "stop live mode" or "exit live" in the conversation
- Closing the browser tab (the SSE connection drops, poll returns `exit` after 8s)
- The browser's exit button (when the global bar is implemented)

When the user asks to stop, or the poll returns `exit`, proceed to Cleanup below.

If the poll is still running as a background task, kill it and proceed directly to cleanup.

## Cleanup (on exit)

When the loop ends:

1. **Remove the injected script tag**:
   ```bash
   node {{scripts_path}}/live-inject.mjs --remove
   ```
   (The config.json stays so future `live-inject.mjs --port PORT` calls are instant.)
2. **Remove any leftover variant wrappers** (search for `impeccable-variants-start` markers and clean up).
3. **Remove any leftover carbonize blocks** (search for `impeccable-carbonize-start` markers and clean up).
4. **Stop the server**:
   ```bash
   node {{scripts_path}}/live-server.mjs stop
   ```

## Variant Generation Guidelines

- Each variant must be a **complete element replacement**, not a CSS-only patch. Rewrite the entire element with the design transformation applied.
- Use **`@scope`** for CSS isolation. This is supported in Chrome 118+, Firefox 128+, Safari 17.4+, which covers all modern dev browsers.
- Follow the design principles from this skill (typography, color, spatial design, etc.) and the `.impeccable.md` project context if available.
- If no `.impeccable.md` exists, generate brand-agnostic variants. The live UI will show a warning to the user.
- **Non-interactive mode**: do NOT ask the user for clarification during generation. If context is missing, proceed with reasonable defaults.
