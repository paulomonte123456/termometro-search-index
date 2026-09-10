import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArchivePosts, extractNextPage, parseFeed } from '../scripts/build-search-index.mjs';

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
