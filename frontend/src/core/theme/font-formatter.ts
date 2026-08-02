import type { McFormattedSegment } from './types';
import { MC_COLOR_MAP } from './types';

const FORMAT_CODE_REGEX = /[§&]([0-9a-fklmnor])/gi;

export function parseMcFormatted(input: string): McFormattedSegment[] {
  const segments: McFormattedSegment[] = [];
  let current: McFormattedSegment = {
    text: '', color: null, bold: false, italic: false,
    underline: false, strikethrough: false, obfuscated: false,
  };

  const parts = input.split(FORMAT_CODE_REGEX);
  let isCode = false;

  for (const part of parts) {
    if (isCode) {
      const code = part.toLowerCase();
      if (code === 'r') {
        if (current.text) segments.push(current);
        current = {
          text: '', color: null, bold: false, italic: false,
          underline: false, strikethrough: false, obfuscated: false,
        };
      } else if (MC_COLOR_MAP[code]) {
        if (current.text) segments.push(current);
        current = {
          text: '', color: MC_COLOR_MAP[code], bold: false, italic: false,
          underline: false, strikethrough: false, obfuscated: false,
        };
      } else {
        switch (code) {
          case 'l': current.bold = true; break;
          case 'm': current.strikethrough = true; break;
          case 'n': current.underline = true; break;
          case 'o': current.italic = true; break;
          case 'k': current.obfuscated = true; break;
        }
      }
    } else {
      if (current.text) {
        if (part) {
          segments.push({ ...current, text: current.text + part });
          current.text = '';
        }
      } else {
        current.text = part;
      }
    }
    isCode = !isCode;
  }

  if (current.text) segments.push(current);
  if (segments.length === 0 && input.length > 0 && /[^§&0-9a-fklmnor]/i.test(input)) {
    segments.push({
      text: input, color: null, bold: false, italic: false,
      underline: false, strikethrough: false, obfuscated: false,
    });
  }

  return segments;
}

export function stripMcFormatting(input: string): string {
  if (!input) return '';
  return input.replace(/[§&][0-9a-fklmnor]/gi, '');
}

export function renderMcFormattedToHtml(input: string): string {
  if (!input) return '';
  const segments = parseMcFormatted(input);
  return segments.map(seg => {
    const styles: string[] = [];
    if (seg.color) styles.push(`color: ${seg.color}`);
    if (seg.bold) styles.push('font-weight: bold');
    if (seg.italic) styles.push('font-style: italic');
    if (seg.underline) styles.push('text-decoration: underline');
    if (seg.strikethrough) styles.push('text-decoration: line-through');
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
    return `<span${styleAttr}>${escapeHtml(seg.text)}</span>`;
  }).join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
