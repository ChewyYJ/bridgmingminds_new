import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Fixed sources only: neither feed URLs nor redirect targets come from clients.
// Personal, noncommercial reading; publisher text never enters the AI workflow.
export const NEWS_SOURCES = Object.freeze([
  Object.freeze({ id: 'npr', name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', hosts: ['www.npr.org', 'npr.org'], category: 'Society' }),
  Object.freeze({ id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/feed/', hosts: ['www.nasa.gov', 'science.nasa.gov', 'nasa.gov'], category: 'Science' }),
  Object.freeze({ id: 'cna', name: 'CNA', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', hosts: ['www.channelnewsasia.com'], category: 'News' }),
]);
const CACHE_MS = 10 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;
const MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS = 200;

function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  });
}

// A bounded RSS 2.0 reader, not a general XML engine. It never expands DTDs or
// external entities. Only direct item title/link/pubDate text is retained.
function readItems(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML declarations are not supported');
  const stack = [];
  const items = [];
  let item = null;
  let cursor = 0;
  let rootSeen = false;
  const addText = (value, cdata = false) => {
    if (item && stack.length === 4 && ['title', 'link', 'pubDate'].includes(stack[3])) {
      const field = stack[3];
      item[field] = (item[field] || '') + (cdata ? value : decodeXml(value));
      if (item[field].length > 4096) throw new Error('RSS field exceeds limit');
    }
  };
  while (cursor < xml.length) {
    if (xml[cursor] !== '<') {
      const end = xml.indexOf('<', cursor);
      const next = end === -1 ? xml.length : end;
      const value = xml.slice(cursor, next);
      if (!stack.length && value.trim()) throw new Error('Unexpected XML text');
      addText(value);
      cursor = next;
      continue;
    }
    const special = xml.startsWith('<![CDATA[', cursor) ? ['<![CDATA[', ']]>']
      : xml.startsWith('<!--', cursor) ? ['<!--', '-->']
        : xml.startsWith('<?', cursor) ? ['<?', '?>'] : null;
    if (special) {
      const end = xml.indexOf(special[1], cursor + special[0].length);
      if (end === -1) throw new Error('Incomplete XML');
      if (special[0] === '<![CDATA[') addText(xml.slice(cursor + 9, end), true);
      cursor = end + special[1].length;
      continue;
    }
    let end = cursor + 1;
    let quote = null;
    for (; end < xml.length; end += 1) {
      const char = xml[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === xml.length) throw new Error('Incomplete XML tag');
    const tag = xml.slice(cursor + 1, end).trim();
    const close = tag.startsWith('/');
    const selfClosing = tag.endsWith('/');
    const name = (close ? tag.slice(1) : tag).match(/^([A-Za-z_][\w:.-]*)(?:\s|\/|$)/)?.[1];
    if (!name) throw new Error('Invalid XML tag');
    if (close) {
      if (stack.at(-1) !== name) throw new Error('Mismatched XML tag');
      if (stack.join('/') === 'rss/channel/item') {
        if (items.length < MAX_ITEMS) items.push(item);
        item = null;
      }
      stack.pop();
    } else {
      if (!stack.length) {
        if (rootSeen || name !== 'rss') throw new Error('Expected RSS feed');
        rootSeen = true;
      }
      if (item && stack.length === 4 && ['title', 'link', 'pubDate'].includes(stack[3])) item.invalid = true;
      stack.push(name);
      if (stack.length > 64) throw new Error('XML nesting exceeds limit');
      if (stack.join('/') === 'rss/channel/item') item = {};
      if (selfClosing) stack.pop();
    }
    cursor = end + 1;
  }
  if (!rootSeen || stack.length) throw new Error('Incomplete RSS feed');
  return items;
}

function publicationTimestamp(value) {
  const match = value?.trim().match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UT|UTC|[+-]\d{4})$/i);
  if (!match) return NaN;
  const [, date, month, year, hour, minute, second = '0', zone] = match;
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month.toLowerCase());
  const local = new Date(Date.UTC(+year, monthIndex, +date, +hour, +minute, +second));
  if (local.getUTCFullYear() !== +year || local.getUTCMonth() !== monthIndex || local.getUTCDate() !== +date || local.getUTCHours() !== +hour || local.getUTCMinutes() !== +minute || local.getUTCSeconds() !== +second) return NaN;
  let offset = 0;
  if (/^[+-]/.test(zone)) {
    if (+zone.slice(1, 3) > 23 || +zone.slice(3) > 59) return NaN;
    offset = (+zone.slice(1, 3) * 60 + +zone.slice(3)) * (zone[0] === '+' ? 1 : -1);
  }
  return local.getTime() - offset * 60000;
}

function safeArticle(item, source) {
  // Keep the headline's wording. Suspicious markup/control characters are
  // rejected rather than transformed into a different publisher headline.
  if (item.invalid) return null;
  const title = item.title?.trim();
  if (!title || title.length > 500 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title)) return null;
  const timestamp = publicationTimestamp(item.pubDate);
  if (!Number.isFinite(timestamp)) return null;
  let url;
  try { url = new URL(item.link?.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || !source.hosts.includes(url.hostname) || url.username || url.password || url.port) return null;
  return {
    id: `news-${createHash('sha256').update(`${source.id}:${url.href}`).digest('hex').slice(0, 24)}`,
    title,
    source: source.name,
    sourceUrl: url.href,
    publishedAt: new Date(timestamp).toISOString(),
    category: source.category,
  };
}

async function fetchArticles(source, fetchImpl) {
  const controller = new AbortController();
  let timeout;
  const expired = new Promise((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('News source timed out')); }, FETCH_TIMEOUT_MS);
  });
  const work = (async () => {
    const response = await fetchImpl(source.url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'MindGarden-PersonalReader/1.0' },
    });
    if (!response.ok) throw new Error('News source is unavailable');
    if (response.redirected || (response.url && response.url !== source.url)) throw new Error('Unexpected source redirect');
    if (!/^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Expected XML content');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('News source exceeds limit');
    if (!response.body) throw new Error('Empty news response');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('News source exceeds limit'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const articles = readItems(Buffer.concat(chunks).toString('utf8')).map(item => safeArticle(item, source)).filter(Boolean);
    return articles;
  })();
  try { return await Promise.race([work, expired]); }
  finally { clearTimeout(timeout); controller.abort(); }
}

function calendar(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); }
}
function dayIn(formatter, date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function createNewsService({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const snapshots = new Map();
  let lastAttempt = null;
  let failedSources = [];
  let inFlight = null;
  async function refresh() {
    const fetchedAt = new Date(now()).toISOString();
    failedSources = [];
    await Promise.all(NEWS_SOURCES.map(async source => {
      try { snapshots.set(source.id, { articles: await fetchArticles(source, fetchImpl), fetchedAt }); }
      catch { failedSources.push(source.name); }
    }));
    lastAttempt = new Date(now()).getTime();
  }
  return {
    async getFeed({ timezone = 'UTC' } = {}) {
      const currentTime = new Date(now()).getTime();
      if (inFlight) await inFlight;
      else if (lastAttempt === null || currentTime - lastAttempt >= (failedSources.length ? FAILURE_RETRY_MS : CACHE_MS) || currentTime < lastAttempt) {
        inFlight = refresh();
        try { await inFlight; } finally { inFlight = null; }
      }
      const current = new Date(now());
      const formatter = calendar(timezone);
      const resolvedTimezone = formatter.resolvedOptions().timeZone;
      const day = dayIn(formatter, current);
      const seen = new Set();
      const articles = [...snapshots.values()].flatMap(snapshot => snapshot.articles)
        .filter(article => {
          // Filtering runs on every read, including cache reads across midnight.
          const date = new Date(article.publishedAt);
          const dedupKey = new URL(article.sourceUrl);
          dedupKey.hash = '';
          if (date > current || dayIn(formatter, date) !== day || seen.has(dedupKey.href)) return false;
          seen.add(dedupKey.href);
          return true;
        }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      const status = failedSources.length ? snapshots.size ? 'stale' : 'unavailable' : 'ok';
      // Earliest source snapshot conservatively describes the combined cache.
      const fetchedAt = [...snapshots.values()].map(snapshot => snapshot.fetchedAt).sort()[0] || null;
      const messages = [];
      if (status === 'unavailable') messages.push('News sources could not be reached. Try again later.');
      else if (status === 'stale') messages.push(`Could not refresh ${failedSources.join(' and ')}. Available headlines may be from an earlier fetch.`);
      if (!articles.length && status !== 'unavailable') messages.push('No headlines published today are available from these sources yet.');
      if (resolvedTimezone === 'UTC' && timezone !== 'UTC' && timezone !== 'Etc/UTC') {
        try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
        catch { messages.push('An invalid timezone was replaced with UTC.'); }
      }
      return { articles, fetchedAt, day, timezone: resolvedTimezone, status, ...(messages.length ? { message: messages.join(' ') } : {}) };
    },
  };
}
