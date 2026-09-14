import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tauri capability guard.
 *
 * A missing permission does not fail the build, does not warn at startup, and
 * does not throw anywhere a user would see. It rejects one IPC call at
 * runtime, and whatever depended on that call quietly stops working.
 *
 * Issue #93 was exactly that: `core:window:allow-destroy` had never been
 * granted, so `getCurrentWindow().destroy()` rejected on EVERY window close.
 * Nobody noticed for months because the close path falls back to quitting the
 * app when it is the last window — which covered for it in the single-window
 * case that everyone uses. Open a second window and the cover was gone: the
 * red button and Cmd+W did nothing at all, and the only way out was Cmd+Q.
 *
 * So: the permissions the frontend actually depends on are pinned here. This
 * cannot catch a permission nobody thought to list, but it does stop a granted
 * one from being dropped in a tidy-up.
 */

const CAPABILITIES = resolve(__dirname, '../../src-tauri/capabilities/default.json');

/** Permission → what breaks, silently, without it. */
const REQUIRED: Record<string, string> = {
  'core:window:allow-close': 'File ▸ Close Window',
  'core:window:allow-destroy': 'closing any window (issue #93) — the close path calls destroy(), not close()',
  'core:window:allow-show': 'the window never becomes visible at startup',
  'core:window:allow-hide': 'hiding a window',
  'core:window:allow-set-title': 'the title bar keeps the previous document name',
  'core:window:allow-start-dragging': 'dragging the frameless window by its title bar',
  'core:window:allow-minimize': 'the minimise traffic light',
  'core:window:allow-maximize': 'the zoom traffic light',
  'core:window:allow-unmaximize': 'restoring from maximised',
  'core:window:allow-toggle-maximize': 'double-clicking the title bar',
  'core:window:allow-outer-position': 'cascading a new window off the current one',
  'core:window:allow-outer-size': 'remembering window geometry',
  'core:window:allow-set-position': 'placing a new window',
};

type Permission = string | { identifier: string };

function raw(): Permission[] {
  return (JSON.parse(readFileSync(CAPABILITIES, 'utf-8')) as { permissions: Permission[] })
    .permissions;
}

function permissions(): string[] {
  return raw().map((p) => (typeof p === 'string' ? p : p.identifier));
}

describe('tauri capabilities', () => {
  const granted = permissions();

  for (const [permission, breaks] of Object.entries(REQUIRED)) {
    it(`grants ${permission} — without it, ${breaks}`, () => {
      expect(granted).toContain(permission);
    });
  }

  it('lists each bare permission once', () => {
    // Bare identifiers only. Object-form entries legitimately repeat — every
    // `fs:scope` allow-path is its own entry — so counting those as duplicates
    // would flag a correct file.
    const bare = raw().filter((p): p is string => typeof p === 'string');
    expect(bare.length).toBe(new Set(bare).size);
  });
});
