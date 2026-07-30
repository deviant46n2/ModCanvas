import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft121FabricAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.20.1';
  readonly loader = 'fabric' as const;

  getRecipeReloadCommand(): string {
    return '/kubejs reload server_scripts';
  }

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
