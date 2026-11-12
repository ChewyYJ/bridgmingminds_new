import assert from 'node:assert/strict';
import test from 'node:test';
import { createNewsService, NEWS_SOURCES } from '../server/news.mjs';

const TODAY = 'Tue, 13 Oct 2026 09:00:00 GMT';
const YESTERDAY = 'Mon, 12 Oct 2026 12:00:00 GMT';
const response = xml => new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
const item = ({ title = 'A publisher headline', url = 'https://www.npr.org/news/item', date = TODAY, extra = '' } = {}) => `<item><title>${title}</title><link>${url}</link>${date ? `<pubDate>${date}</pubDate>` : ''}${extra}</item>`;
const rss = items => `<?xml version="1.0"?><rss version="2.0"><channel><title>Source</title>${items.join('')}</channel></rss>`;
const setup = (xml = rss([item()]), clock = '2026-10-13T12:00:00Z') => {
  let instant = new Date(clock);
  let failure = false;
  const calls = [];
  const service = createNewsService({
    now: () => instant,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (failure) throw new Error('offline');
      return response(url.includes('npr.org') ? xml : rss([]));
    },
  });
  return { service, calls, setTime: date => { instant = new Date(date); }, fail: () => { failure = true; } };
};

test('only source publication dates on today in the user timezone are returned', async () => {
  const xml = rss([
    item({ url: 'https://www.npr.org/news/today' }),
    item({ url: 'https://www.npr.org/news/old', date: YESTERDAY }),
    item({ url: 'https://www.npr.org/news/future', date: 'Tue, 13 Oct 2026 23:00:00 GMT' }),
    item({ url: 'https://www.npr.org/news/updated', date: null, extra: `<updated>${TODAY}</updated>` }),
  ]);
  const { service, calls } = setup(xml);
  const feed = await service.getFeed({ timezone: 'Asia/Singapore' });
  assert.equal(feed.day, '2026-10-13');
  assert.equal(feed.timezone, 'Asia/Singapore');
  assert.equal(feed.status, 'ok');
  assert.equal(feed.articles.length, 1);
  assert.equal(feed.articles[0].sourceUrl, 'https://www.npr.org/news/today');
  assert.equal(feed.articles[0].publishedAt, '2026-10-13T09:00:00.000Z');
  assert.equal(feed.fetchedAt, '2026-10-13T12:00:00.000Z');
  assert.deepEqual(Object.keys(feed.articles[0]).sort(), ['category', 'id', 'publishedAt', 'source', 'sourceUrl', 'title']);
  assert.equal(calls.length, NEWS_SOURCES.length);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('timezone boundaries change inclusion without changing publisher dates or refetching', async () => {
  const { service, calls } = setup(rss([
    item({ date: 'Mon, 12 Oct 2026 20:00:00 GMT', url: 'https://www.npr.org/news/early' }),
    item({ date: 'Tue, 13 Oct 2026 00:30:00 GMT', url: 'https://www.npr.org/news/later' }),
  ]), '2026-10-13T01:00:00Z');
  const singapore = await service.getFeed({ timezone: 'Asia/Singapore' });
  const utc = await service.getFeed({ timezone: 'UTC' });
  const la = await service.getFeed({ timezone: 'America/Los_Angeles' });
  assert.equal(singapore.articles.length, 2);
  assert.equal(utc.articles.length, 1);
  assert.equal(la.day, '2026-10-12');
  assert.equal(la.articles.length, 2);
  assert.equal(calls.length, NEWS_SOURCES.length);
});

test('ten-minute cache expires and coalesces concurrent requests', async () => {
  const { service, calls, setTime } = setup();
  await Promise.all(Array.from({ length: 12 }, () => service.getFeed()));
  assert.equal(calls.length, NEWS_SOURCES.length);
  setTime('2026-10-13T12:09:59Z');
  await service.getFeed();
  assert.equal(calls.length, NEWS_SOURCES.length);
  setTime('2026-10-13T12:10:00Z');
  await Promise.all([service.getFeed(), service.getFeed()]);
  assert.equal(calls.length, NEWS_SOURCES.length * 2);
});

test('a failed refresh exposes earlier fetch time and stale state', async () => {
  const { service, setTime, fail } = setup();
  await service.getFeed();
  fail();
  setTime('2026-10-13T12:11:00Z');
  const feed = await service.getFeed();
  assert.equal(feed.status, 'stale');
  assert.equal(feed.articles.length, 1);
  assert.equal(feed.fetchedAt, '2026-10-13T12:00:00.000Z');
  assert.match(feed.message, /Could not refresh/);
});

test('cached or stale headlines never cross midnight as today', async () => {
  const { service, setTime, fail } = setup(rss([item()]), '2026-10-13T23:58:00Z');
  assert.equal((await service.getFeed()).articles.length, 1);
  setTime('2026-10-14T00:01:00Z');
  const cache = await service.getFeed();
  assert.equal(cache.status, 'ok');
  assert.equal(cache.articles.length, 0);
  fail();
  setTime('2026-10-14T00:11:00Z');
  const stale = await service.getFeed();
  assert.equal(stale.status, 'stale');
  assert.equal(stale.articles.length, 0);
  assert.equal(stale.day, '2026-10-14');
});

test('cold failures return unavailable and do not fabricate fallback articles', async () => {
  const { service, fail, calls, setTime } = setup();
  fail();
  const feed = await service.getFeed();
  assert.equal(feed.status, 'unavailable');
  assert.equal(feed.fetchedAt, null);
  assert.deepEqual(feed.articles, []);
  await service.getFeed();
  assert.equal(calls.length, NEWS_SOURCES.length);
  setTime('2026-10-13T12:01:00Z');
  await service.getFeed();
  assert.equal(calls.length, NEWS_SOURCES.length * 2);
});

test('partial-source failures are explicit while successful publishers remain useful', async () => {
  const service = createNewsService({ now: () => new Date('2026-10-13T12:00:00Z'), fetchImpl: async url => {
    if (url.includes('nasa')) throw new Error('offline');
    return response(rss([item()]));
  } });
  const feed = await service.getFeed();
  assert.equal(feed.status, 'stale');
  assert.equal(feed.articles.length, 1);
  assert.match(feed.message, /NASA/);
});

test('CNA RSS preserves headline entities, Singapore publication dates and safe direct metadata links', async () => {
  const cna = NEWS_SOURCES.find(source => source.id === 'cna');
  assert.equal(cna.url, 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml');
  assert.deepEqual(cna.hosts, ['www.channelnewsasia.com']);
  const url = 'https://www.channelnewsasia.com/singapore/example-news-123456';
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <?xml-stylesheet title="XSL_formatting" type="text/xsl" href="/static/rss/nolsol.xsl"?>
    <rss version="2.0" xml:base="https://www.channelnewsasia.com/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel><title>Latest News</title><lastBuildDate>${TODAY}</lastBuildDate>
        ${item({ title: 'Singapore&#039;s parks &amp; gardens', url, date: 'Tue, 13 Oct 2026 01:30:00 +0800', extra: '<media:thumbnail/><description>Unrequested article body</description><content:encoded><![CDATA[<p>Unrequested full text</p>]]></content:encoded>' })}
        ${item({ url: 'https://www.channelnewsasia.com/old', date: 'Mon, 12 Oct 2026 23:59:00 +0800' })}
        ${item({ url: 'https://www.channelnewsasia.com/future', date: 'Wed, 14 Oct 2026 01:00:00 +0800' })}
        ${[
    'http://www.channelnewsasia.com/unsafe',
    'https://www.channelnewsasia.com.evil.example/unsafe',
    'https://channelnewsasia.com/unsafe',
    'https://cnalifestyle.channelnewsasia.com/unsafe',
    'https://reader:secret@www.channelnewsasia.com/unsafe',
    'https://www.channelnewsasia.com:8443/unsafe',
    'https://www.npr.org/unrelated',
  ].map(link => item({ url: link })).join('')}
      </channel>
    </rss>`;
  const service = createNewsService({
    now: () => new Date('2026-10-13T12:00:00Z'),
    fetchImpl: async sourceUrl => response(sourceUrl === cna.url ? xml : rss([])),
  });
  const feed = await service.getFeed({ timezone: 'Asia/Singapore' });
  assert.equal(feed.status, 'ok');
  assert.equal(feed.day, '2026-10-13');
  assert.equal(feed.articles.length, 1);
  assert.deepEqual(feed.articles[0], {
    id: feed.articles[0].id,
    title: "Singapore's parks & gardens",
    source: 'CNA',
    sourceUrl: url,
    publishedAt: '2026-10-12T17:30:00.000Z',
    category: 'News',
  });
  assert.match(feed.articles[0].id, /^news-[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(feed), /Unrequested|thumbnail|content:encoded/);
  assert.deepEqual((await service.getFeed({ timezone: 'UTC' })).articles, []);
});

test('CNA partial failure leaves other news available and recovers without fabricated headlines', async () => {
  const cna = NEWS_SOURCES.find(source => source.id === 'cna');
  let instant = new Date('2026-10-13T12:00:00Z');
  let cnaUnavailable = true;
  const service = createNewsService({
    now: () => instant,
    fetchImpl: async url => {
      if (url === cna.url) {
        if (cnaUnavailable) return new Response('', { status: 503 });
        return response(rss([item({ title: 'A CNA headline', url: 'https://www.channelnewsasia.com/asia/example-123456', date: 'Tue, 13 Oct 2026 18:00:00 +0800' })]));
      }
      return response(url.includes('npr.org') ? rss([item()]) : rss([]));
    },
  });
  const partial = await service.getFeed({ timezone: 'Asia/Singapore' });
  assert.equal(partial.status, 'stale');
  assert.match(partial.message, /Could not refresh CNA/);
  assert.deepEqual(partial.articles.map(article => article.source), ['NPR']);
  cnaUnavailable = false;
  instant = new Date('2026-10-13T12:01:00Z');
  const recovered = await service.getFeed({ timezone: 'Asia/Singapore' });
  assert.equal(recovered.status, 'ok');
  assert.deepEqual(recovered.articles.map(article => article.source), ['CNA', 'NPR']);
  cnaUnavailable = true;
  instant = new Date('2026-10-13T12:11:00Z');
  const stale = await service.getFeed({ timezone: 'Asia/Singapore' });
  assert.equal(stale.status, 'stale');
  assert.match(stale.message, /Could not refresh CNA/);
  assert.equal(stale.fetchedAt, '2026-10-13T12:01:00.000Z');
  assert.deepEqual(stale.articles, recovered.articles);
});

test('deduplicates links and retains deterministic article IDs', async () => {
  const { service, setTime } = setup(rss([item(), item(), item({ url: 'https://www.npr.org/news/item#section' })]));
  const first = await service.getFeed();
  assert.equal(first.articles.length, 1);
  setTime('2026-10-13T12:11:00Z');
  assert.equal((await service.getFeed()).articles[0].id, first.articles[0].id);
});

test('preserves plain headlines, decodes XML safely and never returns article HTML', async () => {
  const { service } = setup(rss([
    item({ title: 'Science &amp; society: Earth&#x2019;s future', extra: '<description><![CDATA[<script>alert(1)</script>private body]]></description>' }),
    item({ title: '<![CDATA[<script>alert(1)</script>]]>', url: 'https://www.npr.org/unsafe' }),
    item({ title: '&lt;img onerror=&quot;alert(1)&quot;&gt;', url: 'https://www.npr.org/unsafe-encoded' }),
    item({ title: 'Partial <b>markup</b> title', url: 'https://www.npr.org/nested' }),
    item({ title: '<![CDATA[Normal headline in CDATA]]>', url: 'https://www.npr.org/cdata' }),
  ]));
  const feed = await service.getFeed();
  assert.equal(feed.articles.length, 2);
  assert.equal(feed.articles[0].title, 'Science & society: Earth’s future');
  assert.doesNotMatch(JSON.stringify(feed), /script|private body|onerror/);
});

test('rejects unsafe links, ambiguous dates and impossible dates', async () => {
  const unsafeUrls = ['javascript:alert(1)', 'http://www.npr.org/x', 'https://evil.example/x', 'https://www.npr.org.evil.example/x', 'https://person:password@www.npr.org/x', 'https://www.npr.org:8443/x'];
  const { service } = setup(rss([
    ...unsafeUrls.map(url => item({ url })),
    item({ date: '2026-10-13' }),
    item({ date: 'Tue, 13 Oct 2026 09:00:00' }),
    item({ date: 'Tue, 30 Feb 2026 09:00:00 GMT' }),
    item({ date: 'Tue, 13 Oct 2026 09:00:00 +9999' }),
  ]));
  assert.deepEqual((await service.getFeed()).articles, []);
});

test('does not read forged items inside ignored CDATA or nested fields', async () => {
  const xml = rss([item({ extra: '<description><![CDATA[<item><title>Forged</title><link>https://www.npr.org/forged</link><pubDate>Tue, 13 Oct 2026 09:00:00 GMT</pubDate></item>]]></description>' })]);
  assert.equal((await setup(xml).service.getFeed()).articles.length, 1);
});

test('invalid timezone falls back explicitly to UTC', async () => {
  const feed = await setup().service.getFeed({ timezone: 'Invalid/Zone' });
  assert.equal(feed.timezone, 'UTC');
  assert.match(feed.message, /invalid timezone/);
});

test('numeric timezone offsets and daylight saving boundaries preserve publication instant', async () => {
  const { service } = setup(rss([item({ date: 'Sun, 01 Nov 2026 01:30:00 -0400' })]), '2026-11-01T07:00:00Z');
  const feed = await service.getFeed({ timezone: 'America/New_York' });
  assert.equal(feed.articles[0].publishedAt, '2026-11-01T05:30:00.000Z');
  assert.equal(feed.day, '2026-11-01');
});

for (const [name, xml] of [
  ['DTD entities', '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel/></rss>'],
  ['malformed XML', '<rss><channel><item></channel></rss>'],
  ['HTML error page', '<html><body>Error</body></html>'],
  ['oversized stream', `<rss><channel>${'x'.repeat(1024 * 1024)}</channel></rss>`],
]) {
  test(`rejects ${name}`, async () => {
    const service = createNewsService({ fetchImpl: async () => response(xml) });
    assert.equal((await service.getFeed()).status, 'unavailable');
  });
}

test('rejects non-XML, redirects, failure status and oversized declared responses', async () => {
  for (const makeResponse of [
    () => new Response(rss([]), { headers: { 'content-type': 'text/html' } }),
    () => new Response('', { status: 503 }),
    () => new Response(rss([]), { headers: { 'content-type': 'text/xml', 'content-length': String(1024 * 1024 + 1) } }),
    () => ({ ok: true, redirected: true }),
  ]) {
    const service = createNewsService({ fetchImpl: async () => makeResponse() });
    assert.equal((await service.getFeed()).status, 'unavailable');
  }
});

test('bounds stalled fetches at eight seconds and aborts the source requests', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const service = createNewsService({ fetchImpl: async (_url, { signal }) => {
    signals.push(signal);
    return new Promise(() => {});
  } });
  const result = service.getFeed();
  context.mock.timers.tick(8000);
  assert.equal((await result).status, 'unavailable');
  assert.equal(signals.length, NEWS_SOURCES.length);
  assert.ok(signals.every(signal => signal.aborted));
});
