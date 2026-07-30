import { describe, it, expect } from 'vitest';
import { parseMcFormatted, renderMcFormattedToHtml } from './font-formatter';

describe('parseMcFormatted — Minecraft Formatting Code Parser', () => {
  it('should parse plain text without codes', () => {
    const result = parseMcFormatted('Hello World');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello World');
    expect(result[0].color).toBeNull();
  });

  it('should parse a single color code', () => {
    const result = parseMcFormatted('§cRed Text');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Red Text');
    expect(result[0].color).toBe('#FF5555');
  });

  it('should parse bold format code', () => {
    const result = parseMcFormatted('§lBold Text');
    expect(result[0].bold).toBe(true);
    expect(result[0].text).toBe('Bold Text');
  });

  it('should parse italic format code', () => {
    const result = parseMcFormatted('§oItalic Text');
    expect(result[0].italic).toBe(true);
  });

  it('should parse underline format code', () => {
    const result = parseMcFormatted('§nUnderline Text');
    expect(result[0].underline).toBe(true);
  });

  it('should parse strikethrough format code', () => {
    const result = parseMcFormatted('§mStrikethrough Text');
    expect(result[0].strikethrough).toBe(true);
  });

  it('should reset formatting with §r', () => {
    const result = parseMcFormatted('§cRed§rNormal');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Red');
    expect(result[0].color).toBe('#FF5555');
    expect(result[1].text).toBe('Normal');
    expect(result[1].color).toBeNull();
  });

  it('should handle mixed formats', () => {
    const result = parseMcFormatted('§c§lRed Bold');
    expect(result[0].color).toBe('#FF5555');
    expect(result[0].bold).toBe(true);
    expect(result[0].text).toBe('Red Bold');
  });
});

describe('renderMcFormattedToHtml — HTML Renderer', () => {
  it('should render plain text as a span', () => {
    const html = renderMcFormattedToHtml('Hello');
    expect(html).toContain('<span>Hello</span>');
  });

  it('should render colored text with inline style', () => {
    const html = renderMcFormattedToHtml('§cRed');
    expect(html).toContain('style="color: #FF5555"');
    expect(html).toContain('Red');
  });

  it('should render bold text', () => {
    const html = renderMcFormattedToHtml('§lBold');
    expect(html).toContain('font-weight: bold');
  });

  it('should escape HTML entities', () => {
    const html = renderMcFormattedToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle empty string', () => {
    const html = renderMcFormattedToHtml('');
    expect(html).toBe('');
  });

  it('should handle string with only format codes', () => {
    const html = renderMcFormattedToHtml('§c§l');
    expect(html).toBe('');
  });
});
