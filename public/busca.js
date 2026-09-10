/* Motor de pesquisa do Cinema é Tudo Isso. Carregado uma única vez pelo Weebly. */
(() => {
  if (window.__CETI_SEARCH_STARTED__) return;
  window.__CETI_SEARCH_STARTED__ = true;

  const TMDB_KEY = 'a0afb0f35a772ff880806e0d18ffc800';
  const INDEX_ROOT = 'https://paulomonte123456.github.io/termometro-search-index/';

  const normalizar = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const palavras = (value) => normalizar(value).split(/\s+/).filter((word) => word.length > 1);

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

  function baseUrl() { return new URL(INDEX_ROOT); }

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
      html, body { background:#f0f0f0 !important; min-height:100vh !important; }
      #wsite-content { background:transparent !important; }
      #wsite-search-list.ceti-search-pending { visibility:hidden; }
      #wsite-search-list.ceti-search-ready { display:block !important; visibility:visible; }
      .ceti-search-result { position:relative; }
      .ceti-search-link { display:flex; gap:14px; align-items:flex-start; }
      .ceti-search-thumb { width:120px; height:78px; object-fit:cover; border-radius:8px; flex:0 0 auto; }
      .ceti-search-card-content { min-width:0; }
      .ceti-search-card-content h3 { margin-top:3px; }
      .ceti-search-card-content .blog-date { display:block; margin-bottom:4px; }
      .ceti-search-result .destaque-recomendado { background:#ffc00c; color:#000; padding:5px 10px; font-weight:bold; font-size:11px; border-radius:0; text-transform:uppercase; letter-spacing:2px; }
      #wsite-search-sidebar { visibility:visible; }
      .wsite-search-filter-entries li:nth-child(1), .wsite-search-filter-entries li:nth-child(2), .wsite-search-filter-entries li:nth-child(4), .wsite-search-facet.wsite-search-facet-availability { display:none !important; }
      body.blog-filter #wsite-search-product-result-section, body.blog-filter .wsite-search-facet.wsite-search-facet-price, body.blog-filter .wsite-search-facet.wsite-search-facet-checkbox { display:none !important; }
      #custom-search-wrapper { position:relative; width:100%; }
      #form-busca-customizada { display:flex; align-items:center; border:0; border-radius:30px; background:#fff; overflow:visible; position:relative; }
      #input-busca-customizada { flex:1; font-size:1.75em; min-height:30px; width:100%; padding:6px 10px; border:none; background:url(/images/util/inputs/search-input-bg.jpg?1746488149) repeat-x top #fff; position:relative; z-index:2; }
      #form-busca-customizada button { width:47px; height:43px; background:url(https://i.imgur.com/3nHyCp5.png) no-repeat center #ffc00c; border:none; border-left:1px solid #a8a8a8; cursor:pointer; position:relative; z-index:2; }
      #autocomplete-container { position:relative; width:95%; background:#fff; z-index:10000; max-height:350px; overflow-y:auto; font-family:Open Sans,sans-serif; border-radius:0 10px 12px 12px; box-shadow:0 3px 12px rgba(0,0,0,.1); margin:0 auto; }
      .autocomplete-section { padding:6px 10px; font-weight:bold; background:#f9f9f9; border-bottom:1px solid #eee; color:#444; }
      .autocomplete-item { padding:10px 12px; cursor:pointer; transition:background .2s ease,color .2s ease; display:flex; align-items:center; gap:10px; }
      .autocomplete-item:hover, .autocomplete-item.active { background:#ffc00c; color:#000; }
      #alerta-uma-palavra { display:none; margin:10px auto 0; font-size:18px; background:#f8d7da; color:#721c24; padding:12px; border-radius:8px; border:1px solid #f5c6cb; max-width:100%; text-align:center; }
      .ceti-empty, .ceti-query-warning { margin:20px auto; max-width:600px; text-align:center; font-size:18px; padding:15px; border-radius:8px; }
      .ceti-query-warning { background:#fff3cd; color:#856404; border:1px solid #ffeeba; }
      .ceti-empty { background:#f8d7da; color:#721c24; border:1px solid #f5c6cb; }
      @media (max-width:600px) { .ceti-search-thumb { width:92px; height:64px; } .ceti-search-link { gap:10px; } }
    `;
    document.head.appendChild(style);
  }

  function showWarning(text) {
    if (document.querySelector('.ceti-query-warning')) return;
    const area = document.getElementById('wsite-search-results') || document.getElementById('wsite-search-list')?.parentElement;
    if (!area) return;
    const warning = document.createElement('div');
    warning.className = 'ceti-query-warning';
    warning.textContent = text;
    area.prepend(warning);
    const list = document.getElementById('wsite-search-list');
    const nav = document.getElementById('wsite-search-pagenav');
    if (list) list.style.display = 'none';
    if (nav) nav.style.display = 'none';
  }

  function setupSidebar() {
    const filter = new URLSearchParams(location.search).get('filter');
    if (filter === 'blog_post') document.body.classList.add('blog-filter');
    document.querySelectorAll('.wsite-search-filter-entries a').forEach((link) => {
      const li = link.closest('li');
      const text = link.textContent || '';
      if (text.includes('Publicações do blogue')) {
        const count = text.match(/\d+/)?.[0] || '';
        link.innerHTML = `<span style="font-weight:600;">Notícias</span> <span style="opacity:.6">(${count})</span>`;
        link.dataset.filter = 'blog_post';
        if (li) li.style.display = 'inline-flex';
      }
      if (text.includes('Produtos') || text.includes('Biblioteca Termómetro') || text.includes('Ficheiros')) li?.remove();
    });
    const isBlog = filter === 'blog_post';
    ['#wsite-search-product-result-section', '.wsite-search-facet.wsite-search-facet-price', '.wsite-search-facet.wsite-search-facet-checkbox'].forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => { el.style.display = isBlog ? 'none' : ''; });
    });
  }

  function setupSearchForm() {
    if (!location.pathname.includes('/search')) return;
    const container = document.getElementById('wsite-search-form-container');
    if (!container || document.getElementById('form-busca-customizada')) return;
    const current = new URLSearchParams(location.search).get('q') || '';
    container.innerHTML = `<div id="custom-search-wrapper"><form id="form-busca-customizada" action="/apps/search" method="get"><input id="input-busca-customizada" type="text" name="q" placeholder="Buscar..." autocomplete="off" aria-label="Busca"><button type="submit" aria-label="Pesquisar"></button></form></div>`;
    const form = document.getElementById('form-busca-customizada');
    const input = document.getElementById('input-busca-customizada');
    input.value = current;
    const header = document.getElementById('wsite-search-header') || container.parentElement;
    const alert = document.createElement('div');
    alert.id = 'alerta-uma-palavra';
    alert.textContent = 'Por favor, escreva no mínimo duas palavras para realizar a pesquisa.';
    header?.appendChild(alert);
    const valid = () => palavras(input.value).length >= 2;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!valid()) { alert.style.display = 'block'; return; }
      alert.style.display = 'none';
      location.href = `/apps/search?q=${encodeURIComponent(input.value.trim())}&filter=blog_post`;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !valid()) { event.preventDefault(); alert.style.display = 'block'; }
    });
    setupAutocomplete(input, form, alert, header);
  }

  function setupAutocomplete(input, form, alert, header) {
    const container = document.createElement('div');
    container.id = 'autocomplete-container';
    header?.appendChild(container);
    let items = [], selected = -1, timer, controller;
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlight = (text, query) => text.replace(new RegExp(`(${escapeRegex(query)})`, 'ig'), '<strong>$1</strong>');
    const clear = () => { container.innerHTML = ''; items = []; selected = -1; };
    const addItem = (name, image, year, query, group) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item'; item.tabIndex = 0; item.dataset.texto = name;
      const img = document.createElement('img'); img.src = image; img.alt = ''; img.width = 32; img.height = 48; img.style = 'width:32px;height:48px;object-fit:cover;border-radius:4px;';
      const text = document.createElement('span'); text.innerHTML = `${highlight(name, query)}${year ? ` (${year})` : ''}`;
      item.append(img, text);
      item.addEventListener('mouseenter', () => { items.forEach((el) => el.classList.remove('active')); item.classList.add('active'); selected = items.indexOf(item); });
      item.addEventListener('click', () => { input.value = name; clear(); if (palavras(name).length >= 2) form.dispatchEvent(new Event('submit')); else alert.style.display = 'block'; });
      group.appendChild(item); items.push(item);
    };
    input.addEventListener('input', () => {
      clear(); const query = input.value.trim(); if (query.length < 2) return;
      clearTimeout(timer); controller?.abort(); controller = new AbortController();
      timer = setTimeout(async () => {
        try {
          const [movies, people] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=pt-BR&api_key=${TMDB_KEY}`, { signal: controller.signal }).then((r) => r.json()),
            fetch(`https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(query)}&language=pt-BR&api_key=${TMDB_KEY}`, { signal: controller.signal }).then((r) => r.json())
          ]);
          const queryWords = normalizar(query).split(/\s+/);
          const starts = (text) => { const words = normalizar(text).split(/\s+/); return queryWords.every((word, i) => words[i]?.startsWith(word)); };
          const contains = (text) => queryWords.some((word) => normalizar(text).includes(word));
          const movieRows = (movies.results || []).filter((x) => starts(x.title || '') || starts(x.original_title || ''));
          const peopleRows = (people.results || []).filter((x) => starts(x.name || ''));
          const finalMovies = (movieRows.length ? movieRows : (movies.results || []).filter((x) => contains(x.title || '') || contains(x.original_title || ''))).slice(0, 5);
          const finalPeople = (peopleRows.length ? peopleRows : (people.results || []).filter((x) => contains(x.name || ''))).slice(0, 5);
          if (!finalMovies.length && !finalPeople.length) return;
          const group = document.createElement('div');
          const heading = document.createElement('div'); heading.className = 'autocomplete-section'; heading.textContent = 'Com dúvida no nome? Veja nas nossas sugestões'; group.appendChild(heading);
          const movieNames = new Set();
          finalMovies.forEach((movie) => { movieNames.add(movie.title); if (movie.original_title && movie.original_title !== movie.title) movieNames.add(movie.original_title); movieNames.forEach((name) => addItem(name, movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : 'https://i.imgur.com/CaYnViO.png', movie.release_date?.split('-')[0] || '', query, group)); });
          finalPeople.forEach((person) => addItem(person.name, person.profile_path ? `https://image.tmdb.org/t/p/w92${person.profile_path}` : 'https://i.imgur.com/iGJvrs5.png', '', query, group));
          container.appendChild(group);
        } catch (error) { if (error.name !== 'AbortError') console.warn('Erro ao buscar sugestões:', error); }
      }, 220);
    });
    input.addEventListener('keydown', (event) => {
      if (!items.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((el, i) => el.classList.toggle('active', i === selected)); input.value = items[selected].dataset.texto; }
      if (event.key === 'Enter' && selected >= 0) { event.preventDefault(); items[selected].click(); }
    });
    document.addEventListener('click', (event) => { if (!container.contains(event.target) && event.target !== input) clear(); }, { passive: true });
  }

  async function iniciar() {
    if (!location.pathname.includes('/apps/search')) return;
    injectStyle();
    setupSearchForm();
    setupSidebar();
    const list = document.getElementById('wsite-search-list');
    const rawQuery = new URLSearchParams(location.search).get('q') || '';
    const termos = [...new Set(palavras(rawQuery))];
    if (termos.length < 2) {
      showWarning(rawQuery ? 'Escreva no mínimo duas palavras para realizar a pesquisa.' : 'Está procurando algo? Escreva no mínimo duas palavras na barra de pesquisa acima. 😉');
      return;
    }
    if (!list) return;
    const original = list.innerHTML;
    list.classList.add('ceti-search-pending');
    try {
      const resultados = (await procurar(termos)).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || String(b.post.date || '').localeCompare(String(a.post.date || '')));
      list.innerHTML = ''; list.classList.add('ceti-search-ready');
      resultados.forEach(({ post, score }) => list.appendChild(card(post, score)));
      const nav = document.getElementById('wsite-search-pagenav'); if (nav) nav.style.display = 'none';
      if (!resultados.length) { const empty = document.createElement('li'); empty.className = 'ceti-empty'; empty.textContent = `Nenhum resultado relevante encontrado para “${rawQuery}”.`; list.appendChild(empty); }
    } catch (error) {
      console.warn('Índice central indisponível; a manter resultados do Weebly.', error);
      list.innerHTML = original; list.classList.remove('ceti-search-pending');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
