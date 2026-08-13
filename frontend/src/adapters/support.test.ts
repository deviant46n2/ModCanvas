import { describe, it, expect } from 'vitest';
import { resolveAdapter } from './support';

describe('Adapter resolution support — cross-version fallback detection', () => {
  it('exact (version, loader) match is not cross-version', () => {
    const r = resolveAdapter('1.21.1', 'neoforge');
    expect(r.exact).toBe(true);
    expect(r.crossVersion).toBe(false);
    expect(r.adapter.mcVersion).toBe('1.21.1');
  });

  it('known-version loader-miss (1.20.1 + quilt) resolves same-version: NOT cross-version', () => {
    const r = resolveAdapter('1.20.1', 'quilt');
    expect(r.exact).toBe(false);
    expect(r.crossVersion).toBe(false);
    expect(r.adapter.mcVersion).toBe('1.20.1');
  });

  it('unknown version (1.19.2) falls to the default card: cross-version', () => {
    const r = resolveAdapter('1.19.2', 'forge');
    expect(r.exact).toBe(false);
    expect(r.crossVersion).toBe(true);
    expect(r.adapter.mcVersion).toBe('1.21.1');
    expect(r.adapter.loader).toBe('neoforge');
  });

  it('minor version of a major (1.20.4) falls to the default card: cross-version', () => {
    // The s51 ADAPTER-SCOPE-MAJOR-ONLY policy: minors get no card, so a
    // 1.20.4 pack resolves to 1.21.1/neoforge — exactly the silent
    // wrong-syntax class the banner must surface.
    const r = resolveAdapter('1.20.4', 'forge');
    expect(r.exact).toBe(false);
    expect(r.crossVersion).toBe(true);
    expect(r.adapter.mcVersion).toBe('1.21.1');
  });

  it('unknown loader string normalizes to a known type before resolution', () => {
    // normalizeLoader is the caller's job; here we pass the normalized type.
    // This guards the shape: resolution never throws for a valid LoaderType.
    const r = resolveAdapter('1.21.1', 'fabric');
    expect(r.exact).toBe(true);
    expect(r.crossVersion).toBe(false);
  });
});
