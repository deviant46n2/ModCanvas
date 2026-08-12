import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft121ForgeAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.20.1';
  readonly loader = 'forge' as const;

  getSNBTSpec(): SNBTSpecification {
    return {
      useCommas: false,
      numberSuffixes: true,
      keyValueSeparator: ':',
      indentSize: 2,
      dataComponents: false,
    };
  }

  getRecipeScriptFormat(): RecipeScriptFormat {
    return {
      kubejsMajorVersion: 6,
      useStartupScripts: false,
      extension: '.js',
    };
  }

  getLootDirName(): 'loot_table' | 'loot_tables' {
    return 'loot_tables';
  }
}
