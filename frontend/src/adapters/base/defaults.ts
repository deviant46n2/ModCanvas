import type { IMinecraftVersionAdapter, LoaderType, SNBTSpecification, RecipeScriptFormat } from '../types';

export abstract class BaseMinecraftAdapter implements IMinecraftVersionAdapter {
  abstract readonly mcVersion: string;
  abstract readonly loader: LoaderType;

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

  getKubejsDefaultNamespace(): string {
    return 'kubejs';
  }

  /** Modern datapack dir name (1.21+); pre-1.21 adapters override to
   *  `loot_tables`. Version boundary, owned by the adapter. */
  getLootDirName(): 'loot_table' | 'loot_tables' {
    return 'loot_table';
  }

  abstract getSNBTSpec(): SNBTSpecification;
  abstract getRecipeScriptFormat(): RecipeScriptFormat;
}
