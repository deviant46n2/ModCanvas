// Item-registry and texture-ingest types. Split out of `quest-types.ts`;
// standalone — no cross-file imports.

export interface ItemRegistryEntry {
  id: string
  name: string
  mod_id: string
  texture_data_url: string | null
}

/** Entry in the local item-tag catalog (`list_item_tags_cmd`). */
export interface ItemTagInfo {
  id: string
  member_count: number
}

export interface IngestTextureEntry {
  namespace: string
  path: string
  raw_key: string
  canonical_key: string
  clean_key: string
  data_url: string
}

export interface VirtualAssetRegistry {
  by_id: Record<string, string>
  all_textures: IngestTextureEntry[]
  jars_scanned: number
  textures_indexed: number
}

export interface IngestResult {
  asset_registry: VirtualAssetRegistry
  jars_scanned: number
  textures_indexed: number
  active_instance: string
  /** Jar file names in the mods/ folder (scan proof for the core-mod gate);
   *  null when the mods dir doesn't exist — no claim can be made. */
  mods: string[] | null
}
