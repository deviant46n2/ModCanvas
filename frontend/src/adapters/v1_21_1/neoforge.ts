import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft1211NeoForgeAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.21.1';
  readonly loader = 'neoforge' as const;

  getSNBTSpec(): SNBTSpecification {
    return {
      useCommas: false,
      numberSuffixes: true,
      keyValueSeparator: ':',
      indentSize: 2,
      dataComponents: true,
    };
  }

  getRecipeScriptFormat(): RecipeScriptFormat {
    return {
      kubejsMajorVersion: 7,
      useStartupScripts: true,
      extension: '.js',
    };
  }
}
