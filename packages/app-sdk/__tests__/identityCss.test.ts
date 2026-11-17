import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('identity.css tokens and accessibility rules', () => {
  const css = readFileSync(resolve(__dirname, '../src/identity.css'), 'utf8');

  it('sets --px-font-display-weight to 400 matching remochi Mochi Light', () => {
    expect(css).toContain('--px-font-display-weight: 400;');
  });

  it('boosts remochi surface, text, border, and focus tokens in high contrast mode (light and dark)', () => {
    expect(css).toContain(":root[data-high-contrast='true']");
    expect(css).toContain(":root[data-mochi-theme='dark'][data-high-contrast='true']");
    expect(css).toContain('.mochi-theme-wrapper');
    for (const token of [
      '--mochi-bg:',
      '--mochi-panel-bg:',
      '--mochi-surface:',
      '--mochi-text:',
      '--mochi-text-muted:',
      '--mochi-border:',
      '--mochi-panel-border:',
      '--mochi-focus-ring:',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('respects data-motion=off/reduced globally and keeps prefers-reduced-motion', () => {
    expect(css).toContain(":root[data-motion='off']");
    expect(css).toContain(":root[data-motion='reduced']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('provides scaled SVG cursor fallbacks for large and xlarge cursor sizes', () => {
    expect(css).toContain(":root[data-cursor-size='large']");
    expect(css).toContain(":root[data-cursor-size='xlarge']");
    expect(css).toContain("width='32' height='32'");
    expect(css).toContain("width='48' height='48'");
    expect(css).toContain('data:image/svg+xml');
  });
});
