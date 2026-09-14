import { beforeEach, describe, expect, it } from 'vitest';
import {
  shouldAutoSave,
  autoSaveTickMs,
  noteEdit,
  lastEditTime,
  resetEditClock,
  AUTOSAVE_MAX_RANGE,
  AUTOSAVE_IDLE_RANGE,
} from './autosave';

const MIN = 60_000;
// The shipped defaults, expressed in the seconds the settings now store.
const TIMING = { maxSeconds: 600, idleSeconds: 180 };

describe('shouldAutoSave', () => {
  it('should not save when there are no pending edits', () => {
    expect(shouldAutoSave(100 * MIN, 0, 99 * MIN, TIMING)).toBe(false);
  });

  it('should not save while typing continues within both windows', () => {
    const now = 20 * MIN;
    // edits began 5 min ago, last keystroke 10s ago
    expect(shouldAutoSave(now, now - 5 * MIN, now - 10_000, TIMING)).toBe(false);
  });

  it('should save once input has paused for the idle delay', () => {
    const now = 20 * MIN;
    // edits began 4 min ago, last keystroke 3 min ago
    expect(shouldAutoSave(now, now - 4 * MIN, now - 3 * MIN, TIMING)).toBe(true);
  });

  it('should not save when the pause is shorter than the idle delay', () => {
    const now = 20 * MIN;
    expect(shouldAutoSave(now, now - 4 * MIN, now - 2 * MIN, TIMING)).toBe(false);
  });

  it('should force-save at the max interval even while typing continuously', () => {
    const now = 20 * MIN;
    // edits began 10 min ago, still typing (last keystroke just now)
    expect(shouldAutoSave(now, now - 10 * MIN, now, TIMING)).toBe(true);
  });

  it('should not force-save before the max interval elapses', () => {
    const now = 20 * MIN;
    expect(shouldAutoSave(now, now - 9 * MIN, now, TIMING)).toBe(false);
  });

  it('should fall back to the max-interval branch when lastEditAt is unknown', () => {
    const now = 20 * MIN;
    expect(shouldAutoSave(now, now - 10 * MIN, 0, TIMING)).toBe(true);
    expect(shouldAutoSave(now, now - 5 * MIN, 0, TIMING)).toBe(false);
  });

  it('should clamp degenerate settings instead of firing constantly', () => {
    const now = 20 * MIN;
    // 0 means "save on every tick" if taken literally; the floors prevent that.
    const zero = { maxSeconds: 0, idleSeconds: 0 };
    expect(shouldAutoSave(now, now - 1_000, now, zero)).toBe(false);
    expect(shouldAutoSave(now, now - AUTOSAVE_MAX_RANGE.min * 1000, now, zero)).toBe(true);
  });

  // ── Seconds (issue #91) ───────────────────────────────────────────────────

  it('honours a sub-minute idle delay', () => {
    const now = 20 * MIN;
    const fast = { maxSeconds: 60, idleSeconds: 5 };
    expect(shouldAutoSave(now, now - 10_000, now - 4_000, fast)).toBe(false);
    expect(shouldAutoSave(now, now - 10_000, now - 5_000, fast)).toBe(true);
  });

  it('honours a sub-minute max interval while typing continuously', () => {
    const now = 20 * MIN;
    const fast = { maxSeconds: 10, idleSeconds: 3600 };
    expect(shouldAutoSave(now, now - 9_000, now, fast)).toBe(false);
    expect(shouldAutoSave(now, now - 10_000, now, fast)).toBe(true);
  });
});

describe('autoSaveTickMs', () => {
  it('keeps the original coarse tick for long intervals', () => {
    expect(autoSaveTickMs({ maxSeconds: 600, idleSeconds: 180 })).toBe(15_000);
  });

  it('tracks the SHORTER of the two intervals', () => {
    // A 10-minute max with a 6-second idle has to poll for the 6 seconds.
    expect(autoSaveTickMs({ maxSeconds: 600, idleSeconds: 6 })).toBe(2_000);
    expect(autoSaveTickMs({ maxSeconds: 6, idleSeconds: 600 })).toBe(2_000);
  });

  it('never polls faster than once a second', () => {
    expect(autoSaveTickMs({ maxSeconds: 1, idleSeconds: 1 })).toBe(1_000);
    expect(autoSaveTickMs({ maxSeconds: 0, idleSeconds: 0 })).toBe(1_000);
  });

  it('fires within a third of the shortest interval', () => {
    // The guarantee the ticker owes the setting: whatever you ask for, the
    // poll is frequent enough to land inside it.
    for (const s of [AUTOSAVE_IDLE_RANGE.min, 5, 10, 30, 120, AUTOSAVE_MAX_RANGE.max]) {
      expect(autoSaveTickMs({ maxSeconds: s, idleSeconds: s })).toBeLessThanOrEqual(s * 1000);
    }
  });
});

// ── Edit-activity clock ─────────────────────────────────────────────────────

describe('edit clock', () => {
  beforeEach(() => resetEditClock());

  it('starts unset', () => {
    expect(lastEditTime()).toBe(0);
  });

  it('advances on every edit, not just the first', () => {
    // The whole point: markDirty() stops notifying once a document is dirty and
    // visual mode never re-serializes content, so the store could only ever
    // report the FIRST keystroke. The idle timer measured from there, turning
    // "save once input pauses" into "save N minutes after you start typing".
    noteEdit(1_000);
    noteEdit(2_000);
    noteEdit(9_000);
    expect(lastEditTime()).toBe(9_000);
  });

  it('keeps the idle condition from firing while the user is still typing', () => {
    const timing = { maxSeconds: 600, idleSeconds: 180 };
    const started = 0;
    noteEdit(started);

    // Two minutes in, still typing every 30s.
    for (let t = 30_000; t <= 120_000; t += 30_000) noteEdit(t);
    // Three minutes after the FIRST edit — the old frozen timestamp fired here.
    expect(shouldAutoSave(180_000, started + 1, lastEditTime(), timing)).toBe(false);

    // Now they stop: three idle minutes after the LAST edit.
    expect(shouldAutoSave(120_000 + 180_000, started + 1, lastEditTime(), timing)).toBe(true);
  });

  it('still force-saves at the max interval while typing continuously', () => {
    const timing = { maxSeconds: 600, idleSeconds: 180 };
    for (let t = 0; t <= 600_000; t += 30_000) noteEdit(t);
    expect(shouldAutoSave(600_001, 1, lastEditTime(), timing)).toBe(true);
  });

  it('resets', () => {
    noteEdit(5_000);
    resetEditClock();
    expect(lastEditTime()).toBe(0);
  });
});
