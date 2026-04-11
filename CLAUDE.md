# Project Instructions for Claude

## Architecture (v3.0+)

There is **one** user-invocable skill, `impeccable`, with **20 commands** underneath it. Users type `/impeccable polish`, `/impeccable audit`, etc. The skill is defined in `source/skills/impeccable/`:

- `SKILL.md` — frontmatter (with the auto-trigger-optimized description and the `allowed-tools` list), shared design principles, and the **Command Router** section that dispatches sub-commands via argument matching.
- `reference/` — one `<command>.md` per command (`audit.md`, `polish.md`, `critique.md`, etc.) plus the domain reference files (`typography.md`, `color-and-contrast.md`, etc.). When a sub-command is matched, the router loads its reference file.
- `scripts/command-metadata.json` — single source of truth for each command's description, argument hint, and (eventually) category. Both the build and `pin.mjs` read from this.
- `scripts/pin.mjs` — creates/removes lightweight redirect shims so users can have `/audit` as a standalone shortcut that delegates to `/impeccable audit`.
- `scripts/cleanup-deprecated.mjs` — runs once after an update to remove leftover files from renamed/merged commands.

**Do not add standalone skills** unless there's a strong reason. The consolidation was deliberate: the `/` menu pollution problem is real and gets worse as users install more plugins.

## CSS

Plain hand-written CSS, no Tailwind, no build step. Bun's HTML loader resolves `<link rel="stylesheet">` and inlines `@import` chains automatically for both `bun run dev` and `bun run build`.

The CSS architecture:
- `public/css/main.css` — Main entry point, imports the partials and defines tokens/reset
- `public/css/workflow.css` — Commands section, glass terminal, magazine spread styles
- `public/css/sub-pages.css` — `/docs`, `/anti-patterns`, `/tutorials`, detail pages
- `public/css/tokens.css` — OKLCH color tokens (ink, charcoal, ash, mist, cream, accent)

Edit any of these directly and reload. No rebuild needed for CSS changes.

## Color token rule

- **`--color-ink`** (10% lightness) is for body copy. Use it even for small text.
- **`--color-charcoal`** (25% lightness) reads as washed-out gray in small text. Only use for headings or larger body copy at ≥16px.
- **`--color-ash`** (55%) is for secondary labels, captions, relationship meta lines.
- **Never use pure black or pure white.** Use the tinted tokens.

## No em dashes, no `--` either

CLAUDE.md feedback from multiple sessions: "no em dashes in project copy" does NOT mean "replace with `--`". It means **use actual punctuation**: commas, colons, semicolons, periods, parentheses. The `--` substitution makes the problem worse. The build validator (`validateNoEmDashes` in `scripts/build.js`) catches real em dashes but not the `--` double-hyphen habit, so you have to catch yourself.

## Development Server

```bash
bun run dev        # Bun dev server at http://localhost:3000
bun run preview    # Build + Cloudflare Pages local preview
```

The dev server (in `server/index.js`) runs `generateSubPages` at module load, so editing source files in `content/site/skills/`, `source/skills/impeccable/`, or the sub-page generator requires a **server restart** (not just a browser reload) to see the change. CSS hot-reloads fine without a restart.

**Legacy URL redirects** live in `server/index.js` and must stay in sync with `scripts/build.js` `_redirects` generation. Current redirects: `/skills` → `/docs`, `/skills/:id` → `/docs/:id`, `/cheatsheet` → `/docs`, `/gallery` → `/visual-mode#try-it-live`.

## Deployment

Hosted on Cloudflare Pages. Static assets served from `build/`, API routes handled via `_redirects` rewrites (JSON) and Pages Functions (downloads).

```bash
bun run deploy     # Build + deploy to Cloudflare Pages
```

## Build System

The build system compiles the impeccable skill from `source/` to provider-specific formats in `dist/`:

```bash
bun run build      # Build all providers
bun run rebuild    # Clean and rebuild
```

Source files use placeholders that get replaced per-provider:
- `{{model}}` — Model name (Claude, Gemini, GPT, etc.)
- `{{config_file}}` — Config file name (CLAUDE.md, .cursorrules, etc.)
- `{{ask_instruction}}` — How to ask user questions
- `{{command_prefix}}` — `/` or `$` depending on provider
- `{{available_commands}}` — auto-populated list of commands (from `IMPECCABLE_SUB_COMMANDS` in `scripts/lib/utils.js`)
- `{{scripts_path}}` — provider-aware path to the skill's scripts directory

### Harness output directories are tracked

`.claude/skills/`, `.cursor/skills/`, `.agents/skills/`, and the other 8 harness directories are **intentionally committed to the repo**. `npx skills` reads them directly from this repo at install time, and they enable clean submodule use. Do not gitignore them. Run `bun run build` to refresh them after editing `source/skills/`.

Local state files inside harness directories (e.g. `.claude/scheduled_tasks.lock`, `.claude/settings.local.json`) ARE gitignored.

### Generated sub-pages are gitignored

`public/docs/`, `public/anti-patterns/`, `public/tutorials/`, `public/visual-mode/` are generated by `scripts/build-sub-pages.js` on dev server startup and during `bun run build`. They're gitignored because the production site (Cloudflare Pages) runs its own build and nobody consumes them directly from git.

## Testing

```bash
bun run test       # Run all tests
```

Unit tests (build orchestration, detector logic) run via `bun test`. Fixture tests (jsdom-based HTML detection) run via `node --test` because bun is too slow with jsdom. The `test` script handles this split automatically.

**Important:** `tests/build.test.js` uses `spyOn(transformers, 'transformCursor')` with the named exports from `scripts/lib/transformers/index.js`. Those named exports (`transformCursor`, `transformClaudeCode`, etc.) are kept specifically for test spying, even though `build.js` itself uses `createTransformer + PROVIDERS` directly. **Do not delete them as "dead code"** — I made that mistake once and broke 8 tests.

## CLI

The CLI lives in this repo under `bin/` and `src/`. Published to npm as `impeccable`.

```bash
npx impeccable detect [file-or-dir-or-url...]   # detect anti-patterns
npx impeccable detect --fast --json src/         # regex-only, JSON output
npx impeccable live                              # start browser overlay server
npx impeccable skills install                    # install skills
npx impeccable --help                            # show help
```

The browser detector (`src/detect-antipatterns-browser.js`) is generated from the main engine. After changing `src/detect-antipatterns.mjs`, rebuild it:

```bash
bun run build:browser
```

**IMPORTANT**: Always use `node` (not `bun`) to run the detect CLI. Bun's jsdom implementation is extremely slow and will cause scans with HTML files to hang for minutes.

## Versioning

There are three independently versioned components. Only bump the one(s) that actually changed:

**CLI** (npm package):
- `package.json` → `version`
- Bump when: CLI code changes (`bin/`, `src/detect-antipatterns.mjs`, etc.)

**Skills** (Claude Code plugin / skill definitions):
- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`
- Bump when: skill content changes (`source/skills/`, reference files, command metadata, etc.)

**Chrome extension**:
- `extension/manifest.json` → `version`
- Bump when: extension code changes (`extension/`)

**Website changelog** (`public/index.html`):
- Hero version link text + new changelog entry in the changelog section
- Update for user-facing changes only, not internal build/tooling details
- Use the most prominent version that changed (skills version is usually the right one)

## Adding New Commands

All commands live under `/impeccable`. To add a new one:

1. Create `source/skills/impeccable/reference/<command>.md` with the command's instructions (this is what the LLM loads when the command is invoked)
2. Add a row to the **Sub-command reference table** in `source/skills/impeccable/SKILL.md`
3. Add an entry to the **Command menu** section in the same file
4. Add the command name to `IMPECCABLE_SUB_COMMANDS` in `scripts/lib/utils.js`
5. Add it to `VALID_COMMANDS` in `source/skills/impeccable/scripts/pin.mjs`
6. Add its metadata (description + argumentHint) to `source/skills/impeccable/scripts/command-metadata.json`
7. Add its category to `SKILL_CATEGORIES` in `scripts/lib/sub-pages-data.js`
8. Add its relationships (leadsTo / pairs / combinesWith) to `COMMAND_RELATIONSHIPS` in the same file
9. Add the same category entry to `public/js/data.js` `commandCategories` and `commandProcessSteps` (for the homepage carousel)
10. Add symbol + number to `commandSymbols` and `commandNumbers` in `public/js/components/framework-viz.js` (periodic table)
11. Optional: write an editorial wrapper at `content/site/skills/<command>.md` with a short `tagline` and expanded body (When to use it / How it works / Try it / Pitfalls)

The build system counts commands from the router table automatically. Update the command count in **all** of these locations when the total changes:

- `public/index.html` — meta descriptions, hero box, section lead
- `public/cheatsheet.html` does not exist anymore; `/cheatsheet` redirects to `/docs`
- `README.md` — intro, command count, commands table
- `NOTICE.md` — command count
- `AGENTS.md` — intro command count
- `.claude-plugin/plugin.json` — description
- `.claude-plugin/marketplace.json` — metadata description + plugin description

The build validator (`generateCounts` in `scripts/build.js`) checks these files for stale numeric counts and fails the build if any disagree with the router table.

## Adding editorial content for existing commands

Editorial files live at `content/site/skills/<command>.md` and have a `tagline` frontmatter plus a body with the standard four sections:

- **When to use it** — the specific scenarios this command owns
- **How it works** — the internal process, phases, or approach
- **Try it** — one or two concrete examples with expected output
- **Pitfalls** — real failure modes, with alternatives to reach for instead

The tagline is used by UI surfaces (magazine spread, docs cards) that need a short human-friendly label. The long description in `command-metadata.json` stays optimized for auto-trigger keyword matching in the AI harness.

Every command should have an editorial file eventually, but the build does not require one: commands without editorials fall back to the frontmatter description.

## Evals Framework (private, gitignored)

There is a controlled eval framework at `evals/` that measures whether the `/impeccable` skill improves or harms AI-generated frontend design. It runs the same brief through a model with and without the skill loaded, fingerprints every generation, and aggregates the results into a bias report. The whole `evals/` directory is gitignored — it's intended to stay private (commercial).

**If you're picking up eval work in a new session, read `evals/AGENT.md` first.** It captures everything we've learned: model choices, sample size policy, lessons learned, common workflows, and gotchas. Don't try to reinvent the workflow from scratch — there's significant prior context.

### After structural skill changes, update `evals/runner/inline-skill.ts`

The eval harness inlines `SKILL.md` into the system prompt for the "skill-on" condition, stripping sections that are irrelevant to an API-driven craft run. The stripped sections list (`sectionsToStrip` in `inline-skill.ts`) needs to stay in sync with `SKILL.md`'s top-level `##` headings. As of v3.0, it strips:

- `## Context Gathering Protocol` — references a `.impeccable.md` file that doesn't exist in the test harness
- `## Command Router` — sub-command dispatch is meaningless for a single API call
- `## Pin / Unpin` — harness tooling, not design instruction

If you add or rename a top-level section in `SKILL.md`, check whether `inline-skill.ts` needs updating. A stale strip list either leaves noise in the prompt or accidentally strips useful content.

### Quick orientation

- **Primary baseline model**: `gpt-5.4` with `--reasoning-effort medium`. Frontier intelligence at ~5-10× lower cost than high reasoning. **Do NOT use `--reasoning-effort high`** unless you specifically need it — reasoning tokens count against `max_completion_tokens` and burn ~$1-2/file with no quality benefit for our use case.
- **Secondary validation model**: `qwen/qwen3.6-plus` via OpenRouter. Cheap-ish, decent design quality, no reasoning controls.
- **Do NOT use Haiku as a primary eval target.** It ignores most negative rules in the skill. We learned this the hard way — it sent us down many wrong paths early on.
- **Sample size policy**: n=10 per niche for scratch iteration, **n=20 for sweep validation (the standard)**, n=50 reserved for the final published baseline. n=20 is the smallest sample where rare detector findings stabilize and A/B comparisons are statistically meaningful.

### Quick commands

```bash
# Always start the local server first — the gallery/viewer can't load via file:// (CORS)
bun run evals/runner/serve.ts

# Standard workflow: generate → detect → aggregate → snapshot
bun run evals/runner/run.ts --with-refs --model gpt-5.4 --reasoning-effort medium
bun run evals/runner/detect.ts
bun run evals/runner/aggregate.ts
bun run evals/runner/snapshot.ts <slug> --title "..." --note "..."

# Cheap targeted iteration (does not pollute current/)
bun run evals/runner/run.ts --with-refs --scratch my-test \
  --niches 06 --n 10 --condition skill-on --model qwen/qwen3.6-plus

# View results in browser
open http://localhost:8723/viewer.html
```

### Critical rules

- **Always run a small smoke test (n=2-5 on one niche) before any sweep.** Rate degrades over long runs and time estimates can be off by 10-20×. We once burned 11+ hours on a sweep estimated to take 40 minutes.
- **Background long runs.** Use `run_in_background: true` for any sweep over ~50 generations. The runner is resumable so killing and restarting is safe.
- **Don't mix prompt versions in the same dataset.** The variant.json safety check enforces this for `current/` (must pass `--rebuild-skill-on` after a prompt edit). Scratch dirs auto-wipe on prompt change.
- **Snapshot first, change second.** Always have a known reference point in `evals/output/snapshots/` before editing the skill, so you can compare before/after.
- **The user is the source of truth on aesthetic quality.** The fingerprinter and detector are useful signals but do not measure "is this design good?" Have the user spot-check the gallery for any meaningful change.

See `evals/AGENT.md` for the full reference: detailed model comparison table, complete lessons learned, all common workflows, and the list of gotchas.
