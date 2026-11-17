import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORNER, SPINNER } from '@pyxis/app-sdk';

/**
 * Identity contract: Evo draws the title bar, so it keeps its own copy of
 * the waterdrop corner and the spinner colours (evo/src/shell/identity.rs).
 * Same pattern as the settings suite: the values are read out of the Rust
 * source, so a corner or colour changed on one side only fails here
 * instead of showing as a frame that doesn't match the shell.
 */

const IDENTITY_RS = resolve(__dirname, '../../../../geckos/evo/src/shell/identity.rs');
const haveRust = existsSync(IDENTITY_RS);

if (!haveRust) {
  console.warn(`identityContract: ${IDENTITY_RS} not found; Evo's half of the contract is not checked`);
}

/** The numbers of a `pub const NAME: [T; N] = [...];`. */
function rustArray(source: string, name: string): number[] {
  const m = source.match(new RegExp(`pub const ${name}\\s*:\\s*\\[[^\\]]+\\]\\s*=\\s*\\[([^\\]]*)\\]\\s*;`));
  if (!m) throw new Error(`pub const ${name} not found in identity.rs`);
  return m[1]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x));
}

const hexBytes = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('identity contract with Evo', () => {
  it.skipIf(!haveRust)('CORNER_RADII is CORNER, top-left, top-right, bottom-right, bottom-left', () => {
    const source = readFileSync(IDENTITY_RS, 'utf8');
    expect(rustArray(source, 'CORNER_RADII')).toEqual([CORNER.tl, CORNER.tr, CORNER.br, CORNER.bl]);
  });

  const colours: [string, keyof typeof SPINNER][] = [
    ['SPINNER_RED', 'red'],
    ['SPINNER_RED_OUTLINE', 'redOutline'],
    ['SPINNER_BLUE', 'blue'],
    ['SPINNER_BLUE_OUTLINE', 'blueOutline'],
    ['SPINNER_YELLOW', 'yellow'],
    ['SPINNER_YELLOW_OUTLINE', 'yellowOutline'],
  ];
  for (const [rust, ts] of colours) {
    it.skipIf(!haveRust)(`${rust} is SPINNER.${ts}`, () => {
      const source = readFileSync(IDENTITY_RS, 'utf8');
      expect(rustArray(source, rust)).toEqual(hexBytes(SPINNER[ts]));
    });
  }

  it("identity.css carries the same corner and spinner colours", () => {
    const css = readFileSync(resolve(__dirname, '../../../packages/app-sdk/src/identity.css'), 'utf8');
    const v = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    expect(v('--px-corner')).toBe(`${CORNER.tl}px ${CORNER.tr}px ${CORNER.br}px ${CORNER.bl}px`);
    expect(v('--px-spinner-red')).toBe(SPINNER.red);
    expect(v('--px-spinner-red-outline')).toBe(SPINNER.redOutline);
    expect(v('--px-spinner-blue')).toBe(SPINNER.blue);
    expect(v('--px-spinner-blue-outline')).toBe(SPINNER.blueOutline);
    expect(v('--px-spinner-yellow')).toBe(SPINNER.yellow);
    expect(v('--px-spinner-yellow-outline')).toBe(SPINNER.yellowOutline);
  });
});
