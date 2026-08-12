import { describe, it, expect } from 'vitest';
import {
  getAdapter,
  getAdapterEntry,
  registeredAdapters,
  registeredKeys,
  Minecraft1211NeoForgeAdapter,
  Minecraft1211ForgeAdapter,
  Minecraft1211FabricAdapter,
  Minecraft1211QuiltAdapter,
  Minecraft121ForgeAdapter,
  Minecraft121NeoForgeAdapter,
  Minecraft121FabricAdapter,
} from './index';


describe('Adapter Matrix — Registry', () => {
  it('should have exactly 7 registered adapters', () => {
    expect(registeredAdapters()).toHaveLength(7);
    expect(registeredKeys()).toHaveLength(7);
  });

  it('should register all known version-loader pairs', () => {
    const keys = registeredKeys();
    expect(keys).toContain('1.20.1-forge');
    expect(keys).toContain('1.20.1-neoforge');
    expect(keys).toContain('1.20.1-fabric');
    expect(keys).toContain('1.21.1-neoforge');
    expect(keys).toContain('1.21.1-forge');
    expect(keys).toContain('1.21.1-fabric');
    expect(keys).toContain('1.21.1-quilt');
  });
});

describe('Adapter Matrix — Exact Resolution', () => {
  it('should resolve 1.21.1 neoforge exactly', () => {
    const adapter = getAdapter('1.21.1', 'neoforge');
    expect(adapter.mcVersion).toBe('1.21.1');
    expect(adapter.loader).toBe('neoforge');
    expect(adapter).toBeInstanceOf(Minecraft1211NeoForgeAdapter);
  });

  it('should resolve 1.21.1 forge exactly', () => {
    const adapter = getAdapter('1.21.1', 'forge');
    expect(adapter.mcVersion).toBe('1.21.1');
    expect(adapter.loader).toBe('forge');
    expect(adapter).toBeInstanceOf(Minecraft1211ForgeAdapter);
  });

  it('should resolve 1.21.1 fabric exactly', () => {
    const adapter = getAdapter('1.21.1', 'fabric');
    expect(adapter.mcVersion).toBe('1.21.1');
    expect(adapter.loader).toBe('fabric');
    expect(adapter).toBeInstanceOf(Minecraft1211FabricAdapter);
  });

  it('should resolve 1.21.1 quilt exactly', () => {
    const adapter = getAdapter('1.21.1', 'quilt');
    expect(adapter.mcVersion).toBe('1.21.1');
    expect(adapter.loader).toBe('quilt');
    expect(adapter).toBeInstanceOf(Minecraft1211QuiltAdapter);
  });

  it('should resolve 1.20.1 forge exactly', () => {
    const adapter = getAdapter('1.20.1', 'forge');
    expect(adapter.mcVersion).toBe('1.20.1');
    expect(adapter.loader).toBe('forge');
    expect(adapter).toBeInstanceOf(Minecraft121ForgeAdapter);
  });

  it('should resolve 1.20.1 neoforge exactly', () => {
    const adapter = getAdapter('1.20.1', 'neoforge');
    expect(adapter.mcVersion).toBe('1.20.1');
    expect(adapter.loader).toBe('neoforge');
    expect(adapter).toBeInstanceOf(Minecraft121NeoForgeAdapter);
  });

  it('should resolve 1.20.1 fabric exactly', () => {
    const adapter = getAdapter('1.20.1', 'fabric');
    expect(adapter.mcVersion).toBe('1.20.1');
    expect(adapter.loader).toBe('fabric');
    expect(adapter).toBeInstanceOf(Minecraft121FabricAdapter);
  });
});

describe('Adapter Matrix — Isolation & No Cross-Contamination', () => {
  it('should return distinct instances for 1.21.1 neoforge vs forge', () => {
    const neoforge = getAdapter('1.21.1', 'neoforge');
    const forge = getAdapter('1.21.1', 'forge');
    expect(neoforge).not.toBe(forge);
    expect(neoforge.loader).toBe('neoforge');
    expect(forge.loader).toBe('forge');
  });

  it('should not share references between instances', () => {
    const neoforge = getAdapter('1.21.1', 'neoforge');
    const fabric = getAdapter('1.21.1', 'fabric');

    const neoSpec = neoforge.getSNBTSpec();
    const fabSpec = fabric.getSNBTSpec();
    expect(neoSpec).not.toBe(fabSpec);
    expect(neoSpec.dataComponents).toBe(fabSpec.dataComponents);
  });

  it('should have isolated loader values that cannot affect each other', () => {
    const adapters = registeredAdapters();
    const loaderCounts = new Map<string, number>();
    for (const a of adapters) {
      const key = `${a.mcVersion}-${a.loader}`;
      loaderCounts.set(key, (loaderCounts.get(key) || 0) + 1);
    }
    for (const [, count] of loaderCounts) {
      expect(count).toBe(1);
    }
  });
});

describe('Adapter Matrix — Version-Specific Differences', () => {
  it('1.21.1 adapters should use dataComponents=true', () => {
    for (const loader of ['neoforge', 'forge', 'fabric', 'quilt'] as const) {
      const adapter = getAdapter('1.21.1', loader);
      expect(adapter.getSNBTSpec().dataComponents).toBe(true);
    }
  });

  it('1.20.1 adapters should use dataComponents=false', () => {
    for (const loader of ['forge', 'neoforge', 'fabric'] as const) {
      const adapter = getAdapter('1.20.1', loader);
      expect(adapter.getSNBTSpec().dataComponents).toBe(false);
    }
  });

  it('1.21.1 adapters should use the singular loot_table dir', () => {
    for (const loader of ['neoforge', 'forge', 'fabric', 'quilt'] as const) {
      const adapter = getAdapter('1.21.1', loader);
      expect(adapter.getLootDirName()).toBe('loot_table');
    }
  });

  it('1.20.1 adapters should use the plural loot_tables dir', () => {
    for (const loader of ['forge', 'neoforge', 'fabric'] as const) {
      const adapter = getAdapter('1.20.1', loader);
      expect(adapter.getLootDirName()).toBe('loot_tables');
    }
  });

  it('1.21.1 neoforge should use KubeJS 7 with startup scripts', () => {
    const adapter = getAdapter('1.21.1', 'neoforge');
    const fmt = adapter.getRecipeScriptFormat();
    expect(fmt.kubejsMajorVersion).toBe(7);
    expect(fmt.useStartupScripts).toBe(true);
  });

  it('1.21.1 forge should use KubeJS 7 without startup scripts', () => {
    const adapter = getAdapter('1.21.1', 'forge');
    const fmt = adapter.getRecipeScriptFormat();
    expect(fmt.kubejsMajorVersion).toBe(7);
    expect(fmt.useStartupScripts).toBe(false);
  });

  it('1.20.1 adapters should use KubeJS 6', () => {
    for (const loader of ['forge', 'neoforge', 'fabric'] as const) {
      const adapter = getAdapter('1.20.1', loader);
      expect(adapter.getRecipeScriptFormat().kubejsMajorVersion).toBe(6);
    }
  });
});

describe('Adapter Matrix — Fallback Behavior', () => {
  it('should fall back to version-default loader when exact loader is not registered', () => {
    const entry = getAdapterEntry('1.20.1', 'quilt');
    expect(entry.exact).toBe(false);
    expect(entry.adapter.mcVersion).toBe('1.20.1');
  });

  it('should fall back to default when version is completely unknown', () => {
    const adapter = getAdapter('1.19.2', 'forge');
    expect(adapter.mcVersion).toBe('1.21.1');
    expect(adapter.loader).toBe('neoforge');
  });

  it('getAdapterEntry should indicate non-exact matches', () => {
    const entry = getAdapterEntry('1.19.2', 'forge');
    expect(entry.exact).toBe(false);
  });

  it('getAdapterEntry should indicate exact matches', () => {
    const entry = getAdapterEntry('1.21.1', 'neoforge');
    expect(entry.exact).toBe(true);
  });
});

describe('Adapter Matrix — Commands & Paths', () => {
  const instanceDir = '/tmp/test-instance';

  it('all adapters should return the same quest path for same version', () => {
    for (const loader of ['neoforge', 'forge', 'fabric', 'quilt'] as const) {
      const adapter = getAdapter('1.21.1', loader);
      expect(adapter.getQuestPath(instanceDir)).toBe('/tmp/test-instance/config/ftbquests/quests');
    }
  });

  it('all adapters should return the same recipe script path', () => {
    for (const loader of ['neoforge', 'forge', 'fabric', 'quilt'] as const) {
      const adapter = getAdapter('1.21.1', loader);
      expect(adapter.getRecipeScriptPath(instanceDir)).toBe('/tmp/test-instance/kubejs/server_scripts');
    }
  });

  it('all adapters should share the same reload commands by default', () => {
    for (const adapter of registeredAdapters()) {
      expect(adapter.getQuestReloadCommand()).toBe('/ftbquests reload');
      expect(adapter.getRecipeReloadCommand()).toBe('/kubejs reload server_scripts');
    }
  });

  it('all adapters should default the KubeJS item namespace to kubejs', () => {
    for (const adapter of registeredAdapters()) {
      expect(adapter.getKubejsDefaultNamespace()).toBe('kubejs');
    }
  });
});

describe('Adapter Matrix — SNBT Spec Consistency', () => {
  it('all 1.21.1 adapters should share identical SNBT specs', () => {
    const adapters = registeredAdapters().filter(a => a.mcVersion === '1.21.1');
    const specs = adapters.map(a => a.getSNBTSpec());
    for (const spec of specs) {
      expect(spec.useCommas).toBe(false);
      expect(spec.numberSuffixes).toBe(true);
      expect(spec.keyValueSeparator).toBe(':');
      expect(spec.indentSize).toBe(2);
      expect(spec.dataComponents).toBe(true);
    }
  });

  it('all 1.20.1 adapters should share identical SNBT specs', () => {
    const adapters = registeredAdapters().filter(a => a.mcVersion === '1.20.1');
    const specs = adapters.map(a => a.getSNBTSpec());
    for (const spec of specs) {
      expect(spec.useCommas).toBe(false);
      expect(spec.numberSuffixes).toBe(true);
      expect(spec.keyValueSeparator).toBe(':');
      expect(spec.indentSize).toBe(2);
      expect(spec.dataComponents).toBe(false);
    }
  });
});

describe('Adapter Matrix — Type Safety', () => {
  it('should narrow loader type correctly', () => {
    const adapter = getAdapter('1.21.1', 'neoforge');
    if (adapter.loader === 'neoforge') {
      expect(adapter.getRecipeScriptFormat().useStartupScripts).toBe(true);
    }
  });

  it('should allow iteration over all registered adapters', () => {
    const versions = new Set(registeredAdapters().map(a => a.mcVersion));
    expect(versions.has('1.20.1')).toBe(true);
    expect(versions.has('1.21.1')).toBe(true);
  });

  it('each adapter should produce its own spec object', () => {
    const adapter = getAdapter('1.21.1', 'neoforge');
    const spec1 = adapter.getSNBTSpec();
    const spec2 = adapter.getSNBTSpec();
    expect(spec1).not.toBe(spec2);
    expect(spec1).toEqual(spec2);
  });
});
