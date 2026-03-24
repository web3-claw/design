---
name: audit
description: "Perform a comprehensive audit of interface quality across accessibility, performance, theming, and responsive design. Generates a scored report with severity ratings and actionable plan. Use when the user wants a design review, accessibility check, quality audit, or a full list of UI issues to fix."
argument-hint: "[area (feature, page, component...)]"
user-invocable: true
---

Run systematic quality checks and generate a comprehensive audit report with quantitative scoring, prioritized issues, and an actionable plan. Don't fix issues — document them for other commands to address.

**First**: Invoke {{command_prefix}}frontend-design for design principles and anti-patterns.

## Diagnostic Scan

Run comprehensive checks across 5 dimensions. Score each dimension 0–4 using the criteria below.

### 1. Accessibility (A11y)

**Check for**:
- **Contrast issues**: Text contrast ratios < 4.5:1 (or 7:1 for AAA)
- **Missing ARIA**: Interactive elements without proper roles, labels, or states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, divs instead of buttons
- **Alt text**: Missing or poor image descriptions
- **Form issues**: Inputs without labels, poor error messaging, missing required indicators

**Score 0–4**: 0=Inaccessible (fails WCAG A), 1=Major gaps (few ARIA labels, no keyboard nav), 2=Partial (some a11y effort, significant gaps), 3=Good (WCAG AA mostly met, minor gaps), 4=Excellent (WCAG AA fully met, approaches AAA)

### 2. Performance

**Check for**:
- **Layout thrashing**: Reading/writing layout properties in loops
- **Expensive animations**: Animating layout properties (width, height, top, left) instead of transform/opacity
- **Missing optimization**: Images without lazy loading, unoptimized assets, missing will-change
- **Bundle size**: Unnecessary imports, unused dependencies
- **Render performance**: Unnecessary re-renders, missing memoization

**Score 0–4**: 0=Severe issues (layout thrash, unoptimized everything), 1=Major problems (no lazy loading, expensive animations), 2=Partial (some optimization, gaps remain), 3=Good (mostly optimized, minor improvements possible), 4=Excellent (fast, lean, well-optimized)

### 3. Theming

**Check for**:
- **Hard-coded colors**: Colors not using design tokens
- **Broken dark mode**: Missing dark mode variants, poor contrast in dark theme
- **Inconsistent tokens**: Using wrong tokens, mixing token types
- **Theme switching issues**: Values that don't update on theme change

**Score 0–4**: 0=No theming (hard-coded everything), 1=Minimal tokens (mostly hard-coded), 2=Partial (tokens exist but inconsistently used), 3=Good (tokens used, minor hard-coded values), 4=Excellent (full token system, dark mode works perfectly)

### 4. Responsive Design

**Check for**:
- **Fixed widths**: Hard-coded widths that break on mobile
- **Touch targets**: Interactive elements < 44x44px
- **Horizontal scroll**: Content overflow on narrow viewports
- **Text scaling**: Layouts that break when text size increases
- **Missing breakpoints**: No mobile/tablet variants

**Score 0–4**: 0=Desktop-only (breaks on mobile), 1=Major issues (some breakpoints, many failures), 2=Partial (works on mobile, rough edges), 3=Good (responsive, minor touch target or overflow issues), 4=Excellent (fluid, all viewports, proper touch targets)

### 5. Anti-Patterns (CRITICAL)

Check against ALL the **DON'T** guidelines in the frontend-design skill. Look for AI slop tells (AI color palette, gradient text, glassmorphism, hero metrics, card grids, generic fonts) and general design anti-patterns (gray on color, nested cards, bounce easing, redundant copy).

**Score 0–4**: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3-4 tells), 2=Some tells (1-2 noticeable), 3=Mostly clean (subtle issues only), 4=No AI tells (distinctive, intentional design)

**CRITICAL**: This is an audit, not a fix. Document issues thoroughly with clear explanations of impact. Use other commands to fix issues after audit.

## Generate Comprehensive Report

### Audit Health Score

Present the dimension scores as a table:

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ? | [most critical a11y issue or "—"] |
| 2 | Performance | ? | |
| 3 | Responsive Design | ? | |
| 4 | Theming | ? | |
| 5 | Anti-Patterns | ? | |
| **Total** | | **??/20** | **[Rating band]** |

**Rating bands**:
| Score | Rating | Action |
|-------|--------|--------|
| 18–20 | Excellent | Minor polish only |
| 14–17 | Good | Address weak dimensions |
| 10–13 | Acceptable | Significant work needed |
| 6–9 | Poor | Major quality overhaul |
| 0–5 | Critical | Fundamental issues across the board |

### Anti-Patterns Verdict
**Start here.** Pass/fail: Does this look AI-generated? List specific tells from the skill's Anti-Patterns section. Be brutally honest.

### Executive Summary
- Audit Health Score: **??/20** ([rating band])
- Total issues found (count by severity: P0/P1/P2/P3)
- Most critical issues (top 3-5)
- Recommended next steps

### Detailed Findings by Severity

Tag every issue with **P0–P3 severity**:
| Priority | Name | Description |
|----------|------|-------------|
| **P0** | Blocking | Prevents task completion — fix immediately |
| **P1** | Major | Significant difficulty or WCAG AA violation — fix before release |
| **P2** | Minor | Annoyance, workaround exists — fix in next pass |
| **P3** | Polish | Nice-to-fix, no real user impact — fix if time permits |

For each issue, document:
- **[P?] Issue name**
- **Location**: Where it occurs (component, file, line)
- **Category**: Accessibility / Performance / Theming / Responsive / Anti-Pattern
- **Description**: What the issue is
- **Impact**: How it affects users
- **WCAG/Standard**: Which standard it violates (if applicable)
- **Recommendation**: How to fix it
- **Suggested command**: Which command to use (prefer: {{available_commands}} — or other installed skills you're sure exist)

#### P0 — Blocking Issues
[Issues that prevent task completion or violate WCAG A]

#### P1 — Major Issues
[Significant usability/accessibility impact, WCAG AA violations]

#### P2 — Minor Issues
[Quality issues, WCAG AAA violations, performance concerns]

#### P3 — Polish Issues
[Minor inconsistencies, optimization opportunities]

### Patterns & Systemic Issues

Identify recurring problems:
- "Hard-coded colors appear in 15+ components, should use design tokens"
- "Touch targets consistently too small (<44px) throughout mobile experience"
- "Missing focus indicators on all custom interactive components"

### Positive Findings

Note what's working well:
- Good practices to maintain
- Exemplary implementations to replicate elsewhere

## Recommended Actions

Present a prioritized action summary. Order is determined by severity automatically (P0 first, then P1, then P2).

### Action Summary

List recommended commands in priority order:

1. **[P?] `{{command_prefix}}command-name`** — Brief description (specific context from audit findings)
2. **[P?] `{{command_prefix}}command-name`** — Brief description (specific context)
...

**Rules for recommendations**:
- Only recommend commands from: {{available_commands}}
- Order by severity: P0 issues first, then P1, then P2 (skip P3 unless user has few issues)
- Each item's description should carry enough context that the command knows what to focus on
- Map findings to the most appropriate command
- Skip commands that would address zero issues
- End with `{{command_prefix}}polish` as the final step if any fixes were recommended

After presenting the summary, tell the user:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `{{command_prefix}}audit` after fixes to see your score improve.

**IMPORTANT**: Be thorough but actionable. Too many P3 issues creates noise. Focus on what actually matters.

**NEVER**:
- Report issues without explaining impact (why does this matter?)
- Mix severity levels inconsistently
- Skip positive findings (celebrate what works)
- Provide generic recommendations (be specific and actionable)
- Forget to prioritize (everything can't be P0)
- Report false positives without verification

Remember: You're a quality auditor with exceptional attention to detail. Document systematically, prioritize ruthlessly, and provide clear paths to improvement. A good audit makes fixing easy.
