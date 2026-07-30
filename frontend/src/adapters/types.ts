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
}
