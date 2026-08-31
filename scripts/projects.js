/* projects.js — the content of the Projects beacon.

   There are two versions of the same list. Dev mode selects one of
   them. Live reads the GitHub API in the browser. Static uses the
   copy in content.js.

   Live is the default, but the page never depends on it. GitHub
   permits only 60 requests an hour for each address without a key.
   After a failure the page shows the copy from content.js. It does
   not show an empty list. */
window.NH = window.NH || {};

NH.Projects = (function () {
  const CACHE_KEY = 'nh.projects.v1';
  const CACHE_TTL = 6 * 60 * 60 * 1000;

  const SORTS = [
    { id: 'stars', label: 'Stars',
      cmp: function (a, b) { return (b.stars - a.stars) || byDate(a, b); } },
    { id: 'recent', label: 'Recent', cmp: byDate },
    { id: 'name', label: 'A–Z',
      cmp: function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; } }
  ];

  let items = NH.PROJECTS_STATIC;
  let source = 'bundled list';
  let filterText = '';
  let filterLang = null;
  let sortId = 'stars';
  let loaded = null;         // in-flight or finished live fetch

  function byDate(a, b) {
    return a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0;
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw && Date.now() - raw.t < CACHE_TTL && Array.isArray(raw.items) && raw.items.length) {
        return raw;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function normalise(repos) {
    return repos
      .filter(function (r) {
        /* The profile repository holds only the README for the
           GitHub profile page. It is not a project. */
        return !r.fork && r.name !== NH.GITHUB_USER;
      })
      .map(function (r) {
        return {
          name: r.name,
          desc: r.description || null,
          lang: r.language || null,
          stars: r.stargazers_count || 0,
          url: r.html_url,
          updated: (r.pushed_at || r.updated_at || '').slice(0, 10),
          archived: !!r.archived,
          topics: Array.isArray(r.topics) ? r.topics.slice(0, 5) : []
        };
      })
      .sort(function (a, b) { return (b.stars - a.stars) || byDate(a, b); });
  }

  function fetchLive() {
    if (loaded) return loaded;
    const cached = readCache();
    if (cached) {
      loaded = Promise.resolve({ items: cached.items, source: 'GitHub API (cached)' });
      return loaded;
    }
    const url = 'https://api.github.com/users/' + NH.GITHUB_USER +
                '/repos?per_page=100&sort=updated';
    loaded = fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        /* A 403 is almost always the request limit, and not a
           true failure. Tell the person which one it is. */
        if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit');
        if (!res.ok) throw new Error('GitHub responded ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!Array.isArray(json) || !json.length) throw new Error('empty response');
        const list = normalise(json);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: list })); }
        catch (e) { /* private mode */ }
        return { items: list, source: 'GitHub API, live' };
      })
      .catch(function (err) {
        loaded = null;   // a later call can try again
        const why = /rate limit/.test(err.message) ? err.message : 'GitHub unreachable';
        return { items: NH.PROJECTS_STATIC, source: 'bundled list, ' + why };
      });
    return loaded;
  }

  function languages() {
    const counts = {};
    items.forEach(function (p) { if (p.lang) counts[p.lang] = (counts[p.lang] || 0) + 1; });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, 4);
  }

  function visible() {
    const q = filterText.trim().toLowerCase();
    const cmp = (SORTS.filter(function (s) { return s.id === sortId; })[0] || SORTS[0]).cmp;
    return items.filter(function (p) {
      if (filterLang && p.lang !== filterLang) return false;
      if (!q) return true;
      return (p.name + ' ' + (p.desc || '') + ' ' + (p.lang || '')).toLowerCase().indexOf(q) >= 0;
    }).slice().sort(cmp);
  }

  const esc = NH.util.escapeHtml;
  const safeUrl = NH.util.safeUrl;

  /* Read the colour with hasOwnProperty. A repository with the
     language "toString" can otherwise find a function on
     Object.prototype. That text then goes into the style
     attribute. */
  function langColour(lang) {
    return (lang && Object.prototype.hasOwnProperty.call(NH.LANG_COLORS, lang))
      ? NH.LANG_COLORS[lang] : '#8b8b8b';
  }

  function renderList() {
    const box = document.getElementById('proj-list');
    if (!box) return;
    const list = visible();
    if (!list.length) {
      box.innerHTML = '<p class="quiet">Nothing matches that.</p>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      const colour = langColour(p.lang);
      const meta = [];
      if (p.lang) {
        meta.push('<span class="dot" style="background:' + colour + '"></span>' + esc(p.lang));
      }
      if (p.updated) meta.push(esc(p.updated));
      if (p.archived) meta.push('archived');
      const href = safeUrl(p.url);
      /* A row with no address that the browser can open becomes a
         span, so that a click does nothing. */
      const open = href ? '<a class="proj" href="' + esc(href) + '" target="_blank" rel="noopener">'
                        : '<span class="proj">';
      const close = href ? '</a>' : '</span>';
      return open +
        '<span class="proj-top"><span class="proj-name">' + esc(p.name) + '</span>' +
        (p.stars ? '<span class="proj-star">&#9733; ' + p.stars + '</span>' : '') +
        '</span>' +
        (p.desc ? '<span class="proj-desc">' + esc(p.desc) + '</span>' : '') +
        '<span class="proj-meta">' + meta.join('<span>&middot;</span>') + '</span>' +
        (p.topics && p.topics.length
          ? '<span class="proj-topics">' + p.topics.map(function (t) {
              return '<span>' + esc(t) + '</span>';
            }).join('') + '</span>'
          : '') +
        close;
    }).join('');
  }

  function renderLangs() {
    const box = document.getElementById('proj-langs');
    if (!box) return;
    const langs = languages();
    box.innerHTML = ['<button type="button" data-lang="">All</button>']
      .concat(langs.map(function (l) {
        return '<button type="button" data-lang="' + esc(l) + '">' + esc(l) + '</button>';
      })).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.lang || null) === filterLang));
      b.addEventListener('click', function () {
        filterLang = b.dataset.lang || null;
        renderLangs();
        renderList();
      });
    });
  }

  /* Make the buttons one time. After that, only the pressed state
     changes. If you make the buttons again for each sort, you also
     remove their listeners and the focus. */
  function buildSorts() {
    const box = document.getElementById('proj-sort');
    if (!box || box.childElementCount) return;
    SORTS.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.sort = s.id;
      b.textContent = s.label;
      b.addEventListener('click', function () {
        sortId = s.id;
        syncSorts();
        renderList();
      });
      box.appendChild(b);
    });
  }

  function syncSorts() {
    const box = document.getElementById('proj-sort');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.sort === sortId));
    });
  }

  function render() {
    buildSorts();
    syncSorts();
    renderLangs();
    renderList();
    const note = document.getElementById('proj-source');
    if (note) note.textContent = items.length + ' repositories \u00b7 source: ' + source;
  }

  /* Called whenever the Projects sheet opens, and whenever the
     source variant changes. */
  function refresh() {
    if (NH.cfg.v.projects === 'static') {
      items = NH.PROJECTS_STATIC;
      source = 'bundled list';
      render();
      return;
    }
    render();                       // paint the fallback immediately
    fetchLive().then(function (r) {
      if (NH.cfg.v.projects !== 'live') return;   // switched away mid-flight
      items = r.items;
      source = r.source;
      render();
    });
  }

  function init() {
    const search = document.getElementById('proj-search');
    if (search) {
      search.addEventListener('input', function () {
        filterText = search.value;
        renderList();
      });
    }
    NH.on('config', function (key) {
      if (key === 'projects' || key === '*') { filterLang = null; refresh(); }
    });
  }

  return { init: init, refresh: refresh };
})();
