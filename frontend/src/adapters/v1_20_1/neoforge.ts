import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft121NeoForgeAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.20.1';
  readonly loader = 'neoforge' as const;

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
}
