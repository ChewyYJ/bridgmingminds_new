import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!['/artifacts/avatar-modular/', '/assets/avatar/illustrated-v2/', '/assets/avatar/food-v1/'].some(p => path.startsWith(p)) || path.includes('..')) { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.png': 'image/png', '.gif': 'image/gif' })[extname(path)] || 'text/plain'); res.end(readFileSync(resolve('.' + path))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/mango/AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  await page.goto('http://127.0.0.1:' + server.address().port + '/artifacts/avatar-modular/index.html');
  await page.evaluate(() => window.AvatarPreview.pose('eat', 3));
  await page.locator('.food-panel').screenshot({ path: 'artifacts/avatar-modular/label-debug-food.png' });
  await page.screenshot({ path: 'artifacts/avatar-modular/label-debug-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.AvatarPreview.pose('eat', 3));
  const inspect = () => page.locator('#items .item').evaluateAll(items => items.map(item => {
    const label = item.querySelector('span'), r = label.getBoundingClientRect(), b = item.getBoundingClientRect(), s = getComputedStyle(label), p = getComputedStyle(item), range = document.createRange();
    range.selectNodeContents(label);
    return { text: label.textContent, rect: r.toJSON(), textRect: range.getBoundingClientRect().toJSON(), button: b.toJSON(), color: s.color, display: s.display, visibility: s.visibility, opacity: s.opacity, overflow: p.overflow, contentVisibility: p.contentVisibility, html: item.outerHTML, topmost: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 100) };
  }));
  console.log(JSON.stringify({ beforeScreenshot: await inspect() }));
  await page.screenshot({ path: 'artifacts/avatar-modular/label-debug-mobile.png', fullPage: true });
  await page.locator('#items').scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  console.log(JSON.stringify({ afterScroll: await inspect() }));
  await page.locator('#items').screenshot({ path: 'artifacts/avatar-modular/label-debug-items.png' });
  await page.screenshot({ path: 'artifacts/avatar-modular/label-debug-mobile-scrolled.png', fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 390, height });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: 'artifacts/avatar-modular/label-debug-mobile-tall.png' });
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
