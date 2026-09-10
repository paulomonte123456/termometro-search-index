import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { extractArchivePosts, extractNextPage, parseFeed } from '../scripts/build-search-index.mjs';

test('os campos dos posts não retêm o HTML completo das páginas', () => {
  const moduleUrl = new URL('../scripts/build-search-index.mjs', import.meta.url).href;
  const script = `
    import { extractArchivePosts } from ${JSON.stringify(moduleUrl)};
    global.gc();
    const before = process.memoryUsage().heapUsed;
    const posts = [];
    for (let n = 0; n < 100; n++) {
      const html = '<div id="blog-post-' + (100000000000000000n + BigInt(n)) +
        '" class="blog-post"><a class="blog-title-link" href="/cinema-eacute-tudo-isso---blog/test-' + n +
        '">Uma notícia com título bastante longo ' + n + '</a><div class="blog-content">Texto da notícia</div>' +
        '<div class="blog-comments-bottom"></div></div><!--' + 'x'.repeat(1024 * 1024) + '-->';
      posts.push(...extractArchivePosts(html));
    }
    global.gc();
    console.log(JSON.stringify({ count: posts.length, retainedMB: (process.memoryUsage().heapUsed - before) / 1024 / 1024 }));
  `;
  const run = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=128', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.count, 100);
  assert.ok(result.retainedMB < 16, `HTML retido: ${result.retainedMB.toFixed(1)} MB`);
});

test('extrai publicação do arquivo', () => {
  const html = `<div id="blog-post-123" class="blog-post"><p class="blog-date"><span class="date-text">9/9/2026</span></p><h2><a class="blog-title-link" href="/cinema-eacute-tudo-isso---blog/teste">Título &amp; teste</a></h2><div class="blog-content"><img src="/foto.jpg"><p>Texto principal.</p></div></div>`;
  const [post] = extractArchivePosts(html);
  assert.equal(post.path, '/cinema-eacute-tudo-isso---blog/teste');
  assert.equal(post.title, 'Título & teste');
  assert.equal(post.date, '2026-09-09T00:00:00.000Z');
  assert.match(post.image, /foto\.jpg$/);
});

test('encontra a página anterior do arquivo', () => {
  const html = `<div class="blog-page-nav-previous"><a href="?page=2">Anterior</a></div>`;
  assert.equal(extractNextPage(html, 'https://www.termometrooscar.com/blog'), 'https://www.termometrooscar.com/blog?page=2');
});

test('lê itens do feed', () => {
  const xml = `<item><title><![CDATA[Filme Novo]]></title><link><![CDATA[https://www.termometrooscar.com/cinema-eacute-tudo-isso---blog/filme-novo]]></link><pubDate>Wed, 09 Sep 2026 12:00:00 +0000</pubDate><content:encoded><![CDATA[<p>Texto do post</p>]]></content:encoded></item>`;
  const [item] = parseFeed(xml);
  assert.equal(item.title, 'Filme Novo');
  assert.equal(item.path, '/cinema-eacute-tudo-isso---blog/filme-novo');
  assert.equal(item.text, 'Texto do post');
});
