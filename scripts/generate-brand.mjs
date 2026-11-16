import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { BRAND } from '../shared/brand.mjs';

// Package the approved original artwork into platform canvases. Never redraw it.
const output = 'assets/brand';
const png = await readFile(`${output}/approved-logo-source.png`);
const image = `<image href="data:image/png;base64,${png.toString('base64')}" width="${BRAND.sourceWidth}" height="${BRAND.sourceHeight}"/>`;
const mark = (x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${BRAND.viewBox}" preserveAspectRatio="xMidYMid meet">${image}</svg>`;
const background = (width, height) => `<rect width="${width}" height="${height}" fill="${BRAND.cream}"/>`;
const artwork = [
  ['mark', 256, 256, mark(0, 0, 256)],
  ['icon', 1024, 1024, `${background(1024, 1024)}${mark(128, 128, 768)}`],
  ['favicon', 256, 256, `${background(256, 256)}${mark(8, 8, 240)}`],
  ['adaptive', 1024, 1024, mark(224, 224, 576)],
  ['monochrome', 1024, 1024, `<defs><filter id="mono"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter></defs><g filter="url(#mono)">${mark(224, 224, 576)}</g>`],
  ['lockup', 720, 180, `${background(720, 180)}${mark(20, 20, 140)}<text x="180" y="110" font-family="Arial,sans-serif" font-weight="700" font-size="56" fill="${BRAND.ink}">BridgingMinds</text>`],
];
const executablePath = process.env.AVATAR_BROWSER_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, width, height, body] of artwork) {
    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
    await writeFile(`${output}/bridgingminds-${name}.svg`, content);
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${content}`);
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('image')].map(element => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = resolve; img.onerror = reject;
        img.src = element.getAttribute('href');
      })));
      await document.fonts.ready;
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await page.screenshot({ path: `${output}/bridgingminds-${name}.png`, omitBackground: true });
    console.log(`${output}/bridgingminds-${name}.png (${width}x${height})`);
  }
} finally {
  await browser.close();
}
