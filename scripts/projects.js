/* ============================================================
   projects.js — the Projects beacon's contents.

   Two versions of the same list, switchable in dev mode:
   "Live" reads the GitHub API in the browser, "Static" uses the
   copy bundled in content.js. Live is the default but it is
   never load-bearing: anonymous GitHub requests are capped at 60
   an hour per IP, so any failure quietly falls back to the
   bundled list rather than showing an empty page.
   ============================================================ */
window.NH = window.NH || {};

NH.Projects = (function () {
  const CACHE_KEY = 'nh.projects.v1';
  const CACHE_TTL = 6 * 60 * 60 * 1000;

  let items = NH.PROJECTS_STATIC;
  let source = 'bundled list';
  let filterText = '';
  let filterLang = null;
  let loaded = null;         // in-flight or finished live fetch

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
        /* The profile repo only holds the README shown on the
           GitHub profile page — it is not a project. */
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
          archived: !!r.archived
        };
      })
      .sort(function (a, b) {
        return (b.stars - a.stars) || (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0);
      });
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
        /* 403 here is almost always the anonymous rate limit rather
           than a real failure, and it is worth saying which. */
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
        loaded = null;   // let a later attempt retry
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
    return items.filter(function (p) {
      if (filterLang && p.lang !== filterLang) return false;
      if (!q) return true;
      return (p.name + ' ' + (p.desc || '') + ' ' + (p.lang || '')).toLowerCase().indexOf(q) >= 0;
    });
  }

  const esc = NH.util.escapeHtml;

  function renderList() {
    const box = document.getElementById('proj-list');
    if (!box) return;
    const list = visible();
    if (!list.length) {
      box.innerHTML = '<p class="quiet">Nothing matches that.</p>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      const colour = NH.LANG_COLORS[p.lang] || '#8b8b8b';
      const meta = [];
      if (p.lang) {
        meta.push('<span class="dot" style="background:' + colour + '"></span>' + esc(p.lang));
      }
      if (p.updated) meta.push(esc(p.updated));
      if (p.archived) meta.push('archived');
      return '<a class="proj" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
        '<span class="proj-top"><span class="proj-name">' + esc(p.name) + '</span>' +
        (p.stars ? '<span class="proj-star">&#9733; ' + p.stars + '</span>' : '') +
        '</span>' +
        (p.desc ? '<span class="proj-desc">' + esc(p.desc) + '</span>' : '') +
        '<span class="proj-meta">' + meta.join('<span>&middot;</span>') + '</span>' +
        '</a>';
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

  function render() {
    renderLangs();
    renderList();
    const note = document.getElementById('proj-source');
    if (note) note.textContent = items.length + ' repositories \u00b7 source: ' + source;
  }

  /* Called whenever the Projects sheet opens, and whenever the
     source variant changes. */
  function refresh() {
    if (NH.cfg.get('projects') === 'static') {
      items = NH.PROJECTS_STATIC;
      source = 'bundled list';
      render();
      return;
    }
    render();                       // paint the fallback immediately
    fetchLive().then(function (r) {
      if (NH.cfg.get('projects') !== 'live') return;   // switched away mid-flight
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
