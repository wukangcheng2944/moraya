import { describe, it, expect } from 'vitest';
import { captureAnchor, locateAnchor } from './reading-anchor';

const DOC = [
  '# Title',            // 0
  '',                   // 1
  'Alpha paragraph.',   // 2
  '',                   // 3
  'Beta paragraph.',    // 4
  '',                   // 5
  'Gamma paragraph.',   // 6
  '',                   // 7
  'Delta paragraph.',   // 8
].join('\n');

describe('captureAnchor', () => {
  it('fingerprints the visible line and the next two non-blank ones', () => {
    const a = captureAnchor(DOC, 4);
    expect(a.line).toBe(4);
    expect(a.lines).toEqual(['beta paragraph.', 'gamma paragraph.', 'delta paragraph.']);
  });

  it('normalises whitespace and case so reformatting still matches', () => {
    expect(captureAnchor('  Alpha   Paragraph.  \nx\ny', 0).lines[0]).toBe('alpha paragraph.');
  });

  it('carries the sub-line offset verbatim', () => {
    expect(captureAnchor(DOC, 4, 17).offsetWithinLine).toBe(17);
  });

  it('clamps a line past the end', () => {
    expect(captureAnchor(DOC, 999).line).toBe(8);
  });

  it('records the old length for the proportional fallback', () => {
    expect(captureAnchor(DOC, 0).totalLines).toBe(9);
  });
});

describe('locateAnchor', () => {
  it('finds an unmoved anchor', () => {
    expect(locateAnchor(DOC, captureAnchor(DOC, 4))).toBe(4);
  });

  it('follows the text down when lines are inserted above', () => {
    const anchor = captureAnchor(DOC, 4);
    const grown = '新增一行\n又一行\n' + DOC;
    expect(locateAnchor(grown, anchor)).toBe(6);
  });

  it('follows the text up when lines are removed above', () => {
    const anchor = captureAnchor(DOC, 4);
    const shrunk = DOC.split('\n').slice(2).join('\n');
    expect(locateAnchor(shrunk, anchor)).toBe(2);
  });

  it('survives the lines BELOW the anchor being rewritten', () => {
    // The run no longer matches, but the first line alone still pins it.
    const anchor = captureAnchor(DOC, 4);
    const edited = DOC.replace('Gamma paragraph.', 'Something else entirely.')
      .replace('Delta paragraph.', 'And another.');
    expect(locateAnchor(edited, anchor)).toBe(4);
  });

  it('prefers the occurrence nearest where it was, not the first', () => {
    // A repeated section must not drag the reader back to the top of the file.
    const repeated = ['Shared line.', 'x', 'Shared line.', 'y', 'Shared line.'].join('\n');
    const anchor = captureAnchor(repeated, 4);
    expect(locateAnchor(repeated, anchor)).toBe(4);
  });

  it('tolerates blank lines appearing inside the fingerprint', () => {
    const anchor = captureAnchor(DOC, 4);
    const spaced = DOC.replace('Gamma paragraph.', '\n\nGamma paragraph.');
    expect(locateAnchor(spaced, anchor)).toBe(4);
  });

  it('falls back proportionally when the anchor text is gone', () => {
    const anchor = captureAnchor(DOC, 4); // halfway down a 9-line file
    const replaced = Array.from({ length: 21 }, (_, i) => `Totally new ${i}`).join('\n');
    expect(locateAnchor(replaced, anchor)).toBe(10); // 4/8 of 20
  });

  it('gives up rather than guess when the old document was a single line', () => {
    const anchor = captureAnchor('only', 0);
    expect(locateAnchor('completely different', anchor)).toBeNull();
  });

  it('handles an anchor that sat on a blank line', () => {
    const anchor = captureAnchor('a\n\n\n\n\nb', 3);
    expect(anchor.lines).toEqual(['b']);
    expect(locateAnchor('a\n\n\n\n\nb', anchor)).toBe(5);
  });

  it('does not crash on an empty new document', () => {
    expect(() => locateAnchor('', captureAnchor(DOC, 4))).not.toThrow();
  });
});
