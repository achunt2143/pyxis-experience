import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';

// Every SDK source file as text, keyed by path from this directory ('../../index.ts'). Read through
// Vite so the test needs no Node types; keys are normalised to SDK-relative ('index.ts') below.
const raw = import.meta.glob<string>(['../../**/*.ts', '../../**/*.tsx'], { query: '?raw', import: 'default', eager: true });
const SOURCES = new Map(Object.entries(raw).map(([key, text]) => [key.replace(/^\.\.\/\.\.\//, ''), text]));

const ENTRY = 'index.ts';

/** Every module specifier in a file: static imports, re-exports and `import('…')`, comments ignored. */
function specifiers(source: string): string[] {
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;
  return [...source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').matchAll(re)].map((m) => m[2]!);
}

/** `from` is an SDK-relative file ('wallpaper/x.ts'); returns the SDK-relative file `spec` names, if it is one. */
function resolveRelative(from: string, spec: string): string | null {
  const parts = from.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const base = parts.join('/');
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((c) => SOURCES.has(c)) ?? null;
}

/** Every file reachable from `entry` through relative imports, with the specifiers each one uses. */
function graph(entry: string) {
  const files = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    const specs = specifiers(SOURCES.get(file)!);
    files.set(file, specs);
    for (const spec of specs) {
      const next = spec.startsWith('.') ? resolveRelative(file, spec) : null;
      if (next) queue.push(next);
    }
  }
  return files;
}

describe('the main SDK entry', () => {
  const files = graph(ENTRY);

  it('walks a real graph (the walker is not vacuously passing)', () => {
    expect([...files.keys()]).toEqual(expect.arrayContaining(['index.ts', 'AppShell.tsx', 'usePyxisTheme.ts', 'wallpaper/DynamicWallpaper.tsx']));
    expect(files.size).toBeGreaterThan(20);
  });

  it('never reaches @duyojs/duyo or the ./duyo subpath', () => {
    const offenders: string[] = [];
    for (const [file, specs] of files) {
      if (file.startsWith('duyo/')) offenders.push(`${file} is itself under src/duyo`);
      for (const spec of specs) {
        if (spec.startsWith('@duyojs/') || /^\.{1,2}\/(.*\/)?duyo(\/|$)/.test(spec)) offenders.push(`${file} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the walker would catch an import of Duyo', () => {
    expect(specifiers(`import { kind } from '@duyojs/duyo';\nexport * from "./duyo";\nawait import('../duyo/x')`)).toEqual([
      '@duyojs/duyo',
      './duyo',
      '../duyo/x',
    ]);
    expect(specifiers(`// import x from '@duyojs/duyo'\n/* export * from './duyo' */`)).toEqual([]);
  });

  it('is what package.json exports as ".", beside "./duyo", with Duyo an optional peer', () => {
    expect(pkg.exports['.']).toBe(`./src/${ENTRY}`);
    expect(pkg.exports['./duyo']).toBe('./src/duyo/index.ts');
    expect(pkg.peerDependenciesMeta['@duyojs/duyo'].optional).toBe(true);
    expect(pkg.dependencies).not.toHaveProperty('@duyojs/duyo');
    expect(pkg.devDependencies).toHaveProperty('@duyojs/duyo');
  });
});
