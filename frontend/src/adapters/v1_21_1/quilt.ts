import { BaseMinecraftAdapter } from '../base/defaults';
import type { SNBTSpecification, RecipeScriptFormat } from '../types';

export class Minecraft1211QuiltAdapter extends BaseMinecraftAdapter {
  readonly mcVersion = '1.21.1';
  readonly loader = 'quilt' as const;

  getQuestPath(instanceDir: string): string {
    return `${instanceDir}/config/ftbquests/quests`;
  }

  getRecipeScriptPath(instanceDir: string): string {
    return `${instanceDir}/kubejs/server_scripts`;
  }

  getQuestReloadCommand(): string {
    return '/ftbquests reload';
  }

  getRecipeReloadCommand(): string {
    return '/kubejs reload server_scripts';
  }

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
