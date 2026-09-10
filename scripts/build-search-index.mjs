import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SITE_ORIGIN = 'https://www.termometrooscar.com';
export const BLOG_PATH = '/cinema-eacute-tudo-isso---blog';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_DELAY_MS = 120;
const DEFAULT_POST_CONCURRENCY = 4;
const DEFAULT_MAX_PAGES = 1_000;

// V8 pode conservar todo o HTML original através de uma pequena substring.
// Copiar os campos que sobrevivem à leitura permite libertar essa página.
function detachedString(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('utf8');
}

function detachedFields(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, detachedString(value)]));
}

function memoryLabel() {
  return `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB de heap`;
}

function parseArgs(argv) {
  const args = { mode: 'incremental', state: 'data/search-state.json', outputDir: 'public', maxPages: DEFAULT_MAX_PAGES };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--state') args.state = argv[++i];
    else if (arg === '--output-dir') args.outputDir = argv[++i];
    else if (arg === '--max-pages') args.maxPages = Number(argv[++i]);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!['full', 'incremental'].includes(args.mode)) throw new Error('Use --mode full ou --mode incremental.');
  if (!Number.isInteger(args.maxPages) || args.maxPages < 1) throw new Error('--max-pages precisa de ser positivo.');
  return args;
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? htmlDecode(match[2]) : '';
}

function absoluteUrl(value, base = SITE_ORIGIN) {
  try { return new URL(htmlDecode(value), base).href; } catch { return ''; }
}

function normalisePath(value) {
  try { return new URL(value, SITE_ORIGIN).pathname.replace(/\/+$/, '').toLowerCase(); } catch { return ''; }
}

function stripHtml(value) {
  return htmlDecode(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\b(imagem|ler mais|saiba mais|clique aqui|veja mais|confira|acesse|leia mais)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))).toISOString();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function extractBlogFragments(html) {
  const starts = [];
  const pattern = /<div\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const id = attr(match[0], 'id');
    const classes = attr(match[0], 'class').split(/\s+/);
    if (/^blog-post-\d+$/.test(id) && classes.includes('blog-post')) starts.push({ id, start: match.index });
  }
  return starts.map((entry, index) => ({ ...entry, html: html.slice(entry.start, starts[index + 1]?.start ?? html.length) }));
}

function firstMatch(fragment, regex) {
  const match = String(fragment).match(regex);
  return match ? match[1] : '';
}

export function extractArchivePosts(html, baseUrl = SITE_ORIGIN) {
  return extractBlogFragments(html).map(({ id, html: fragment }) => {
    const titleTag = firstMatch(fragment, /<a\b[^>]*class=["'][^"']*\bblog-title-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const hrefTag = fragment.match(/<a\b[^>]*class=["'][^"']*\bblog-title-link\b[^"']*["'][^>]*>/i)?.[0] || '';
    const dateText = firstMatch(fragment, /<span\b[^>]*class=["'][^"']*\bdate-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const content = firstMatch(fragment, /<div\b[^>]*class=["'][^"']*\bblog-content\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bblog-comments-bottom\b)/i);
    const image = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || fragment.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '';
    const pathValue = normalisePath(absoluteUrl(attr(hrefTag, 'href'), baseUrl));
    return detachedFields({
      id,
      path: pathValue,
      title: stripHtml(titleTag),
      date: parseDate(stripHtml(dateText)),
      image: absoluteUrl(image, baseUrl),
      text: stripHtml(content).slice(0, 4000)
    });
  }).filter((post) => post.path);
}

export function extractNextPage(html, currentUrl) {
  const nav = html.match(/<div\b[^>]*class=["'][^"']*\bblog-page-nav-previous\b[^"']*["'][^>]*>[\s\S]{0,1800}?<a\b[^>]*>/i);
  const href = nav ? attr(nav[0].match(/<a\b[^>]*>/i)?.[0] || '', 'href') : '';
  return href ? detachedString(absoluteUrl(href, currentUrl)) : '';
}

function cdata(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  return match ? htmlDecode(match[1].trim()) : '';
}

export function parseFeed(xml) {
  return (String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || []).map((item) => detachedFields({
    path: normalisePath(cdata(item, 'link')),
    title: stripHtml(cdata(item, 'title')),
    date: parseDate(cdata(item, 'pubDate')),
    image: absoluteUrl((cdata(item, 'content:encoded').match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1]),
    text: stripHtml(cdata(item, 'content:encoded')).slice(0, 4000)
  })).filter((item) => item.path);
}

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchText(url, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'TermometroOscarSearchIndex/1.0' } });
      if (response.status === 404 || response.status === 410) return { text: '', missing: true };
      if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
      return { text: await response.text(), missing: false };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(700 * attempt);
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function crawlArchive(maxPages) {
  let url = `${SITE_ORIGIN}${BLOG_PATH}`;
  const posts = new Map();
  const visited = new Set();
  for (let page = 1; page <= maxPages && url; page += 1) {
    if (visited.has(url)) throw new Error(`Paginação circular em ${url}`);
    visited.add(url);
    const response = await fetchText(url);
    if (response.missing) break;
    const pagePosts = extractArchivePosts(response.text, url);
    for (const post of pagePosts) posts.set(post.path, post);
    console.log(`[arquivo] página ${page}: ${pagePosts.length} posts; total ${posts.size}; ${memoryLabel()}.`);
    url = extractNextPage(response.text, url);
    if (url) await sleep(Number(process.env.REQUEST_DELAY_MS || DEFAULT_DELAY_MS));
  }
  if (url) throw new Error(`O arquivo excedeu o limite de ${maxPages} páginas.`);
  return [...posts.values()];
}

async function enrichPost(post) {
  try {
    const response = await fetchText(`${SITE_ORIGIN}${post.path}`);
    if (response.missing) return post;
    const details = extractArchivePosts(response.text, `${SITE_ORIGIN}${post.path}`)[0] || {};
    const fragment = extractBlogFragments(response.text)[0]?.html || response.text;
    const content = firstMatch(fragment, /<div\b[^>]*class=["'][^"']*\bblog-content\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bblog-comments-bottom\b)/i);
    return detachedFields({
      id: details.id || post.id,
      path: post.path,
      title: details.title || post.title,
      date: details.date || post.date,
      image: details.image || post.image,
      text: stripHtml(content).slice(0, 4000)
    });
  } catch (error) {
    console.warn(`[post] falha em ${post.path}: ${error.message}`);
    return post;
  }
}

function cleanPost(post) {
  const postPath = normalisePath(post.path);
  return detachedFields({
    id: String(post.id || crypto.createHash('sha1').update(postPath).digest('hex').slice(0, 16)),
    path: postPath,
    title: String(post.title || '').trim(),
    date: post.date || '',
    image: post.image || '',
    text: String(post.text || '').trim().slice(0, 4000)
  });
}

async function buildFull(maxPages) {
  console.log('[fase 1/3] Recolher endereços no arquivo do blog.');
  const archivePosts = await crawlArchive(maxPages);
  const concurrency = Number(process.env.POST_CONCURRENCY || DEFAULT_POST_CONCURRENCY);
  let completed = 0;
  console.log(`[fase 2/3] Ler ${archivePosts.length} publicações, até ${concurrency} em simultâneo.`);
  return (await mapWithLimit(archivePosts, concurrency, async (post, index) => {
    if (index > 0) await sleep(Number(process.env.REQUEST_DELAY_MS || DEFAULT_DELAY_MS));
    const result = cleanPost(await enrichPost(post));
    completed += 1;
    if (completed % 25 === 0 || completed === archivePosts.length) {
      console.log(`[posts] ${completed}/${archivePosts.length} processados; ${memoryLabel()}.`);
    }
    return result;
  })).filter((post) => post.path);
}

async function loadState(statePath) {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function buildIncremental(previous) {
  const map = new Map((previous.posts || []).map((post) => [post.path, post]));
  const feed = await fetchText(`${SITE_ORIGIN}${BLOG_PATH}/feed`);
  let changed = false;
  for (const item of parseFeed(feed.text)) {
    const old = map.get(item.path);
    const incoming = cleanPost({
      ...old,
      ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== ''))
    });
    const needsText = !incoming.text || !incoming.title || !incoming.date;
    const next = needsText ? cleanPost(await enrichPost(incoming)) : incoming;
    if (JSON.stringify(old || null) !== JSON.stringify(next)) { map.set(next.path, next); changed = true; }
  }
  return { posts: [...map.values()], changed };
}

async function writeIndex(statePath, outputDir, posts) {
  const ordered = posts.map(cleanPost).filter((post) => post.path).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));
  const generatedAt = new Date().toISOString();
  const state = { version: 1, generatedAt, posts: ordered };
  const publicPosts = {};
  const words = new Map();

  const tokens = (value) => [...new Set(String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter((word) => word.length > 1))];

  for (const post of ordered) {
    publicPosts[post.id] = {
      path: post.path,
      title: post.title,
      date: post.date,
      image: post.image,
      excerpt: post.text.slice(0, 280)
    };
    const masks = new Map();
    for (const word of tokens(post.title)) masks.set(word, (masks.get(word) || 0) | 1);
    for (const word of tokens(post.text)) masks.set(word, (masks.get(word) || 0) | 2);
    for (const [word, mask] of masks) {
      if (!words.has(word)) words.set(word, []);
      words.get(word).push([post.id, mask]);
    }
  }

  const shards = new Map();
  for (const [word, matches] of words) {
    const shard = (word.slice(0, 2) || '__').padEnd(2, '_');
    if (!shards.has(shard)) shards.set(shard, {});
    shards.get(shard)[word] = matches;
  }

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(path.join(outputDir, 'palavras'), { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, 'palavras'), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state)}\n`);
  await fs.writeFile(path.join(outputDir, 'estado.json'), `${JSON.stringify(state)}\n`);
  await fs.writeFile(path.join(outputDir, 'posts.json'), `${JSON.stringify({ version: 1, generatedAt, posts: publicPosts })}\n`);
  const shardNames = [...shards.keys()].sort();
  for (const shard of shardNames) {
    await fs.writeFile(path.join(outputDir, 'palavras', `${shard}.json`), `${JSON.stringify(shards.get(shard))}\n`);
  }
  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ version: 1, generatedAt, posts: ordered.length, shards: shardNames })}\n`);
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const statePath = path.resolve(root, args.state);
  const outputDir = path.resolve(root, args.outputDir);
  const previous = await loadState(statePath);
  let posts;
  let changed;
  if (args.mode === 'full' || !previous) {
    posts = await buildFull(args.maxPages);
    changed = true;
  } else {
    ({ posts, changed } = await buildIncremental(previous));
  }
  console.log(`[fase 3/3] Construir ficheiros de palavras para ${posts.length} posts; ${memoryLabel()}.`);
  const index = await writeIndex(statePath, outputDir, posts);
  console.log(changed ? `Índice ${args.mode} gravado com ${index.posts.length} posts.` : `Nenhum post novo ou alterado; ${index.posts.length} posts republicados.`);
  console.log(`INDEX_CHANGED=${changed ? 'true' : 'false'}`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const heartbeat = setInterval(() => console.log(`[activo] ${memoryLabel()}`), 30_000);
  main().catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => clearInterval(heartbeat));
}
