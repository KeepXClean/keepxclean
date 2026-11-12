import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { UI_LOCALE_OPTIONS } from '@keepxclean/shared';

describe('Brand Layout Shell & Tokens Compliance', () => {
  const tokensPath = resolve(__dirname, '../src/styles/tokens.css');
  const layoutPath = resolve(__dirname, '../src/styles/layout.css');

  it('tokens.css strictly conforms to AGENTS.md light theme palette', () => {
    expect(existsSync(tokensPath)).toBe(true);
    const css = readFileSync(tokensPath, 'utf-8');

    // Canvas #F7F9F8, Surface #FFFFFF, Selected #EAF6EF, Green #13865F
    expect(css).toContain('--canvas: #f7f9f8;');
    expect(css).toContain('--surface: #ffffff;');
    expect(css).toContain('--border: #e1e7e3;');
    expect(css).toContain('--text: #172b24;');
    expect(css).toContain('--muted: #607168;');
    expect(css).toContain('--green: #13865f;');
    expect(css).toContain('--green-hover: #0f6e4e;');
    expect(css).toContain('--selected: #eaf6ef;');
    expect(css).toContain('--radius-logo: 21.875%;');

    // Strict prohibitions from AGENTS.md: zero shield, zero protective ring, zero glow
    expect(css).not.toMatch(/\bshield\b/i);
    expect(css).not.toMatch(/\bprotective[-_]ring\b/i);
    expect(css).not.toMatch(/\bglow\b/i);
    expect(css).not.toMatch(/\bstarburst\b/i);
  });

  it('layout.css contains sticky header, mobile drawer, and responsive table styling', () => {
    expect(existsSync(layoutPath)).toBe(true);
    const css = readFileSync(layoutPath, 'utf-8');

    expect(css).toContain('.site-header');
    expect(css).toContain('position: sticky;');
    expect(css).toContain('backdrop-filter: blur(12px);');
    expect(css).toContain('.permissions-table-wrapper');
    expect(css).toContain('overflow-x: auto;');
    expect(css).toContain('min-width: 560px;');
  });

  it('all 10 supported languages are available in UI_LOCALE_OPTIONS', () => {
    expect(UI_LOCALE_OPTIONS).toHaveLength(10);
    const codes = UI_LOCALE_OPTIONS.map((o) => o.code);
    expect(codes).toEqual([
      'en',
      'zh-CN',
      'zh-TW',
      'ja',
      'ko',
      'es',
      'pt',
      'fr',
      'de',
      'ru',
    ]);
  });

  it('public directory contains official black titanium X brand assets', () => {
    const publicDir = resolve(__dirname, '../public');
    expect(existsSync(resolve(publicDir, 'logo.svg'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'logo-small.svg'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-16.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-24.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-32.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-48.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-64.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-128.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-256.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-512.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'icon-1024.png'))).toBe(true);
    expect(existsSync(resolve(publicDir, '404.html'))).toBe(true);
  });
});
