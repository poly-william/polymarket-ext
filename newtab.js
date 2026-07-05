'use strict';

const STORAGE_KEY = 'pm-newtab-shortcuts';

const DEFAULT_SHORTCUTS = [
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Calendar', url: 'https://calendar.google.com' },
  { name: 'Linear', url: 'https://linear.app' },
  { name: 'Vercel', url: 'https://vercel.com' },
  { name: 'YouTube', url: 'https://youtube.com' },
  { name: 'X', url: 'https://x.com' },
  { name: 'Polymarket', url: 'https://polymarket.com' },
];

const $ = (id) => document.getElementById(id);
const timeEl = $('time');
const dateEl = $('date');
const input = $('term-input');
const suggestEl = $('suggest');
const dockItemsEl = $('dock-items');
const overlay = $('overlay');
const rowsEl = $('modal-rows');
const dockItemTpl = $('tpl-dock-item');
const rowTpl = $('tpl-row');

/* ---- Clock: re-render aligned to the minute boundary ---- */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let clockTimer;
function renderClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  timeEl.textContent =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  dateEl.textContent = DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
  clockTimer = setTimeout(renderClock, 60250 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}
renderClock();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderClock();
});

/* ---- Shortcuts store ---- */

function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      Array.isArray(saved) &&
      saved.every((s) => s && typeof s.name === 'string' && typeof s.url === 'string')
    ) {
      return saved;
    }
  } catch (e) {
    /* corrupt storage — fall back to defaults */
  }
  return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
}

let shortcuts = loadShortcuts();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (e) {
    /* storage full or unavailable — dock still works for this tab */
  }
}

function normalizeUrl(url) {
  const v = url.trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
}

function faviconUrl(url) {
  try {
    const u = new URL(normalizeUrl(url));
    if (u.hostname) {
      // Keyed by full URL, not domain — so mail.google.com gets the Gmail
      // icon instead of collapsing to the google.com "G".
      return (
        'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=' +
        encodeURIComponent(u.origin)
      );
    }
  } catch (e) {
    /* not a URL yet */
  }
  return '';
}

/* ---- Dock ---- */

function renderDock() {
  dockItemsEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (const s of shortcuts) {
    const item = dockItemTpl.content.firstElementChild.cloneNode(true);
    item.querySelector('.dock-tip').textContent = s.name || s.url;
    const link = item.querySelector('.dock-link');
    link.href = normalizeUrl(s.url) || '#';
    link.setAttribute('aria-label', s.name || s.url);
    const img = item.querySelector('.dock-favicon');
    const glyph = item.querySelector('.dock-glyph');
    glyph.textContent = (s.name || s.url || '?').trim().charAt(0).toUpperCase();
    const src = faviconUrl(s.url);
    if (src) {
      img.src = src;
      img.onerror = () => {
        img.classList.add('hidden');
        glyph.classList.remove('hidden');
      };
    } else {
      img.classList.add('hidden');
      glyph.classList.remove('hidden');
    }
    frag.appendChild(item);
  }
  dockItemsEl.appendChild(frag);
}
renderDock();

/* ---- Settings modal ---- */

function renderRows() {
  rowsEl.textContent = '';
  const frag = document.createDocumentFragment();
  shortcuts.forEach((s, i) => {
    const row = rowTpl.content.firstElementChild.cloneNode(true);
    const img = row.querySelector('.row-favicon');
    const refreshFavicon = () => {
      const src = faviconUrl(shortcuts[i].url);
      img.classList.toggle('hidden', !src);
      if (src) img.src = src;
    };
    refreshFavicon();
    const nameInput = row.querySelector('.row-name');
    nameInput.value = s.name;
    nameInput.addEventListener('input', () => {
      shortcuts[i].name = nameInput.value;
      persist();
    });
    const urlInput = row.querySelector('.row-url');
    urlInput.value = s.url;
    urlInput.addEventListener('input', () => {
      shortcuts[i].url = urlInput.value;
      persist();
    });
    urlInput.addEventListener('change', refreshFavicon);
    row.querySelector('.row-remove').addEventListener('click', () => {
      shortcuts.splice(i, 1);
      persist();
      renderRows();
    });
    frag.appendChild(row);
  });
  rowsEl.appendChild(frag);
}

function openSettings() {
  renderRows();
  overlay.classList.remove('hidden');
}

function closeSettings() {
  overlay.classList.add('hidden');
  renderDock();
  input.focus();
}

$('settings-btn').addEventListener('click', openSettings);
$('modal-close').addEventListener('click', closeSettings);
$('modal-done').addEventListener('click', closeSettings);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeSettings();
});
$('add-shortcut').addEventListener('click', () => {
  shortcuts.push({ name: 'New site', url: 'https://' });
  persist();
  renderRows();
  const lastUrl = rowsEl.querySelector('.row:last-child .row-url');
  if (lastUrl) lastUrl.focus();
});

/* ---- Terminal ---- */

const encode = encodeURIComponent;

// Optional repo aliases from repos.js (see repos.example.js)
const GH_REPOS = Array.isArray(window.GH_REPOS) ? window.GH_REPOS : [];

function ghRepoMatches(text) {
  const t = text.toLowerCase();
  return GH_REPOS.filter(
    (r) => r.alias.includes(t) || r.slug.toLowerCase().includes(t)
  );
}

function googleAccount(args) {
  return /^\d+$/.test(args) ? args : '0';
}

const commands = {
  gh: {
    hint: '[repo|query]',
    description: 'github',
    run: (q) => {
      const repo = GH_REPOS.find((r) => r.alias === q.toLowerCase());
      if (repo) return go('https://github.com/' + repo.slug);
      go(q ? 'https://github.com/search?q=' + encode(q) : 'https://github.com');
    },
  },
  mail: {
    hint: '[n]',
    description: 'gmail',
    run: (q) => go('https://mail.google.com/mail/u/' + googleAccount(q) + '/'),
  },
  cal: {
    hint: '[n]',
    description: 'gcal',
    run: (q) => go('https://calendar.google.com/calendar/u/' + googleAccount(q) + '/r'),
  },
  yt: {
    hint: '[query]',
    description: 'youtube',
    run: (q) =>
      go(q ? 'https://www.youtube.com/results?search_query=' + encode(q) : 'https://youtube.com'),
  },
  wiki: {
    hint: '[query]',
    description: 'wikipedia',
    run: (q) =>
      go(
        q
          ? 'https://en.wikipedia.org/w/index.php?search=' + encode(q)
          : 'https://en.wikipedia.org'
      ),
  },
  pm: {
    hint: '[query]',
    description: 'polymarket',
    run: (q) =>
      go(q ? 'https://polymarket.com/predictions?q=' + encode(q) : 'https://polymarket.com'),
  },
};

// Extension point: window.newtab.registerCommand('name', { description, run(args) })
window.newtab = {
  registerCommand(name, cmd) {
    if (typeof name === 'string' && cmd && typeof cmd.run === 'function') {
      commands[name.toLowerCase()] = cmd;
    }
  },
};

function go(url) {
  location.assign(url);
}

function looksLikeUrl(v) {
  if (/\s/.test(v)) return false;
  if (/^https?:\/\/\S+$/i.test(v)) return true;
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v);
}

/* ---- Google autosuggest (async, cached per query) ---- */

let gsCache = { q: null, items: [] };
let gsTimer;
let gsAbort;

function scheduleGoogleSuggest(q) {
  clearTimeout(gsTimer);
  if (!q || gsCache.q === q || looksLikeUrl(q)) return;
  if (commands[q.split(/\s+/)[0].toLowerCase()]) return;
  gsTimer = setTimeout(async () => {
    if (gsAbort) gsAbort.abort();
    gsAbort = new AbortController();
    try {
      const res = await fetch(
        'https://suggestqueries.google.com/complete/search?client=chrome&q=' + encode(q),
        { signal: gsAbort.signal }
      );
      const data = await res.json();
      gsCache = {
        q,
        items: (data[1] || []).filter((s) => typeof s === 'string' && s !== q).slice(0, 5),
      };
      // Refresh only if the query is still current and the user isn't
      // arrow-keying through the list
      if (document.activeElement === input && input.value.trim() === q && selIdx === 0) {
        renderSuggest();
      }
    } catch (e) {
      /* offline or file:// preview — plain search still works */
    }
  }, 120);
}

/* ---- Suggestions ---- */

let suggestions = [];
let selIdx = 0;

function buildSuggestions(raw) {
  const q = raw.trim();
  if (!q) return [];
  const list = [];
  const ql = q.toLowerCase();
  const first = q.split(/\s+/)[0].toLowerCase();
  const rest = q.slice(first.length).trim();
  const isUrl = looksLikeUrl(q);
  const exact = commands[first];

  const searchItem = {
    icon: '/',
    label: 'search "' + q + '"',
    detail: 'google',
    run: () => go('https://www.google.com/search?q=' + encode(q)),
  };

  if (isUrl) {
    list.push({
      icon: '↗',
      iconClass: 'url',
      label: 'open ' + q.replace(/^https?:\/\//i, ''),
      detail: 'url',
      run: () => go(normalizeUrl(q)),
    });
  }
  if (exact) {
    list.push({
      icon: '❯',
      iconClass: 'cmd',
      label: q,
      labelDim: !rest && exact.hint ? exact.hint : '',
      detail: exact.description || '',
      run: () => exact.run(rest),
    });
  }
  if (first === 'gh') {
    // Skip an exact alias match — the command row above already opens it
    const matches = ghRepoMatches(rest).filter((r) => r.alias !== rest.toLowerCase());
    for (const r of matches.slice(0, 6)) {
      list.push({
        icon: '❯',
        iconClass: 'cmd',
        label: 'gh ' + r.alias,
        detail: r.slug,
        complete: 'gh ' + r.alias,
        run: () => go('https://github.com/' + r.slug),
      });
    }
  }
  if (!isUrl && !exact) {
    list.push(searchItem);
    if (gsCache.q === q) {
      for (const s of gsCache.items) {
        list.push({
          icon: '/',
          label: s,
          run: () => go('https://www.google.com/search?q=' + encode(s)),
        });
      }
    }
  }

  // Complete command names while the first word is still being typed
  if (!/\s/.test(q) && !exact) {
    for (const name of Object.keys(commands)) {
      if (name.startsWith(first) && name !== first) {
        const c = commands[name];
        list.push({
          icon: '❯',
          iconClass: 'cmd',
          label: name,
          labelDim: c.hint || '',
          detail: c.description || '',
          complete: name + ' ',
          run: () => c.run(''),
        });
      }
    }
  }

  for (const s of shortcuts) {
    const name = (s.name || '').toLowerCase();
    const url = (s.url || '').toLowerCase();
    if (name.includes(ql) || url.replace(/^https?:\/\//, '').startsWith(ql)) {
      list.push({
        favicon: faviconUrl(s.url),
        icon: '↗',
        iconClass: 'url',
        label: s.name || s.url,
        detail: s.url.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
        complete: normalizeUrl(s.url),
        run: () => go(normalizeUrl(s.url)),
      });
    }
  }

  if (isUrl || exact) list.push(searchItem);
  return list.slice(0, 8);
}

function setSel(i) {
  selIdx = i;
  const rows = suggestEl.children;
  for (let j = 0; j < rows.length; j++) rows[j].classList.toggle('sel', j === selIdx);
}

function closeSuggest() {
  suggestions = [];
  suggestEl.textContent = '';
  suggestEl.classList.add('hidden');
  input.setAttribute('aria-expanded', 'false');
}

function runSuggestion(s) {
  input.value = '';
  closeSuggest();
  s.run();
}

function renderSuggest() {
  suggestions = buildSuggestions(input.value);
  selIdx = 0;
  scheduleGoogleSuggest(input.value.trim());
  suggestEl.textContent = '';
  if (!suggestions.length) {
    closeSuggest();
    return;
  }
  suggestEl.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  suggestions.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = i === selIdx ? 's-row sel' : 's-row';
    row.setAttribute('role', 'option');
    const icon = document.createElement('span');
    icon.className = 's-icon' + (s.iconClass ? ' ' + s.iconClass : '');
    if (s.favicon) {
      const img = document.createElement('img');
      img.src = s.favicon;
      img.alt = '';
      icon.appendChild(img);
    } else {
      icon.textContent = s.icon;
    }
    const label = document.createElement('span');
    label.className = 's-label';
    label.textContent = s.label;
    if (s.labelDim) {
      const dim = document.createElement('span');
      dim.className = 's-dim';
      dim.textContent = ' ' + s.labelDim;
      label.appendChild(dim);
    }
    const detail = document.createElement('span');
    detail.className = 's-detail';
    detail.textContent = s.detail || '';
    row.append(icon, label, detail);
    row.addEventListener('mousedown', (e) => e.preventDefault()); // don't blur the input
    row.addEventListener('click', () => runSuggestion(s));
    row.addEventListener('mousemove', () => {
      if (selIdx !== i) setSel(i);
    });
    suggestEl.appendChild(row);
  });
}

input.addEventListener('input', renderSuggest);
input.addEventListener('focus', renderSuggest);
input.addEventListener('blur', closeSuggest);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    input.value = '';
    closeSuggest();
    return;
  }
  if (!suggestions.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSel((selIdx + 1) % suggestions.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSel((selIdx - 1 + suggestions.length) % suggestions.length);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const s = suggestions[selIdx];
    if (s.complete) {
      input.value = s.complete;
      renderSuggest();
    } else {
      setSel((selIdx + 1) % suggestions.length);
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    runSuggestion(suggestions[selIdx]);
  }
});

/* Clicking anywhere on the background drops you into the prompt */
document.addEventListener('mousedown', (e) => {
  if (!overlay.classList.contains('hidden')) return;
  if (e.target.closest('a, button, input, .dock, .modal, .s-row')) return;
  e.preventDefault(); // keep focus from landing on the body
  input.focus();
});

/* Typing anywhere drops you into the prompt, terminal-style */
window.addEventListener('keydown', (e) => {
  if (!overlay.classList.contains('hidden')) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
  const isTyping = e.key.length === 1 || e.key === 'Backspace';
  if (isTyping) input.focus();
});

/* The omnibox keeps initial focus (Chrome enforces this); Tab or any click
   drops into the prompt. Pre-focus so the caret is ready when it does. */
input.focus({ preventScroll: true });
