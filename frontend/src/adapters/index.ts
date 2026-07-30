export type { IMinecraftVersionAdapter, LoaderType, SNBTSpecification, RecipeScriptFormat } from './types';

export { BaseMinecraftAdapter } from './base/defaults';

export { Minecraft121ForgeAdapter } from './v1_20_1/forge';
export { Minecraft121NeoForgeAdapter } from './v1_20_1/neoforge';
export { Minecraft121FabricAdapter } from './v1_20_1/fabric';

export { Minecraft1211NeoForgeAdapter } from './v1_21_1/neoforge';
export { Minecraft1211ForgeAdapter } from './v1_21_1/forge';
export { Minecraft1211FabricAdapter } from './v1_21_1/fabric';
export { Minecraft1211QuiltAdapter } from './v1_21_1/quilt';

export { getAdapter, getAdapterEntry, registeredAdapters, registeredKeys } from './factory';
export type { AdapterEntry } from './factory';
