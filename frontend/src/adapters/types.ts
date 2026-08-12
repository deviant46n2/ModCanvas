export type LoaderType = 'neoforge' | 'forge' | 'fabric' | 'quilt';

export interface SNBTSpecification {
  useCommas: boolean;
  numberSuffixes: boolean;
  keyValueSeparator: ':' | '=';
  indentSize: number;
  dataComponents: boolean;
}

export interface RecipeScriptFormat {
  kubejsMajorVersion: 6 | 7;
  useStartupScripts: boolean;
  extension: '.js' | '.ts';
}

export interface IMinecraftVersionAdapter {
  readonly mcVersion: string;
  readonly loader: LoaderType;

  getQuestPath(instanceDir: string): string;
  getRecipeScriptPath(instanceDir: string): string;

  getQuestReloadCommand(): string;
  getRecipeReloadCommand(): string;

  getSNBTSpec(): SNBTSpecification;
  getRecipeScriptFormat(): RecipeScriptFormat;

  /** Default namespace for bare KubeJS-registered item ids (KubeJS uses
   *  `kubejs` unless a modpack overrides it in `kubejs.properties`). */
  getKubejsDefaultNamespace(): string;

  /** Datapack loot-table directory name: singular `loot_table` on 1.21+,
   *  plural `loot_tables` before 1.21. Version boundary — the adapter owns
   *  the name; writers never hardcode it (AGENTS.md adapter-matrix rule). */
  getLootDirName(): 'loot_table' | 'loot_tables';
}
