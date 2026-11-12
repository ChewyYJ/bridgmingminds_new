import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { BRAND } from '../shared/brand.mjs';

// Original vector artwork; the same geometry renders in the native app.
const mark = `<path d="${BRAND.stem}" fill="${BRAND.forest}"/><path d="${BRAND.leaf}" fill="${BRAND.sage}"/><circle cx="24" cy="12" r="4" fill="${BRAND.gold}"/>`;
const svg = (body, width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
const artwork = [
  ['mark', 64, 64, mark],
  ['icon', 1024, 1024, `<rect width="1024" height="1024" fill="${BRAND.cream}"/><g transform="translate(128 128) scale(12)">${mark}</g>`],
  ['adaptive', 1024, 1024, `<g transform="translate(212 212) scale(9.375)">${mark}</g>`],
  ['monochrome', 1024, 1024, `<g transform="translate(212 212) scale(9.375)">${mark.replace(/#[0-9A-F]{6}/g, '#000000')}</g>`],
  ['lockup', 650, 180, `<rect width="650" height="180" rx="24" fill="${BRAND.cream}"/><g transform="translate(28 24) scale(2)">${mark}</g><text x="175" y="106" font-family="Georgia,serif" font-size="65" letter-spacing="-2" fill="#293C32">MindGarden</text>`],
];
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, width, height, body] of artwork) {
    const content = svg(body, width, height);
    await writeFile(`assets/mindgarden-${name}.svg`, content);
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${content}`);
    await page.screenshot({ path: `assets/mindgarden-${name}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
