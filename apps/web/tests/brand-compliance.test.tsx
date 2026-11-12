// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App';

function getFilesRecursively(dir: string, ext = '.tsx'): string[] {
  let files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(getFilesRecursively(fullPath, ext));
    } else if (fullPath.endsWith(ext) || fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Milestone 5 AGENTS.md Brand Rules & Integrity Verification', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const srcDir = resolve(__dirname, '../src');
  const bentoCssPath = resolve(__dirname, '../src/styles/bento.css');
  const tokensCssPath = resolve(__dirname, '../src/styles/tokens.css');
  const layoutCssPath = resolve(__dirname, '../src/styles/layout.css');

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    document.body.innerHTML = '';
  });

  it('zero imports or usage of Shield icon across all src files', () => {
    const files = getFilesRecursively(srcDir);
    expect(files.length).toBeGreaterThan(10);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/\bimport\s+{[^}]*\bShield\b[^}]*}\s+from/);
      expect(content).not.toMatch(/<Shield\b/);
      expect(content).not.toMatch(/<ShieldAlert\b/);
      expect(content).not.toMatch(/<ShieldCheck\b/);
      expect(content).not.toMatch(/<ShieldClose\b/);
    }
  });

  it('zero forbidden keywords in bento.css, tokens.css, and layout.css', () => {
    const cssFiles = [bentoCssPath, tokensCssPath, layoutCssPath];

    for (const file of cssFiles) {
      const css = readFileSync(file, 'utf-8');
      expect(css).not.toMatch(/\bshield\b/i);
      expect(css).not.toMatch(/\bprotective[-_]ring\b/i);
      expect(css).not.toMatch(/\bglow\b/i);
      expect(css).not.toMatch(/\bstarburst\b/i);
    }
  });

  it('App mounts all 5 Milestone 5 components without placeholder slots', async () => {
    await act(async () => {
      root!.render(<App />);
    });

    // Verify all 5 sections exist with their respective components
    const features = container.querySelector('#features');
    const architecture = container.querySelector('#architecture');
    const stats = container.querySelector('#stats');
    const install = container.querySelector('#install');
    const faq = container.querySelector('#faq');

    expect(features).not.toBeNull();
    expect(architecture).not.toBeNull();
    expect(stats).not.toBeNull();
    expect(install).not.toBeNull();
    expect(faq).not.toBeNull();

    // Verify placeholder slots are completely removed
    expect(container.querySelector('.placeholder-slot')).toBeNull();
    expect(container.querySelector('.bento-placeholder')).toBeNull();
    expect(container.querySelector('.arch-placeholder')).toBeNull();
    expect(container.querySelector('.stats-placeholder')).toBeNull();
    expect(container.querySelector('.install-placeholder')).toBeNull();
    expect(container.querySelector('.faq-placeholder')).toBeNull();

    // Verify components are mounted
    expect(container.querySelector('[data-testid="bento-container"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="architecture-container"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="community-stats-container"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sideload-guide-container"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="faq-accordion-container"]')).not.toBeNull();
  });
});
