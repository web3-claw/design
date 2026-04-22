/**
 * CLI helper: find an element in source and wrap it in a variant container.
 *
 * Usage:
 *   npx impeccable wrap --id SESSION_ID --count N --query "hero-combined-left" [--file path]
 *
 * Searches project files for the element matching the query (class name, ID, or
 * text snippet), wraps it with the variant scaffolding, and prints the file path
 * + line range where the agent should insert variant HTML.
 *
 * This replaces 3-4 agent tool calls (grep + read + edit) with a single CLI call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isGeneratedFile } from './is-generated.mjs';

const EXTENSIONS = ['.html', '.jsx', '.tsx', '.vue', '.svelte', '.astro'];

export async function wrapCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: impeccable wrap [options]

Find an element in source and wrap it in a variant container.

Required:
  --id ID            Session ID for the variant wrapper
  --count N          Number of expected variants (1-8)

Element identification (at least one required):
  --element-id ID    HTML id attribute of the element
  --classes A,B,C    Comma-separated CSS class names
  --tag TAG          Tag name (div, section, etc.)
  --query TEXT       Fallback: raw text to search for

Optional:
  --file PATH        Source file to search in (skips auto-detection)
  --help             Show this help message

Output (JSON):
  { file, startLine, endLine, insertLine, commentSyntax }

The agent should insert variant HTML at insertLine.`);
    process.exit(0);
  }

  const id = argVal(args, '--id');
  const count = parseInt(argVal(args, '--count') || '3');
  const elementId = argVal(args, '--element-id');
  const classes = argVal(args, '--classes');
  const tag = argVal(args, '--tag');
  const query = argVal(args, '--query');
  const filePath = argVal(args, '--file');

  if (!id) { console.error('Missing --id'); process.exit(1); }
  if (!elementId && !classes && !query) {
    console.error('Need at least one of: --element-id, --classes, --query');
    process.exit(1);
  }

  // Build search queries in priority order (most specific first)
  const queries = buildSearchQueries(elementId, classes, tag, query);

  const genOpts = { cwd: process.cwd() };

  // Find the source file. Generated files are excluded from auto-search so we
  // don't silently write variants into a file the next build will wipe.
  let targetFile = filePath;
  let matchedQuery = null;
  if (!targetFile) {
    for (const q of queries) {
      targetFile = findFileWithQuery(q, process.cwd(), genOpts);
      if (targetFile) { matchedQuery = q; break; }
    }
    if (!targetFile) {
      // Nothing in source. Did the element show up in a generated file? That
      // tells the agent "fall back to the agent-driven flow" vs "element just
      // doesn't exist in this project."
      let generatedHit = null;
      for (const q of queries) {
        generatedHit = findFileWithQuery(q, process.cwd(), { ...genOpts, includeGenerated: true });
        if (generatedHit) break;
      }
      if (generatedHit) {
        console.error(JSON.stringify({
          error: 'element_not_in_source',
          fallback: 'agent-driven',
          generatedMatch: path.relative(process.cwd(), generatedHit),
          hint: 'Element found only in a generated file. See "Handle fallback" in live.md.',
        }));
      } else {
        console.error(JSON.stringify({
          error: 'element_not_found',
          fallback: 'agent-driven',
          hint: 'Element not found in any project file. It may be runtime-injected (JS component, etc.). See "Handle fallback" in live.md.',
        }));
      }
      process.exit(1);
    }
  } else {
    if (isGeneratedFile(targetFile, genOpts)) {
      console.error(JSON.stringify({
        error: 'file_is_generated',
        fallback: 'agent-driven',
        file: path.relative(process.cwd(), path.resolve(process.cwd(), targetFile)),
        hint: 'Explicit --file points at a generated file. Writing here gets wiped by the next build. See "Handle fallback" in live.md.',
      }));
      process.exit(1);
    }
    matchedQuery = queries[0];
  }

  const content = fs.readFileSync(targetFile, 'utf-8');
  const lines = content.split('\n');

  // Find the element, trying each query in priority order
  let match = null;
  for (const q of queries) {
    match = findElement(lines, q);
    if (match) break;
  }
  if (!match) {
    console.error(JSON.stringify({ error: 'Found file but could not locate element in ' + targetFile + '. Searched for: ' + queries.join(', ') }));
    process.exit(1);
  }

  const { startLine, endLine } = match;
  const commentSyntax = detectCommentSyntax(targetFile);
  const indent = lines[startLine].match(/^(\s*)/)[1];

  // Extract the original element
  const originalLines = lines.slice(startLine, endLine + 1);
  const originalIndented = originalLines.map(l => indent + '    ' + l.trimStart()).join('\n');

  // Build the wrapper
  const wrapperLines = [
    indent + commentSyntax.open + ' impeccable-variants-start ' + id + ' ' + commentSyntax.close,
    indent + '<div data-impeccable-variants="' + id + '" data-impeccable-variant-count="' + count + '" style="display: contents">',
    indent + '  ' + commentSyntax.open + ' Original ' + commentSyntax.close,
    indent + '  <div data-impeccable-variant="original">',
    originalIndented,
    indent + '  </div>',
    indent + '  ' + commentSyntax.open + ' Variants: insert below this line ' + commentSyntax.close,
    indent + '</div>',
    indent + commentSyntax.open + ' impeccable-variants-end ' + id + ' ' + commentSyntax.close,
  ];

  // Replace the original element with the wrapper
  const newLines = [
    ...lines.slice(0, startLine),
    ...wrapperLines,
    ...lines.slice(endLine + 1),
  ];
  fs.writeFileSync(targetFile, newLines.join('\n'), 'utf-8');

  // Calculate insert line (the "insert below this line" comment)
  const insertLine = startLine + 6; // 0-indexed in the new file

  console.log(JSON.stringify({
    file: path.relative(process.cwd(), targetFile),
    startLine: startLine + 1,       // 1-indexed for the agent
    endLine: startLine + wrapperLines.length, // 1-indexed
    insertLine: insertLine + 1,     // 1-indexed: where variants go
    commentSyntax: commentSyntax,
    originalLineCount: originalLines.length,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function argVal(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

/**
 * Build search query strings in priority order (most specific first).
 * ID is most reliable, then specific class combos, then single classes, then raw query.
 */
function buildSearchQueries(elementId, classes, tag, query) {
  const queries = [];

  // 1. ID is the most specific
  if (elementId) {
    queries.push('id="' + elementId + '"');
  }

  // 2. Full class attribute match (for elements with distinctive multi-class combos)
  if (classes) {
    const classList = classes.split(',').map(c => c.trim()).filter(Boolean);
    if (classList.length > 1) {
      // Try the most distinctive class first (longest, most specific)
      const sorted = [...classList].sort((a, b) => b.length - a.length);
      queries.push('class="' + classList.join(' ') + '"'); // exact full match
      queries.push(sorted[0]); // most distinctive single class
    } else if (classList.length === 1) {
      queries.push(classList[0]);
    }
  }

  // 3. Tag + class combo (e.g., <section class="hero">)
  if (tag && classes) {
    const firstClass = classes.split(',')[0].trim();
    queries.push('<' + tag + ' class="' + firstClass);
  }

  // 4. Raw fallback query
  if (query) {
    queries.push(query);
  }

  return queries;
}

function detectCommentSyntax(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jsx' || ext === '.tsx') {
    return { open: '{/*', close: '*/}' };
  }
  // HTML, Vue, Svelte, Astro all use HTML comments
  return { open: '<!--', close: '-->' };
}

/**
 * Search project files for the query string (class name, ID, etc.)
 * Returns the first matching file path, or null.
 */
function findFileWithQuery(query, cwd, genOpts = {}) {
  const searchDirs = ['src', 'app', 'pages', 'components', 'public', 'views', 'templates', '.'];
  const seen = new Set();

  for (const dir of searchDirs) {
    const absDir = path.join(cwd, dir);
    if (!fs.existsSync(absDir)) continue;
    const result = searchDir(absDir, query, seen, 0, genOpts);
    if (result) return result;
  }
  return null;
}

function searchDir(dir, query, seen, depth, genOpts) {
  if (depth > 5) return null; // don't go too deep
  const realDir = fs.realpathSync(dir);
  if (seen.has(realDir)) return null;
  seen.add(realDir);

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return null; }

  // Check files first
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.includes(ext)) continue;

    const filePath = path.join(dir, entry.name);
    if (!genOpts.includeGenerated && isGeneratedFile(filePath, genOpts)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(query)) return filePath;
    } catch { /* skip unreadable files */ }
  }

  // Then recurse into directories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
    const result = searchDir(path.join(dir, entry.name), query, seen, depth + 1, genOpts);
    if (result) return result;
  }

  return null;
}

/**
 * Find the element's start and end line in the file.
 * The query is a class name, ID, or text snippet.
 * We find the line containing the query, then find the matching closing tag.
 */
function findElement(lines, query) {
  // Find the line containing the query
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(query)) {
      // Make sure this looks like a tag opening, not a comment or string
      const line = lines[i].trim();
      if (line.startsWith('<!--') || line.startsWith('{/*') || line.startsWith('//')) continue;
      // Skip lines inside data-impeccable-variant containers (already wrapped)
      if (lines[i].includes('data-impeccable-variant')) continue;
      startLine = i;
      break;
    }
  }

  if (startLine === -1) return null;

  // Find the end of this element by counting open/close tags
  const endLine = findClosingLine(lines, startLine);
  return { startLine, endLine };
}

/**
 * Starting from a line with an opening tag, find the line with the matching
 * closing tag by counting tag nesting depth.
 */
function findClosingLine(lines, start) {
  // Extract the tag name from the opening line
  const openMatch = lines[start].match(/<(\w+)[\s>]/);
  if (!openMatch) return start; // self-closing or text-only line

  const tagName = openMatch[1];
  let depth = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    // Count opening tags (not self-closing)
    const opens = (line.match(new RegExp('<' + tagName + '[\\s>]', 'g')) || []).length;
    const selfCloses = (line.match(new RegExp('<' + tagName + '[^>]*/>', 'g')) || []).length;
    const closes = (line.match(new RegExp('</' + tagName + '\\s*>', 'g')) || []).length;

    depth += opens - selfCloses - closes;

    if (depth <= 0) return i;
  }

  // If we can't find the close, return a reasonable guess
  return Math.min(start + 50, lines.length - 1);
}

// Auto-execute when run directly (node live-wrap.mjs ...)
const _running = process.argv[1];
if (_running?.endsWith('live-wrap.mjs') || _running?.endsWith('live-wrap.mjs/')) {
  wrapCli();
}

// Test exports (used by tests/live-wrap.test.mjs)
export { buildSearchQueries, findElement, findClosingLine, detectCommentSyntax };
