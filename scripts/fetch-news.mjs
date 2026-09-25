// Fetches AI news from established outlets' RSS/Atom feeds and writes site/news.json.
// Runs on GitHub's servers (see .github/workflows/news.yml), so browser CORS limits don't apply.
// No dependencies: needs Node 18+ for built-in fetch.
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';

// aiOnly: true  -> the feed is already an AI topic feed; keep every item.
// aiOnly: false -> general tech feed; keep only items whose title matches AI_RE.
// If a URL stops working, the run keeps going and the log shows which feed failed.
export const FEEDS = [
  { source: 'The Verge',             url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', aiOnly: true },
  { source: 'TechCrunch',            url: 'https://techcrunch.com/category/artificial-intelligence/feed/',     aiOnly: true },
  { source: 'Wired',                 url: 'https://www.wired.com/feed/tag/ai/latest/rss',                      aiOnly: true },
  { source: 'Ars Technica',          url: 'https://arstechnica.com/ai/feed/',                                  aiOnly: true },
  { source: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', aiOnly: true },
  { source: 'The Guardian',          url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss', aiOnly: true },
  { source: 'BBC News',              url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',                  aiOnly: false },
];

export const AI_RE = /\b(AI|A\.I\.|AGI|LLMs?|GPT[-\d.o]*|ChatGPT|OpenAI|Anthropic|Claude|Gemini|DeepMind|Llama|Mistral|Copilot|machine learning|neural net(work)?s?|deep learning|chatbots?|artificial intelligence)\b/i;

const MAX_AGE_DAYS = 7;
const MAX_ITEMS = 80;

export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
export function clean(s) {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  s = s.replace(/<[^>]+>/g, '');           // tags that were entity-encoded
  return s.replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? clean(m[1]) : '';
}
function link(block) {
  // Atom: <link rel="alternate" href="..."/> (or first <link href>)
  let m = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i)
       || block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i);
  if (m) return decode(m[1]);
  // RSS: <link>https://...</link>
  const t = tag(block, 'link');
  if (/^https?:\/\//.test(t)) return t;
  m = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  if (m) return decode(m[1]);
  const g = tag(block, 'guid');
  return /^https?:\/\//.test(g) ? g : '';
}

// Short summary the outlet provides in its feed (never the full article):
// cut to ~300 characters at a word boundary, and strip feed boilerplate.
const SUMMARY_MAX = 300;
function summarize(block) {
  let raw = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content');
  raw = raw
    .replace(/The post .{0,300}? appeared first on .{0,80}?\.?$/i, '')
    .replace(/\s*Continue reading\.{0,3}\s*$/i, '')
    .replace(/\s*(Read more|Read the full story).{0,40}$/i, '')
    .trim();
  if (raw.length <= SUMMARY_MAX) return raw;
  const cut = raw.slice(0, SUMMARY_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
function image(block) {
  const pats = [
    /<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*\bmedium=["']image["']/i,
    /<media:content\b[^>]*\bmedium=["']image["'][^>]*\burl=["']([^"']+)["']/i,
    /<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i,
    /<media:content\b[^>]*\burl=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i,
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*\btype=["']image\//i,
    /<enclosure\b[^>]*\btype=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i,
  ];
  for (const re of pats) { const m = block.match(re); if (m && /^https:\/\//.test(decode(m[1]))) return decode(m[1]); }
  // first <img> inside the description/content, if any
  const m = block.match(/(?:<|&lt;)img\b[^>]*?\bsrc=(?:["']|&quot;|&#34;)(https:\/\/[^"'&<>\s]+)/i);
  return m ? decode(m[1]) : '';
}

export function parseFeed(xml, feed) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    const url = link(b);
    const when = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = Math.floor(Date.parse(when) / 1000);
    if (!title || !url || !Number.isFinite(t)) continue;
    if (!feed.aiOnly && !AI_RE.test(title)) continue;
    out.push({ title, url, source: feed.source, t, summary: summarize(b), image: image(b) });
  }
  return out;
}

async function getFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'AxonNewsBot/1.0 (+personal news reader)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseFeed(await res.text(), feed);
}

function key(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

async function main() {
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;
  const status = [];
  const all = [];
  const results = await Promise.allSettled(FEEDS.map(getFeed));
  results.forEach((r, i) => {
    const f = FEEDS[i];
    if (r.status === 'fulfilled') {
      const items = r.value.filter(x => x.t > cutoff && x.t < Date.now() / 1000 + 3600);
      all.push(...items);
      status.push({ source: f.source, ok: true, count: items.length });
      console.log(`OK    ${f.source.padEnd(22)} ${items.length} stories`);
    } else {
      status.push({ source: f.source, ok: false, count: 0 });
      console.log(`FAIL  ${f.source.padEnd(22)} ${r.reason?.message || r.reason}  (${f.url})`);
    }
  });

  // de-duplicate by URL and by near-identical headline
  const seenUrl = new Set(), seenTitle = new Set(), items = [];
  for (const it of all.sort((a, b) => b.t - a.t)) {
    const u = it.url.split('?')[0], k = key(it.title);
    if (seenUrl.has(u) || seenTitle.has(k)) continue;
    seenUrl.add(u); seenTitle.add(k);
    items.push({ id: Buffer.from(u).toString('base64url').slice(-24), ...it });
    if (items.length >= MAX_ITEMS) break;
  }

  if (!items.length) {
    console.log('No stories fetched from any source; keeping the previous news.json.');
    process.exitCode = 1;
    return;
  }

  // Only redeploy when the story list actually changed (or when forced, e.g. after you edit the app).
  let changed = true;
  if (process.env.FORCE !== 'true' && process.env.PREV_URL) {
    try {
      const prev = await (await fetch(process.env.PREV_URL + '?ts=' + Date.now(), { signal: AbortSignal.timeout(15000) })).json();
      const a = (prev.items || []).map(x => x.id).join(',');
      const b = items.map(x => x.id).join(',');
      changed = a !== b;
    } catch { changed = true; }   // no live copy yet (first run) -> deploy
  }
  mkdirSync('site', { recursive: true });
  writeFileSync('site/news.json', JSON.stringify({ generatedAt: Math.floor(Date.now() / 1000), sources: status, items }));
  console.log(`Collected ${items.length} stories from ${status.filter(s => s.ok).length}/${FEEDS.length} sources. ${changed ? 'New stories: deploying.' : 'Nothing new: skipping deploy.'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
