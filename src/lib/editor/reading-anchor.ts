/**
 * Keeping the reader's place across an external reload (issue #92).
 *
 * When a file changes on disk — an AI agent editing alongside you, another
 * editor, a `git checkout` — the tab reloads it. That reload went through
 * `replaceContentAndScrollToTop`, which does exactly what its name says, and
 * the reader lost their position in a long document every time something else
 * touched the file.
 *
 * An absolute `scrollTop` cannot simply be restored: the new text may be
 * longer or shorter above the viewport, so the same pixel offset lands
 * somewhere else. What stays meaningful across an edit is the TEXT that was at
 * the top of the viewport, so that is what gets remembered and re-found.
 *
 * Pure functions here; the caller reads and writes the DOM.
 *
 * Named "reading" rather than "scroll" deliberately: +page.svelte already has
 * a `ScrollAnchor` for split-pane scroll SYNC, which is a different job (two
 * live panes, same document) from this one (one pane, two versions of a
 * document).
 */

/** Normalise a line for matching: collapse runs of whitespace, trim, lowercase. */
function key(line: string): string {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A remembered reading position.
 *
 * `lines` is a short run starting at the top of the viewport rather than a
 * single line: one line of prose is often not unique in a document (think
 * `| --- |`, a bare `}`, or a repeated heading), and a run of three is.
 */
export interface ReadingAnchor {
  /** 0-based index in the OLD document of the first visible line. */
  line: number;
  /** Normalised text of that line and the two after it, blank lines dropped. */
  lines: string[];
  /** Pixels the viewport was scrolled past the top of `line`. */
  offsetWithinLine: number;
  /** Total line count of the old document, for the proportional fallback. */
  totalLines: number;
}

/** How many lines form the fingerprint. */
const RUN = 3;

/**
 * Capture the anchor for `line` in `text`.
 *
 * `offsetWithinLine` is carried verbatim; the caller measures it.
 */
export function captureAnchor(
  text: string,
  line: number,
  offsetWithinLine = 0,
): ReadingAnchor {
  const all = text.split('\n');
  const clamped = Math.max(0, Math.min(line, Math.max(0, all.length - 1)));
  const lines: string[] = [];
  for (let i = clamped; i < all.length && lines.length < RUN; i++) {
    const k = key(all[i] ?? '');
    // Blank lines carry no identity, so they neither join the fingerprint nor
    // stop it being collected.
    if (k) lines.push(k);
  }
  return { line: clamped, lines, offsetWithinLine, totalLines: all.length };
}

/**
 * Find where `anchor` ended up in `text`, as a 0-based line index.
 *
 * Returns null when the document has changed past recognition — the caller
 * should then leave the scroll position alone rather than guess.
 */
export function locateAnchor(text: string, anchor: ReadingAnchor): number | null {
  if (anchor.lines.length === 0) {
    // The anchor was in a run of blank lines. Nothing to match on, but the
    // proportional position is still better than jumping to the top.
    return proportional(text, anchor);
  }
  const all = text.split('\n').map(key);

  // Exact run match, preferring the occurrence nearest where it used to be:
  // a document with repeated sections should not send the reader to the first
  // one just because it comes first.
  let best: number | null = null;
  for (let i = 0; i < all.length; i++) {
    if (!matchesRunAt(all, i, anchor.lines)) continue;
    if (best === null || Math.abs(i - anchor.line) < Math.abs(best - anchor.line)) best = i;
  }
  if (best !== null) return best;

  // The run is gone — the edit landed on it. Fall back to the first line alone,
  // which survives reformatting of the lines below it.
  const first = anchor.lines[0]!;
  let firstOnly: number | null = null;
  for (let i = 0; i < all.length; i++) {
    if (all[i] !== first) continue;
    if (firstOnly === null || Math.abs(i - anchor.line) < Math.abs(firstOnly - anchor.line)) {
      firstOnly = i;
    }
  }
  if (firstOnly !== null) return firstOnly;

  return proportional(text, anchor);
}

/** Does the fingerprint start at `i`, skipping blank lines as capture did? */
function matchesRunAt(all: string[], i: number, run: string[]): boolean {
  if (all[i] !== run[0]) return false;
  let cursor = i + 1;
  for (let r = 1; r < run.length; r++) {
    while (cursor < all.length && all[cursor] === '') cursor++;
    if (all[cursor] !== run[r]) return false;
    cursor++;
  }
  return true;
}

/**
 * Last resort: the same relative depth in the new document.
 *
 * Returns null for a document that was empty before, where "80% of nothing"
 * means nothing.
 */
function proportional(text: string, anchor: ReadingAnchor): number | null {
  if (anchor.totalLines <= 1) return null;
  const all = text.split('\n');
  const ratio = anchor.line / (anchor.totalLines - 1);
  return Math.round(ratio * Math.max(0, all.length - 1));
}
