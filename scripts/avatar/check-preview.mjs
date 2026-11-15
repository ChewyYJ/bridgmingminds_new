// Render and verify the standalone local asset preview without an app account.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = resolve('.');
const browserPath = process.env.AVATAR_BROWSER_PATH;
const candidates = [browserPath, chromium.executablePath(), process.env['ProgramFiles(x86)'] && resolve(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean);
const executablePath = candidates.find(path => existsSync(path));
// Chromium can omit offscreen button text around canvases in fullPage captures.
// Paint the complete page inside the viewport before capturing, then restore it.
async function screenshotPaintedPage(page, path) {
  const viewport = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path });
  await page.setViewportSize(viewport);
}
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!['/artifacts/avatar-modular/', '/assets/avatar/illustrated-v2/', '/assets/avatar/food-v1/'].some(prefix => path.startsWith(prefix)) || path.includes('..')) {
    res.writeHead(404); res.end(); return;
  }
  try {
    const content = readFileSync(resolve(root, '.' + path));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json' })[extname(path)] || 'text/plain');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/artifacts/avatar-modular/index.html`);
  await page.waitForFunction(() => Boolean(window.AvatarPreview));
  await page.evaluate(() => window.AvatarPreview.pose('idle', 0));
  const foods = await page.locator('.food-card img').evaluateAll(async images => Promise.all(images.map(async image => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = false, artwork = false;
    for (let i = 3; i < pixels.length; i += 4) {
      transparent ||= pixels[i] === 0;
      artwork ||= pixels[i] > 0;
      if (transparent && artwork) break;
    }
    return { file: new URL(image.src).pathname.split('/').pop(), width: canvas.width, height: canvas.height, transparent, artwork };
  })));
  assert.deepEqual(foods.map(food => food.file), ['ramen.png', 'onigiri.png', 'bento.png']);
  assert.ok(foods.every(food => food.width > 0 && food.height > 0 && food.transparent && food.artwork), 'Food previews must contain visible artwork and transparent pixels');
  const foodActions = [
    { id: 'ramen', name: 'Ramen', animation: 'eat' },
    { id: 'onigiri', name: 'Onigiri', animation: 'eatOnigiri' },
    { id: 'bento', name: 'Bento', animation: 'eatBento' },
  ];
  const lookBeforeFood = await page.evaluate(() => window.AvatarPreview.getSelection());
  const eatingImages = new Set();
  assert.equal(await page.locator('#animations button').count(), 6, 'Show one Eat action alongside the other five actions');
  await page.locator('#left').click();
  for (const food of foodActions) {
    await page.locator('#food-' + food.id).click();
    await page.waitForFunction(action => document.getElementById('chibi').getAttribute('aria-label').includes(', ' + action + ','), food.animation);
    const state = await page.evaluate(() => window.AvatarPreview.getPreviewState());
    assert.deepEqual(state, { food: food.id, animation: food.animation, frame: 0, playing: false, facing: -1 });
    assert.equal(await page.locator('#food-' + food.id).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Eat', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#chibi-pose').textContent(), 'Eating ' + food.name);
    assert.match(await page.locator('#big').getAttribute('aria-label'), /, idle, facing left$/);
    assert.equal(await page.getByRole('link', { name: 'Download ' + food.id + ' PNG', exact: true }).getAttribute('download'), food.id + '.png');
    await page.evaluate(action => window.AvatarPreview.pose(action, 3), food.animation);
    eatingImages.add(await page.locator('#chibi').evaluate(canvas => canvas.toDataURL()));
  }
  assert.equal(eatingImages.size, 3, 'The three foods must render distinct eating artwork');
  await page.getByRole('button', { name: 'Greet', exact: true }).click();
  await page.getByRole('button', { name: 'Eat', exact: true }).click();
  assert.equal((await page.evaluate(() => window.AvatarPreview.getPreviewState())).animation, 'eatBento', 'Eat should remember the selected food');
  await page.getByRole('button', { name: 'Preview eating ramen', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('chibi').getAttribute('aria-label').includes(', eat,'));
  assert.equal((await page.evaluate(() => window.AvatarPreview.getPreviewState())).frame, 0, 'Food cards restart at the first frame');
  assert.equal(await page.locator('#preview-food-ramen').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => window.AvatarPreview.getSelection()), lookBeforeFood, 'Food selection must not alter the wardrobe');
  await page.locator('#right').click();
  const auditLink = page.getByRole('link', { name: 'View head and food checks', exact: true });
  assert.equal(await auditLink.getAttribute('href'), './head-food-audit/index.html');
  const auditUrl = await auditLink.evaluate(link => link.href);
  assert.ok((await page.request.get(auditUrl)).ok(), 'The wardrobe audit must be available from the studio');
  await page.locator('.food-panel').screenshot({ path: 'artifacts/avatar-modular/food-assets-preview.png' });
  await screenshotPaintedPage(page, 'artifacts/avatar-modular/studio-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.AvatarPreview.pose('eat', 3));
  await screenshotPaintedPage(page, 'artifacts/avatar-modular/studio-mobile.png');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const gif = await page.evaluate(async () => {
    const image = document.createElement('img'); image.src = 'girl-walk.gif'; image.id = 'gif-preview';
    image.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:280px;z-index:20';
    document.body.append(image); await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  const samples = new Set();
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 170));
    samples.add(createHash('sha256').update(await page.locator('#gif-preview').screenshot()).digest('hex'));
  }
  gif.uniqueFrames = samples.size;
  assert.deepEqual(errors, []); assert.equal(overflow, false); assert.ok(gif.uniqueFrames > 1);
  console.log(JSON.stringify({ errors, overflow, foods, eatingPreviews: eatingImages.size, auditUrl, gif, screenshots: ['studio-desktop.png', 'studio-mobile.png'] }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
