import { expect, test, type Locator, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RoomSummary } from '../shared/room.mjs';
import { roomGeometry, projectRoomPoint } from '../src/room/geometry';

const base = 'http://127.0.0.1:3028';
const headers = { Origin: base };

async function account(page: Page, displayName: string, coins = 0) {
  const health = await page.request.get(`${base}/api/health`);
  expect((await health.json()).provider).toBe('local');
  const guest = await page.request.post(`${base}/api/auth/guest`, { headers, data: {} });
  expect(guest.ok(), await guest.text()).toBeTruthy();
  const owner = await guest.json();
  const profile = await page.request.patch(`${base}/api/me`, { headers,
    data: { displayName, onboardingComplete: true, timezone: 'Asia/Singapore', reducedMotion: true } });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  await currentRoom(page);
  if (coins) {
    // Only this named isolated browser-test DB and the just-created synthetic guest.
    expect(base).toBe('http://127.0.0.1:3028');
    const db = new DatabaseSync(resolve('data/room-ui-e2e.sqlite'));
    try {
      db.exec('PRAGMA busy_timeout=5000');
      const row = db.prepare('SELECT profile FROM users WHERE id=?').get(owner.profile.id) as { profile: string };
      expect(JSON.parse(row.profile).displayName).toBe(displayName);
      expect(Number(db.prepare('UPDATE economy_accounts SET coins=? WHERE user_id=?').run(coins, owner.profile.id).changes)).toBe(1);
    } finally { db.close(); }
  }
  return owner.profile.id as string;
}
async function currentRoom(page: Page): Promise<RoomSummary> {
  const response = await page.request.get(`${base}/api/room`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
function watchErrors(page: Page) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  return errors;
}
async function shot(page: Page, name: string) {
  await mkdir('artifacts/room', { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
  const modal = page.getByTestId('room-purchase-confirmation');
  if (await modal.count()) await expect.poll(() => modal.evaluate(element => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  })).toBe(1);
  const tray = page.locator('[data-testid^="room-tray-"]');
  for (let index = 0; index < await tray.count(); index++) {
    const card = tray.nth(index);
    const name = (await card.getAttribute('aria-label'))!.split(',')[0];
    const label = card.getByText(name, { exact: true });
    expect(await label.evaluate(element => {
      const box = element.getBoundingClientRect();
      const card = element.closest('[data-testid]')!.getBoundingClientRect();
      return box.height >= Number.parseFloat(getComputedStyle(element).lineHeight) - .5 && box.bottom <= card.bottom;
    }), `Furniture label ${name} should fit without vertical clipping`).toBe(true);
  }
  await expect.poll(() => page.locator('img').evaluateAll(nodes => nodes.every(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0))).toBe(true);
  await page.locator('svg image').evaluateAll(async nodes => {
    await Promise.all(nodes.map(node => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth > 0 ? resolve() : reject(new Error('Furniture image is empty'));
      image.onerror = () => reject(new Error('Furniture image could not load'));
      image.src = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '';
    })));
  });
  await page.screenshot({ path: `artifacts/room/${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function bounds(locator: Locator) {
  const rect = await locator.boundingBox(); expect(rect).not.toBeNull(); return rect!;
}
async function drag(page: Page, source: Locator, end: { x: number; y: number }, fromTray = false) {
  await source.click({ trial: true });
  const box = await bounds(source);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // The tray reserves horizontal gestures for scrolling; lift vertically to pick up.
  if (fromTray) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 12, { steps: 3 });
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  // Wait for the element's native measurement before the first drag event.
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
  await page.mouse.move(end.x, end.y, { steps: 14 });
  await page.mouse.up();
}
async function movePlaced(page: Page, itemId: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  const canvas = await bounds(page.getByTestId('room-canvas'));
  const source = page.getByTestId(`room-placed-${itemId}`), item = await bounds(source);
  const g = roomGeometry(canvas.width, canvas.height);
  const dx = to.x - from.x, dy = to.y - from.y;
  await drag(page, source, { x: item.x + item.width / 2 + (dx - dy) * g.cellWidth / 2,
    y: item.y + item.height / 2 + (dx + dy) * g.cellHeight / 2 });
}
async function dragFromTray(page: Page, itemId: string, x: number, y: number, width = 1, depth = 1) {
  const source = page.getByTestId(`room-tray-${itemId}`);
  await source.scrollIntoViewIfNeeded();
  const box = await bounds(page.getByTestId('room-canvas'));
  const target = projectRoomPoint(x + width / 2, y + depth / 2, roomGeometry(box.width, box.height));
  await drag(page, source, { x: box.x + target.x, y: box.y + target.y }, true);
}
async function position(page: Page, itemId: string, x: number, y: number) {
  await expect(page.getByTestId(`room-placed-${itemId}`)).toHaveAttribute('aria-label', new RegExp(`placed at ${x + 1}, ${y + 1}$`));
}
async function enter(page: Page) {
  await page.goto('/room');
  await expect(page.getByTestId('decorate-room')).toBeVisible();
  await expect(page.getByTestId('room-canvas')).toBeVisible();
}
async function edit(page: Page) {
  await page.getByTestId('decorate-room').click();
  await expect(page.getByTestId('save-room')).toBeVisible();
  await expect(page.getByTestId('shell-coin-balance')).toHaveCount(0);
}

test('dragging furniture validates space, saves across reload, restores tray items and cancels changes', async ({ page }) => {
  const errors = watchErrors(page);
  await account(page, 'Room drag learner'); await enter(page);
  await shot(page, 'room-mobile');
  await edit(page);
  await movePlaced(page, 'leafy-plant', { x: 6, y: 2 }, { x: 4, y: 5 });
  await position(page, 'leafy-plant', 4, 5);
  await expect(page.getByTestId('room-draft-status')).toHaveText('Unsaved');
  expect((await currentRoom(page)).placements.find(p => p.itemId === 'leafy-plant')).toMatchObject({ x: 6, y: 2 });
  for (const target of [{ x: -1, y: 4 }, { x: 1, y: 2 }]) {
    await movePlaced(page, 'leafy-plant', { x: 4, y: 5 }, target);
    await expect(page.getByTestId('room-placement-status')).toContainText('That space is unavailable');
    await position(page, 'leafy-plant', 4, 5);
  }
  await shot(page, 'decorate-mobile');
  await page.getByTestId('save-room').click();
  await expect(page.getByTestId('room-notice')).toContainText('Your room is saved.');
  expect((await currentRoom(page)).version).toBe(2);
  await page.reload(); await position(page, 'leafy-plant', 4, 5);
  await edit(page);
  await page.getByTestId('room-placed-leafy-plant').click();
  await page.getByTestId('put-away-room-item').click();
  await expect(page.getByTestId('room-placed-leafy-plant')).toHaveCount(0);
  await page.getByRole('button', { name: 'Decor', exact: true }).click();
  await dragFromTray(page, 'leafy-plant', 6, 5);
  await position(page, 'leafy-plant', 6, 5);
  await page.getByTestId('save-room').click();
  await expect(page.getByTestId('decorate-room')).toBeVisible();
  const saved = await currentRoom(page); expect(saved.version).toBe(3);
  await edit(page);
  await movePlaced(page, 'leafy-plant', { x: 6, y: 5 }, { x: 3, y: 5 });
  await page.getByTestId('cancel-room-edit').click();
  await expect(page.getByRole('heading', { name: 'Discard this arrangement?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep decorating', exact: true }).click();
  await position(page, 'leafy-plant', 3, 5);
  await page.getByTestId('cancel-room-edit').click();
  await page.getByTestId('discard-room-changes').click();
  await position(page, 'leafy-plant', 6, 5);
  expect(await currentRoom(page)).toEqual(saved);
  expect(errors).toEqual([]);
});

test('furniture shop confirms, cancels and retries a lost receipt without a second debit', async ({ page }) => {
  const errors = watchErrors(page);
  await account(page, 'Room purchase fixture', 100); await enter(page);
  await page.getByRole('button', { name: 'Furniture shop', exact: true }).click();
  const requests: { itemId: string; requestId: string }[] = [];
  await page.route('**/api/room/purchase', async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) { const saved = await route.fetch(); expect(saved.ok()).toBeTruthy(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByTestId('room-shop-ceramic-plant').click();
  await expect(page.getByTestId('room-purchase-confirmation')).toContainText('Price: 12 Coins');
  await expect(page.getByTestId('room-purchase-confirmation')).toContainText('Balance after purchase: 88 Coins');
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByTestId('room-shop-ceramic-plant').click();
  await shot(page, 'furniture-purchase-confirmation');
  await page.getByTestId('confirm-room-purchase').click();
  await expect(page.getByTestId('room-purchase-confirmation').getByRole('alert')).toBeVisible();
  expect((await currentRoom(page)).coins).toBe(88);
  await page.getByTestId('confirm-room-purchase').click();
  await expect(page.getByTestId('room-notice')).toContainText('Ceramic plant is in your collection');
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  const room = await currentRoom(page); expect(room.coins).toBe(88);
  expect(room.ownedItemIds).toContain('ceramic-plant');
  expect(room.placements.some(p => p.itemId === 'ceramic-plant')).toBe(false);
  await expect(page.getByTestId('room-shop-ceramic-plant')).toBeDisabled();
  await page.getByTestId('room-shop-oatmeal-sofa').click();
  await expect(page.getByTestId('confirm-room-purchase')).toBeDisabled();
  await expect(page.getByText('Earn 32 more Coins through learning.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await page.getByRole('button', { name: 'My room', exact: true }).click();
  await edit(page); await page.getByRole('button', { name: 'Decor', exact: true }).click();
  await dragFromTray(page, 'ceramic-plant', 4, 5);
  await position(page, 'ceramic-plant', 4, 5);
  await page.getByTestId('save-room').click(); await expect(page.getByTestId('decorate-room')).toBeVisible();
  await page.reload(); await position(page, 'ceramic-plant', 4, 5);
  await shot(page, 'room-purchased-item');
  expect((await currentRoom(page)).coins).toBe(88);
  expect(errors).toEqual([]);
});

test('room drafts recover, stale saves retain edits and another account cannot inherit them', async ({ page }) => {
  const errors = watchErrors(page);
  const owner = await account(page, 'Room draft owner'); await enter(page); await edit(page);
  await movePlaced(page, 'leafy-plant', { x: 6, y: 2 }, { x: 4, y: 5 });
  const key = `bridgingminds:room-draft:v1:${owner}`;
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.placements?.find((p: { itemId: string }) => p.itemId === 'leafy-plant')?.x, key)).toBe(4);
  page.once('dialog', dialog => dialog.accept());
  await page.reload(); await expect(page.getByTestId('save-room')).toBeVisible();
  await position(page, 'leafy-plant', 4, 5);
  const changed = await page.request.put(`${base}/api/room/layout`, { headers, data: { version: 1, placements: [] } });
  expect(changed.ok(), await changed.text()).toBeTruthy();
  await page.getByTestId('save-room').click();
  await expect(page.getByRole('alert')).toContainText('Your room changed elsewhere. Your arrangement is still here.');
  await position(page, 'leafy-plant', 4, 5);
  expect((await currentRoom(page)).placements).toEqual([]);
  await page.getByTestId('save-room').click(); await expect(page.getByTestId('decorate-room')).toBeVisible();
  expect((await currentRoom(page)).version).toBe(3);
  await edit(page); await movePlaced(page, 'leafy-plant', { x: 4, y: 5 }, { x: 5, y: 5 });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.placements?.find((p: { itemId: string }) => p.itemId === 'leafy-plant')?.x, key)).toBe(5);
  const logout = await page.request.post(`${base}/api/auth/logout`, { headers, data: {} }); expect(logout.ok()).toBeTruthy();
  const stranger = await account(page, 'Separate room learner'); expect(stranger).not.toBe(owner);
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('decorate-room')).toBeVisible();
  await expect(page.getByTestId('save-room')).toHaveCount(0);
  await position(page, 'leafy-plant', 6, 2);
  expect((await currentRoom(page)).version).toBe(1);
  expect((await currentRoom(page)).ownedItemIds).toHaveLength(5);
  expect(errors).toEqual([]);
});

test('320px room keeps editing controls and inventory reachable without horizontal overflow', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await account(page, 'Narrow room learner'); await enter(page);
  await expect.poll(() => page.getByTestId('room-canvas').evaluate(element => {
    const box = element.getBoundingClientRect(); return box.x >= 0 && box.right <= innerWidth;
  })).toBe(true);
  await shot(page, 'room-320');
  await edit(page);
  await expect(page.getByTestId('save-room')).toBeVisible();
  const save = await bounds(page.getByTestId('save-room'));
  expect(save.y + save.height).toBeLessThanOrEqual(780);
  await movePlaced(page, 'leafy-plant', { x: 6, y: 2 }, { x: 4, y: 5 });
  await position(page, 'leafy-plant', 4, 5);
  await shot(page, 'decorate-320');
  await page.getByTestId('save-room').click(); await expect(page.getByTestId('decorate-room')).toBeVisible();
  await page.getByRole('button', { name: 'Furniture shop', exact: true }).click();
  await page.getByTestId('room-shop-reading-lamp').click();
  await expect(page.getByTestId('confirm-room-purchase')).toBeDisabled();
  await shot(page, 'room-shop-insufficient-320');
  expect(errors).toEqual([]);
});

test.describe('touch furniture gestures', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('touch dragging moves placed and tray furniture and saves the arrangement', async ({ page }) => {
    const errors = watchErrors(page);
    await account(page, 'Touch room learner'); await enter(page); await edit(page);
    await page.evaluate(() => {
      const events: unknown[] = [];
      Object.assign(window, { roomTouchEvents: events });
      for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
        const target = event.target instanceof Element ? event.target.closest('[data-testid]')?.getAttribute('data-testid') : null;
        const entry = { type, target, at: performance.now(), defaultPrevented: event.defaultPrevented };
        events.push(entry);
        queueMicrotask(() => { entry.defaultPrevented = event.defaultPrevented; });
      }, true);
    });
    const cdp = await page.context().newCDPSession(page);
    async function touchTap(target: Locator) {
      await target.tap({ trial: true });
      const box = await bounds(target);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 4, radiusY: 4, force: .7 }] });
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    async function touchDrag(source: Locator, target: { x: number; y: number }, fromTray = false) {
      const box = await bounds(source);
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const point = (x: number, y: number) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: .7 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start.x, start.y)] });
      if (fromTray) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(start.x, start.y - 12)] });
      await expect(source).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
      const pickupY = start.y - (fromTray ? 12 : 0);
      for (let step = 1; step <= 14; step++) {
        const t = step / 14;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [point(start.x + (target.x - start.x) * t, pickupY + (target.y - pickupY) * t)] });
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    try {
      await touchTap(page.getByRole('button', { name: 'Decor', exact: true }));
      await expect(page.getByRole('button', { name: 'Decor', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await touchTap(page.getByRole('button', { name: 'Seating', exact: true }));
      const canvas = await bounds(page.getByTestId('room-canvas'));
      const g = roomGeometry(canvas.width, canvas.height);
      const source = page.getByTestId('room-placed-leafy-plant'); const box = await bounds(source);
      // (6,2) -> (4,5): dx=-2, dy=3; preserve the exact pickup point.
      await touchDrag(source, { x: box.x + box.width / 2 - 5 * g.cellWidth / 2,
        y: box.y + box.height / 2 + g.cellHeight / 2 });
      await position(page, 'leafy-plant', 4, 5);
      await expect(page.getByTestId('room-placement-status')).toContainText('Leafy plant placed.');
      await touchTap(page.getByTestId('put-away-room-item'));
      await expect(source).toHaveCount(0);
      await touchTap(page.getByRole('button', { name: 'Decor', exact: true }));
      const tray = page.getByTestId('room-tray-leafy-plant');
      await tray.scrollIntoViewIfNeeded();
      const updated = await bounds(page.getByTestId('room-canvas'));
      const target = projectRoomPoint(6.5, 5.5, roomGeometry(updated.width, updated.height));
      await touchDrag(tray, { x: updated.x + target.x, y: updated.y + target.y }, true);
      await position(page, 'leafy-plant', 6, 5);
      await shot(page, 'decorate-touch');
      await touchTap(page.getByTestId('save-room'));
      await expect(page.getByTestId('decorate-room')).toBeVisible();
      expect((await currentRoom(page)).placements.find(p => p.itemId === 'leafy-plant')).toMatchObject({ x: 6, y: 5 });
      await page.reload(); await position(page, 'leafy-plant', 6, 5);
      expect(errors).toEqual([]);
    } finally {
      await test.info().attach('touch-events', { body: JSON.stringify(await page.evaluate(() => (window as unknown as { roomTouchEvents?: unknown[] }).roomTouchEvents ?? []), null, 2), contentType: 'application/json' });
      await cdp.detach();
    }
  });
});

for (const action of ['sign out', 'delete account'] as const) {
  test(`${action} removes this owner's room draft without clearing another owner's draft`, async ({ page }) => {
    const errors = watchErrors(page);
    const otherOwner = await account(page, `Other draft before ${action}`);
    await enter(page); await edit(page);
    await movePlaced(page, 'leafy-plant', { x: 6, y: 2 }, { x: 4, y: 5 });
    const otherKey = `bridgingminds:room-draft:v1:${otherOwner}`;
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), otherKey)).not.toBeNull();
    const otherDraft = await page.evaluate(key => localStorage.getItem(key), otherKey);
    // A second synthetic account on the same browser retains the first owner's local storage.
    // Use the real logout API here so only the final Settings action exercises draft deletion.
    const previousLogout = await page.request.post(`${base}/api/auth/logout`, { headers, data: {} });
    expect(previousLogout.ok()).toBeTruthy();
    const owner = await account(page, `Draft privacy ${action}`);
    page.once('dialog', dialog => dialog.accept());
    await page.reload(); await expect(page.getByTestId('decorate-room')).toBeVisible(); await edit(page);
    await movePlaced(page, 'leafy-plant', { x: 6, y: 2 }, { x: 5, y: 5 });
    const key = `bridgingminds:room-draft:v1:${owner}`;
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).not.toBeNull();
    // Browser navigation keeps the recoverable draft, unlike the explicit Discard button.
    page.once('dialog', dialog => dialog.accept());
    await page.goto('/settings');
    if (action === 'sign out') {
      const response = page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      expect((await response).ok()).toBeTruthy();
    } else {
      await page.getByRole('button', { name: 'Delete personal data', exact: true }).click();
      await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
      const response = page.waitForResponse(response => response.url().endsWith('/api/account') && response.request().method() === 'DELETE');
      await page.getByRole('button', { name: 'Permanently delete my data', exact: true }).click();
      expect((await response).ok()).toBeTruthy();
    }
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), otherKey)).toBe(otherDraft);
    expect((await page.request.get(`${base}/api/room`)).status()).toBe(401);
    expect(errors).toEqual([]);
  });
}
