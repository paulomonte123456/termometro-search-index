/* Motor de pesquisa do Cinema é Tudo Isso. Carregado uma única vez pelo Weebly. */
(() => {
  if (window.__CETI_SEARCH_STARTED__) return;
  window.__CETI_SEARCH_STARTED__ = true;

  const normalizar = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const palavras = (value) => normalizar(value).split(/\s+/).filter((word) => word.length > 1);

  const palavraEncontrada = (conjunto, termo) => {
    if (conjunto.has(termo)) return true;
    // Ajuda com plurais e pequenas variações, sem aceitar fragmentos muito curtos.
    return termo.length >= 4 && [...conjunto].some((word) => word.startsWith(termo));
  };

  function pontuar(masks) {
    const total = masks.length;
    const titleHits = masks.filter((mask) => mask & 1).length;
    const textHits = masks.filter((mask) => mask & 2).length;
    const both = masks.filter((mask) => mask === 3).length;
    if (titleHits === total && textHits === total) return 4;
    if (titleHits === total) return 3.5;
    if (both >= Math.max(1, total - 1)) return 3;
    if (textHits === total) return 2;
    if (titleHits >= Math.max(1, total - 1)) return 1.5;
    return 1;
  }

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  };

  function card(post, score) {
    const li = document.createElement('li');
    li.className = 'wsite-search-result ceti-search-result';
    li.dataset.pontos = String(score);
    li.dataset.date = post.date || '';

    const link = document.createElement('a');
    link.href = post.path;
    link.className = 'ceti-search-link';

    if (post.image) {
      const image = document.createElement('img');
      image.className = 'ceti-search-thumb';
      image.src = post.image;
      image.alt = '';
      image.loading = 'lazy';
      link.appendChild(image);
    }

    const content = document.createElement('div');
    content.className = 'ceti-search-card-content';
    const date = formatDate(post.date);
    if (date) {
      const dateEl = document.createElement('span');
      dateEl.className = 'blog-date';
      dateEl.textContent = date;
      content.appendChild(dateEl);
    }
    const title = document.createElement('h3');
    title.textContent = post.title || post.path.split('/').pop().replace(/-/g, ' ');
    content.appendChild(title);
    const description = document.createElement('p');
    description.textContent = post.excerpt ? `${post.excerpt.slice(0, 250)}${post.excerpt.length > 250 ? '...' : ''}` : '';
    content.appendChild(description);
    link.appendChild(content);
    li.appendChild(link);

    if (score === 4) {
      const badge = document.createElement('div');
      badge.className = 'destaque-recomendado';
      badge.textContent = '🔎 Resultado recomendado';
      li.insertBefore(badge, li.firstChild);
    }
    return li;
  }

  function injectStyle() {
    if (document.getElementById('ceti-search-style')) return;
    const style = document.createElement('style');
    style.id = 'ceti-search-style';
    style.textContent = `
      #wsite-search-list.ceti-search-ready { display:block !important; }
      .ceti-search-result { position:relative; }
      .ceti-search-link { display:flex; gap:14px; align-items:flex-start; }
      .ceti-search-thumb { width:120px; height:78px; object-fit:cover; border-radius:8px; flex:0 0 auto; }
      .ceti-search-card-content { min-width:0; }
      .ceti-search-card-content h3 { margin-top:3px; }
      .ceti-search-card-content .blog-date { display:block; margin-bottom:4px; }
      .ceti-search-result .destaque-recomendado { background:#ffc00c; color:#000; padding:5px 10px; font-weight:bold; font-size:11px; border-radius:0; text-transform:uppercase; letter-spacing:2px; }
      @media (max-width:600px) { .ceti-search-thumb { width:92px; height:64px; } .ceti-search-link { gap:10px; } }
    `;
    document.head.appendChild(style);
  }

  function baseUrl() {
    const source = document.currentScript?.src || [...document.scripts].find((script) => /busca\.js(?:\?|$)/.test(script.src))?.src;
    if (!source) throw new Error('Origem do busca.js não encontrada.');
    return new URL('.', source);
  }

  async function json(url, cache = 'force-cache') {
    const response = await fetch(url, { cache });
    if (!response.ok) throw new Error(`${url.pathname} respondeu HTTP ${response.status}`);
    return response.json();
  }

  async function procurar(termos) {
    const base = baseUrl();
    const manifest = await json(new URL('manifest.json', base), 'no-cache');
    const version = encodeURIComponent(manifest.generatedAt || '1');
    const [postData, ...termMaps] = await Promise.all([
      json(new URL(`posts.json?v=${version}`, base)),
      ...termos.map(async (term) => {
        const shard = (term.slice(0, 2) || '__').padEnd(2, '_');
        if (!(manifest.shards || []).includes(shard)) return new Map();
        const data = await json(new URL(`palavras/${shard}.json?v=${version}`, base));
        const result = new Map();
        for (const [word, rows] of Object.entries(data)) {
          if (word !== term && !(term.length >= 4 && word.startsWith(term))) continue;
          for (const [id, mask] of rows) result.set(id, (result.get(id) || 0) | mask);
        }
        return result;
      })
    ]);
    if (!termMaps.length) return [];
    const ids = [...termMaps[0].keys()].filter((id) => termMaps.every((map) => map.has(id)));
    return ids.map((id) => {
      const post = postData.posts?.[id];
      const masks = termMaps.map((map) => map.get(id) || 0);
      return post ? { post, score: pontuar(masks) } : null;
    }).filter(Boolean);
  }

  async function iniciar() {
    if (!window.location.pathname.includes('/apps/search')) return;
    const list = document.getElementById('wsite-search-list');
    if (!list) return;
    const rawQuery = new URLSearchParams(window.location.search).get('q') || '';
    const termos = [...new Set(palavras(rawQuery))];
    if (termos.length < 2) return;

    injectStyle();
    const original = list.innerHTML;
    list.classList.add('ceti-search-loading');
    try {
      const resultados = (await procurar(termos)).filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || String(b.post.date || '').localeCompare(String(a.post.date || '')));

      list.innerHTML = '';
      list.classList.add('ceti-search-ready');
      resultados.forEach(({ post, score }) => list.appendChild(card(post, score)));
      const nav = document.getElementById('wsite-search-pagenav');
      if (nav) nav.style.display = 'none';
      if (!resultados.length) {
        const empty = document.createElement('li');
        empty.className = 'ceti-search-empty';
        empty.textContent = `Nenhum resultado relevante encontrado para “${rawQuery}”.`;
        list.appendChild(empty);
      }
    } catch (error) {
      console.warn('Índice central indisponível; a manter resultados do Weebly.', error);
      list.innerHTML = original;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
