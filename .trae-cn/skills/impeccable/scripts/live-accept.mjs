/**
 * CLI helper: deterministic accept/discard of variant sessions.
 *
 * Usage:
 *   node live-accept.mjs --id SESSION_ID --discard
 *   node live-accept.mjs --id SESSION_ID --variant N
 *
 * For discard: removes the entire variant wrapper and restores the original.
 * For accept: replaces the wrapper with the chosen variant's content. If the
 * session had a colocated <style> block, it's preserved with carbonize markers
 * for a background agent to integrate into the project's CSS.
 *
 * Output: JSON to stdout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isGeneratedFile } from './is-generated.mjs';

const EXTENSIONS = ['.html', '.jsx', '.tsx', '.vue', '.svelte', '.astro'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function acceptCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node live-accept.mjs [options]

Deterministic accept/discard for live variant sessions.

Modes:
  --discard          Remove variants, restore original
  --variant N        Accept variant N, discard the rest

Required:
  --id SESSION_ID    Session ID of the variant wrapper

Output (JSON):
  { handled, file, carbonize }`);
    process.exit(0);
  }

  const id = argVal(args, '--id');
  const variantNum = argVal(args, '--variant');
  const isDiscard = args.includes('--discard');

  if (!id) { console.error('Missing --id'); process.exit(1); }
  if (!isDiscard && !variantNum) { console.error('Need --discard or --variant N'); process.exit(1); }

  // Find the file containing this session's markers
  const found = findSessionFile(id, process.cwd());
  if (!found) {
    console.log(JSON.stringify({ handled: false, error: 'Session markers not found for id: ' + id }));
    process.exit(0);
  }

  const { file: targetFile, content, lines } = found;
  const relFile = path.relative(process.cwd(), targetFile);

  // Bail if the session lives in a generated file. The agent manually wrote
  // the wrapper there for preview, and is responsible for writing the
  // accepted variant to true source (or cleaning up on discard). See
  // "Handle fallback" in live.md.
  if (isGeneratedFile(targetFile, { cwd: process.cwd() })) {
    console.log(JSON.stringify({
      handled: false,
      mode: 'fallback',
      file: relFile,
      hint: 'Session is in a generated file. Persist the accepted variant in source; do not rely on this script.',
    }));
    process.exit(0);
  }

  if (isDiscard) {
    const result = handleDiscard(id, lines, targetFile);
    console.log(JSON.stringify({ handled: true, file: relFile, carbonize: false, ...result }));
  } else {
    const result = handleAccept(id, variantNum, lines, targetFile);
    console.log(JSON.stringify({ handled: true, file: relFile, ...result }));
  }
}

// ---------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------

function handleDiscard(id, lines, targetFile) {
  const block = findMarkerBlock(id, lines);
  if (!block) return { handled: false, error: 'Markers not found' };

  const original = extractOriginal(lines, block);
  const indent = lines[block.start].match(/^(\s*)/)[1];

  // De-indent the original content back to the marker's indentation level
  const restored = deindentContent(original, indent);

  const newLines = [
    ...lines.slice(0, block.start),
    ...restored,
    ...lines.slice(block.end + 1),
  ];
  fs.writeFileSync(targetFile, newLines.join('\n'), 'utf-8');
  return {};
}

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

function handleAccept(id, variantNum, lines, targetFile) {
  const block = findMarkerBlock(id, lines);
  if (!block) return { handled: false, error: 'Markers not found' };

  const indent = lines[block.start].match(/^(\s*)/)[1];
  const commentSyntax = detectCommentSyntax(targetFile);

  // Extract the chosen variant's inner content
  const variantContent = extractVariant(lines, block, variantNum);
  if (!variantContent) return { handled: false, error: 'Variant ' + variantNum + ' not found' };

  // Extract CSS block if present
  const cssContent = extractCss(lines, block, id);

  // Check if carbonizing is needed:
  // - CSS block exists, OR
  // - variant HTML contains helper classes/attributes that need cleanup
  const variantText = variantContent.join('\n');
  const hasHelperAttrs = variantText.includes('data-impeccable-variant');
  const needsCarbonize = !!(cssContent || hasHelperAttrs);

  // Build the replacement
  const restored = deindentContent(variantContent, indent);
  const replacement = [];

  if (cssContent) {
    replacement.push(indent + commentSyntax.open + ' impeccable-carbonize-start ' + id + ' ' + commentSyntax.close);
    replacement.push(indent + '<style data-impeccable-css="' + id + '">');
    // Re-indent CSS content to match
    for (const cssLine of cssContent) {
      replacement.push(indent + cssLine.trimStart());
    }
    replacement.push(indent + '</style>');
    replacement.push(indent + commentSyntax.open + ' impeccable-carbonize-end ' + id + ' ' + commentSyntax.close);
  }

  // Keep the `@scope ([data-impeccable-variant="N"])` selectors in the
  // carbonize CSS block working visually by re-wrapping the accepted content
  // in a data-impeccable-variant="N" div with `display: contents` (so layout
  // isn't affected). The carbonize agent strips this attribute + wrapper when
  // it moves the CSS to a proper stylesheet.
  if (cssContent) {
    replacement.push(indent + '<div data-impeccable-variant="' + variantNum + '" style="display: contents">');
    replacement.push(...restored);
    replacement.push(indent + '</div>');
  } else {
    replacement.push(...restored);
  }

  const newLines = [
    ...lines.slice(0, block.start),
    ...replacement,
    ...lines.slice(block.end + 1),
  ];
  fs.writeFileSync(targetFile, newLines.join('\n'), 'utf-8');

  return { carbonize: needsCarbonize };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Find the start/end marker lines for a session.
 * Returns { start, end } (0-indexed line numbers) or null.
 */
function findMarkerBlock(id, lines) {
  let start = -1;
  let end = -1;
  const startPattern = 'impeccable-variants-start ' + id;
  const endPattern = 'impeccable-variants-end ' + id;

  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].includes(startPattern)) start = i;
    if (lines[i].includes(endPattern)) { end = i; break; }
  }

  return (start !== -1 && end !== -1) ? { start, end } : null;
}

/**
 * Extract the original element content from within the variant wrapper.
 * Returns an array of lines (still indented as stored in the wrapper).
 *
 * CSS inside a <style> block can reference `data-impeccable-variant="N"` via
 * `@scope`, which would falsely match the HTML div we're looking for — so skip
 * style regions entirely.
 */
function extractOriginal(lines, block) {
  let inOriginal = false;
  let inStyle = false;
  let depth = 0;
  const content = [];

  for (let i = block.start; i <= block.end; i++) {
    const line = lines[i];

    if (!inStyle && /<style[\s>]/.test(line)) { inStyle = true; continue; }
    if (inStyle) {
      if (line.trimStart().startsWith('</style>')) inStyle = false;
      continue;
    }

    if (!inOriginal && line.includes('data-impeccable-variant="original"')) {
      inOriginal = true;
      depth = 1;
      continue; // skip the opening <div data-impeccable-variant="original">
    }

    if (inOriginal) {
      // Count div opens/closes to find the matching </div>
      const opens = (line.match(/<div[\s>]/g) || []).length;
      const closes = (line.match(/<\/div\s*>/g) || []).length;
      depth += opens - closes;

      if (depth <= 0) break; // this is the closing </div> of the original wrapper
      content.push(line);
    }
  }

  return content;
}

/**
 * Extract a specific variant's inner content (stripping the wrapper div).
 * Returns an array of lines, or null if not found.
 *
 * Skip <style> blocks — see extractOriginal for why.
 */
function extractVariant(lines, block, variantNum) {
  let inVariant = false;
  let inStyle = false;
  let depth = 0;
  const content = [];

  for (let i = block.start; i <= block.end; i++) {
    const line = lines[i];

    if (!inStyle && /<style[\s>]/.test(line)) { inStyle = true; continue; }
    if (inStyle) {
      if (line.trimStart().startsWith('</style>')) inStyle = false;
      continue;
    }

    if (!inVariant && line.includes('data-impeccable-variant="' + variantNum + '"')) {
      inVariant = true;
      depth = 1;
      continue; // skip the opening <div data-impeccable-variant="N">
    }

    if (inVariant) {
      const opens = (line.match(/<div[\s>]/g) || []).length;
      const closes = (line.match(/<\/div\s*>/g) || []).length;
      depth += opens - closes;

      if (depth <= 0) break; // closing </div> of the variant wrapper
      content.push(line);
    }
  }

  return content.length > 0 ? content : null;
}

/**
 * Extract the colocated <style> block content (between the style tags).
 * Returns an array of CSS lines, or null if no style block found.
 */
function extractCss(lines, block, id) {
  const styleAttr = 'data-impeccable-css="' + id + '"';
  let inStyle = false;
  const content = [];

  for (let i = block.start; i <= block.end; i++) {
    const line = lines[i];

    if (!inStyle && line.includes(styleAttr)) {
      inStyle = true;
      continue; // skip the <style> opening tag
    }

    if (inStyle) {
      if (line.trimStart().startsWith('</style>')) break;
      content.push(line);
    }
  }

  return content.length > 0 ? content : null;
}

/**
 * De-indent content that was indented by live-wrap.mjs.
 * The wrap script adds `indent + '    '` (4 extra spaces) to each line.
 * We restore to just `indent` level.
 */
function deindentContent(contentLines, baseIndent) {
  // Find the minimum indentation in the content to determine how much was added
  let minIndent = Infinity;
  for (const line of contentLines) {
    if (line.trim() === '') continue;
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    minIndent = Math.min(minIndent, leadingSpaces);
  }
  if (minIndent === Infinity) minIndent = 0;

  // Strip the extra indentation and re-add base indent
  return contentLines.map(line => {
    if (line.trim() === '') return '';
    return baseIndent + line.slice(minIndent);
  });
}

function detectCommentSyntax(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jsx' || ext === '.tsx') {
    return { open: '{/*', close: '*/}' };
  }
  return { open: '<!--', close: '-->' };
}

// ---------------------------------------------------------------------------
// File search (find the file containing session markers)
// ---------------------------------------------------------------------------

function findSessionFile(id, cwd) {
  const marker = 'impeccable-variants-start ' + id;
  const searchDirs = ['src', 'app', 'pages', 'components', 'public', 'views', 'templates', '.'];
  const seen = new Set();

  for (const dir of searchDirs) {
    const absDir = path.join(cwd, dir);
    if (!fs.existsSync(absDir)) continue;
    const result = searchDir(absDir, marker, seen, 0);
    if (result) {
      const content = fs.readFileSync(result, 'utf-8');
      return { file: result, content, lines: content.split('\n') };
    }
  }
  return null;
}

function searchDir(dir, query, seen, depth) {
  if (depth > 5) return null;
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return null; }
  if (seen.has(realDir)) return null;
  seen.add(realDir);

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return null; }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
    const filePath = path.join(dir, entry.name);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(query)) return filePath;
    } catch { /* skip */ }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const result = searchDir(path.join(dir, entry.name), query, seen, depth + 1);
    if (result) return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function argVal(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

// Auto-execute when run directly
const _running = process.argv[1];
if (_running?.endsWith('live-accept.mjs') || _running?.endsWith('live-accept.mjs/')) {
  acceptCli();
}

export { findMarkerBlock, extractOriginal, extractVariant, extractCss, deindentContent, detectCommentSyntax };
