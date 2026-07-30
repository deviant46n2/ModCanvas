export interface AssetCacheEntry {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface AssetCacheManifest {
  ui: Record<string, AssetCacheEntry>;
  icons: Record<string, AssetCacheEntry>;
  loadedAt: number;
  sourceVersion: string;
  sourceLoader: string;
}

export interface NodeBorderSpec {
  top: string;
  right: string;
  bottom: string;
  left: string;
  slice: number;
}

export interface ExtractedTheme {
  chapterBackground: AssetCacheEntry | null;
  nodeBorders: Record<string, NodeBorderSpec>;
  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  questNodeWidth: number;
  questNodeHeight: number;
}

export interface ThemeConfig {
  backgroundColor: string;
  backgroundTile: string | null;
  nodeBorderImages: Record<string, NodeBorderSpec>;
  fontFamily: string;
  itemIconSize: number;
  canvasZoom: number;
  primaryColor: string;
}

export interface McFormattedSegment {
  text: string;
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  obfuscated: boolean;
}

export const MC_COLOR_MAP: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
  'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
};

export const MC_FORMAT_CODES: Record<string, string> = {
  'l': 'bold',
  'm': 'strikethrough',
  'n': 'underline',
  'o': 'italic',
  'k': 'obfuscated',
  'r': 'reset',
};
