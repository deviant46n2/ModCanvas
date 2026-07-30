import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft1211ForgeAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.21.1';
  readonly loader = 'forge' as const;

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
      useStartupScripts: false,
      extension: '.js',
    };
  }
}
