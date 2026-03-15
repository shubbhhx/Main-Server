// ═══════════════════════════════════════════════════════════
//  CINEMATIC — Movies + TV Script
//  TMDB API + Vidking embed + per-profile resume tracking
// ═══════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── IN-MEMORY CACHE ──────────────────────────────────────────
const _cache = {};

async function tmdb(path, params = {}) {
  let url;

  // ── MOVIE ROUTES ─────────────────────────────────────────
  if (path.startsWith('/trending/movie')) {
    url = '/api/tmdb/trending';
  } else if (path === '/movie/popular') {
    url = '/api/tmdb/popular';
  } else if (path === '/movie/top_rated') {
    url = '/api/tmdb/top-rated';
  } else if (path === '/movie/upcoming') {
    url = '/api/tmdb/upcoming';
  } else if (path === '/search/movie') {
    const q = encodeURIComponent(params.query || '');
    const page = params.page || 1;
    url = `/api/tmdb/search?q=${q}&page=${page}`;
  } else if (path === '/genre/movie/list') {
    url = '/api/tmdb/genres/movies';
  } else if (path === '/discover/movie') {
    url = `/api/tmdb/discover/movie?` + new URLSearchParams(params).toString();
  } else if (path.startsWith('/movie/') && path.endsWith('/recommendations')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/movie/${id}/recommendations`;
  } else if (path.startsWith('/movie/')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/movie/${id}`;

  // ── TV ROUTES ─────────────────────────────────────────────
  } else if (path.startsWith('/trending/tv')) {
    url = '/api/tmdb/trending/tv';
  } else if (path === '/tv/popular') {
    url = '/api/tmdb/popular/tv';
  } else if (path === '/tv/top_rated') {
    url = '/api/tmdb/top-rated/tv';
  } else if (path === '/tv/airing_today') {
    url = '/api/tmdb/airing/tv';
  } else if (path === '/tv/on_the_air') {
    url = '/api/tmdb/on-air/tv';
  } else if (path === '/genre/tv/list') {
    url = '/api/tmdb/genres/tv';
  } else if (path === '/discover/tv') {
    url = `/api/tmdb/discover/tv?` + new URLSearchParams(params).toString();
  } else if (path === '/search/tv') {
    const q = encodeURIComponent(params.query || '');
    const page = params.page || 1;
    url = `/api/tmdb/search/tv?q=${q}&page=${page}`;
  } else if (path.match(/^\/tv\/\d+\/season\/\d+$/)) {
    const parts = path.split('/');
    url = `/api/tmdb/tv/${parts[2]}/season/${parts[4]}`;
  } else if (path.startsWith('/tv/') && path.endsWith('/recommendations')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/tv/${id}/recommendations`;
  } else if (path.startsWith('/tv/')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/tv/${id}`;
  } else {
    throw new Error(`Unknown TMDB path: ${path}`);
  }

  if (_cache[url] && Date.now() - _cache[url].ts < CACHE_TTL) {
    return _cache[url].data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  _cache[url] = { data, ts: Date.now() };
  return data;
}

// ── IMAGE HELPERS ────────────────────────────────────────────
function posterUrl(path, size = 'w342') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}
function backdropUrl(path, size = 'w1280') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// ── RESUME WATCHING (Per-Profile, Movie + TV) ────────────────────
// Storage key: toxibhflix_resume_{profileId}_{tmdbId}
// Data: { profileId, tmdbId, mediaType, title, poster, season, episode,
//         timestamp, progress, savedAt }

function _getActiveProfile() {
  return JSON.parse(localStorage.getItem('toxibhflix_profile') || 'null');
}

function _resumeKey(tmdbId) {
  const p = _getActiveProfile();
  const pid = p ? (p.name || 'default') : 'default';
  return `toxibhflix_resume_${pid}_${tmdbId}`;
}

function saveProgress(tmdbId, data) {
  // data: { mediaType, timestamp, season?, episode?, title, poster, progress }
  const key = _resumeKey(tmdbId);
  const existing = JSON.parse(localStorage.getItem(key) || 'null') || {};
  const entry = Object.assign({}, existing, {
    tmdbId: String(tmdbId),
    mediaType: data.mediaType || 'movie',
    title: data.title || existing.title || '',
    poster: data.poster || existing.poster || null,
    season: data.season || null,
    episode: data.episode || null,
    timestamp: Math.floor(data.timestamp || 0),
    progress: data.progress || 0,
    savedAt: Date.now()
  });
  localStorage.setItem(key, JSON.stringify(entry));
}

function getProgress(tmdbId) {
  const key = _resumeKey(tmdbId);
  return JSON.parse(localStorage.getItem(key) || 'null');
}

function getContinueWatching() {
  const p = _getActiveProfile();
  const pid = p ? (p.name || 'default') : 'default';
  const prefix = `toxibhflix_resume_${pid}_`;
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      try {
        const val = JSON.parse(localStorage.getItem(k));
        if (val && val.timestamp > 0) items.push(val);
      } catch (e) {}
    }
  }
  return items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// Legacy helpers (unchanged for movie watch page compatibility)
const PROG_KEY = 'cinematic_progress';

function _legacySaveProgress(movieId, seconds) {
  const all = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  all[movieId] = { seconds: Math.floor(seconds), ts: Date.now() };
  localStorage.setItem(PROG_KEY, JSON.stringify(all));
}

function _legacyGetProgress(movieId) {
  const all = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  return all[movieId] || null;
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

// ── MESSAGE LISTENER (Vidking progress events) ───────────────
window.addEventListener('message', function (event) {
  if (!event.data || typeof event.data !== 'object') return;
  const { type, currentTime, movieId } = event.data;

  if (type === 'timeupdate' && currentTime > 5) {
    const id = movieId || window._currentMovieId || window._currentShowId;
    if (!id) return;

    if (window._currentShowId) {
      // TV show — save with season/episode context
      saveProgress(id, {
        mediaType: 'tv',
        timestamp: currentTime,
        season: window._currentSeason,
        episode: window._currentEpisode,
        title: window._currentShowTitle || '',
        poster: window._currentShowPoster || null,
        progress: 0
      });
    } else {
      // Movie — save legacy + new format
      _legacySaveProgress(id, currentTime);
      saveProgress(id, {
        mediaType: 'movie',
        timestamp: currentTime,
        title: window._currentMovieTitle || '',
        poster: window._currentMoviePoster || null,
        progress: 0
      });
    }
  }
});

// ── POSTER CARD BUILDER ──────────────────────────────────────
function buildPosterCard(movie) {
  const card = document.createElement('div');
  card.className = 'poster-card';
  card.dataset.id = movie.id;

  const imgSrc = posterUrl(movie.poster_path);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const year = (movie.release_date || '').slice(0, 4) || '—';

  card.innerHTML = `
    <div class="poster-play-btn">▶</div>
    ${imgSrc
      ? `<img class="poster-img" src="${imgSrc}" alt="${movie.title}" loading="lazy">`
      : `<div class="poster-no-img">🎬</div>`
    }
    <div class="poster-overlay">
      <div class="poster-title">${movie.title}</div>
      <div class="poster-meta">
        <span class="poster-rating">★ ${rating}</span>
        <span>${year}</span>
      </div>
    </div>`;

  card.addEventListener('click', () => {
    window.location.href = `/movies/watch.html?id=${movie.id}`;
  });

  return card;
}

// ── RENDER ROW ───────────────────────────────────────────────
function renderRow(movies, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!movies || movies.length === 0) {
    container.innerHTML = '<p style="color:var(--nf-muted);font-family: Share Tech Mono,monospace;font-size:0.7rem;">No results found.</p>';
    return;
  }
  movies.forEach(m => container.appendChild(buildPosterCard(m)));
}

// ── SKELETONS ────────────────────────────────────────────────
function showSkeletons(containerId, count = 8) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = Array.from({ length: count })
    .map(() => '<div class="loading-skeleton"></div>')
    .join('');
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ══════════════════════════════════════════════════════════════
//  INDEX PAGE (movies/index.html)
// ══════════════════════════════════════════════════════════════
async function initIndexPage() {
  // Scroll header behaviour
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () =>
      header.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  }

  // Init genres
  initGenres('movie');

  // Load all rows
  const rows = [
    { id: 'row-trending', path: '/trending/movie/week' },
    { id: 'row-popular', path: '/movie/popular' },
    { id: 'row-toprated', path: '/movie/top_rated' },
    { id: 'row-upcoming', path: '/movie/upcoming' },
  ];

  rows.forEach(r => showSkeletons(r.id));

  await Promise.all(rows.map(async ({ id, path }) => {
    try {
      const data = await tmdb(path);
      renderRow(data.results, id);
    } catch (e) {
      const c = document.getElementById(id);
      if (c) c.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Server error. Try again later.</p>';
    }
  }));

  // Hero banner with featured trending movie
  try {
    const trending = await tmdb('/trending/movie/week');
    const featured = trending.results.find(m => m.backdrop_path) || trending.results[0];
    if (featured) setHero(featured);
  } catch (e) { }

  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(this.value.trim()), 400);
    });
  }
}

function setHero(movie) {
  const backdrop = document.getElementById('hero-backdrop');
  const htitle = document.getElementById('hero-title');
  const hmeta = document.getElementById('hero-meta');
  const hdesc = document.getElementById('hero-desc');
  const hwatch = document.getElementById('hero-watch');

  if (backdrop && movie.backdrop_path) {
    backdrop.style.backgroundImage = `url(${backdropUrl(movie.backdrop_path)})`;
  }
  if (htitle) htitle.textContent = movie.title;
  if (hmeta) {
    const rating = movie.vote_average?.toFixed(1) || 'N/A';
    const year = (movie.release_date || '').slice(0, 4);
    hmeta.innerHTML = `<span class="hero-rating">★ ${rating}</span><span>${year}</span><span>TMDB Featured</span>`;
  }
  if (hdesc) hdesc.textContent = movie.overview;
  if (hwatch) hwatch.href = `/movies/watch.html?id=${movie.id}`;
}

async function runSearch(query) {
  const section = document.getElementById('search-section');
  const browse = document.getElementById('browse-section');
  const label = document.getElementById('search-label');
  const grid = document.getElementById('search-grid');

  if (!query) {
    if (section) section.classList.remove('visible');
    if (browse) browse.style.display = '';
    return;
  }

  if (section) section.classList.add('visible');
  if (browse) browse.style.display = 'none';
  if (label) label.innerHTML = `Results for <span>"${query}"</span>`;
  if (grid) grid.innerHTML = '<div class="spinner"></div>';

  try {
    const data = await tmdb('/search/movie', { query, page: 1 });
    if (!grid) return;
    grid.innerHTML = '';
    if (!data.results.length) {
      grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No movies found.</p>';
      return;
    }
    data.results.forEach(m => grid.appendChild(buildPosterCard(m)));
  } catch (e) {
    if (grid) grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Server error. Try again later.</p>';
  }
}

// ══════════════════════════════════════════════════════════════
//  WATCH PAGE (movies/watch.html)
// ══════════════════════════════════════════════════════════════
async function initWatchPage() {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('id');

  if (!movieId) {
    document.title = 'Movie Not Found — Cinematic';
    return;
  }

  window._currentMovieId = movieId;

  // Scroll header
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () =>
      header.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  }

  try {
    const movie = await tmdb(`/movie/${movieId}`, { append_to_response: 'credits' });
    populateWatchPage(movie);

    // Load recommendations
    const recs = await tmdb(`/movie/${movieId}/recommendations`);
    renderRow(recs.results.slice(0, 12), 'row-recs');
  } catch (e) {
    showToast('⚠ Server error. Please try again.');
  }

  // Resume check — supports both old (cinematic_progress) and new (per-profile) format
  const saved = getProgress(movieId);
  const savedSeconds = saved ? (saved.timestamp || saved.seconds || 0) : 0;
  if (savedSeconds > 10) {
    const banner = document.getElementById('resume-banner');
    const label = document.getElementById('resume-time');
    if (banner && label) {
      label.textContent = formatTime(savedSeconds);
      banner.classList.add('visible');
    }
  }

  // Resume button
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    loadPlayer(movieId, savedSeconds);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });

  // Watch button (fresh start)
  document.getElementById('watch-btn')?.addEventListener('click', () => {
    loadPlayer(movieId, 0);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });
}

function populateWatchPage(movie) {
  document.title = `${movie.title} — Cinematic`;

  // Store globals for resume tracking
  window._currentMovieTitle = movie.title || '';
  window._currentMoviePoster = movie.poster_path ? posterUrl(movie.poster_path, 'w342') : null;

  // Backdrop
  const bd = document.getElementById('watch-backdrop');
  if (bd && movie.backdrop_path) {
    bd.style.backgroundImage = `url(${backdropUrl(movie.backdrop_path, 'original')})`;
  }

  // Poster
  const posterEl = document.getElementById('watch-poster');
  if (posterEl) {
    const src = posterUrl(movie.poster_path, 'w342');
    if (src) { posterEl.src = src; posterEl.alt = movie.title; }
    else posterEl.style.display = 'none';
  }

  setText('watch-title', movie.title);
  setText('watch-tagline', movie.tagline || '');
  setText('watch-overview', movie.overview);
  setText('watch-rating', movie.vote_average ? `★ ${movie.vote_average.toFixed(1)} / 10` : '');
  setText('watch-year', (movie.release_date || '').slice(0, 4));
  setText('watch-runtime', movie.runtime ? `${movie.runtime} min` : '');

  // Genres
  const genreEl = document.getElementById('watch-genres');
  if (genreEl && movie.genres) {
    genreEl.innerHTML = movie.genres
      .map(g => `<span class="genre-tag">${g.name}</span>`)
      .join('');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function loadPlayer(movieId, startSeconds = 0) {
  const container = document.getElementById('player-container');
  if (!container) return;

  // ── Load directly via Vidking (Iframe avoids CORS) ──
  let src = `https://www.vidking.net/embed/movie/${movieId}?color=e50914&autoPlay=true`;
  if (startSeconds > 5) src += `&progress=${Math.floor(startSeconds)}`;

  container.innerHTML = `
    <iframe
      src="${src}"
      width="100%"
      height="580"
      frameborder="0"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer-when-downgrade"
      title="Movie Player">
    </iframe>`;

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });

  showToast(startSeconds > 5
    ? `▶ Resuming from ${formatTime(startSeconds)}`
    : '▶ Starting playback');
}

// ═══════════════════════════════════════════════════════════
//  CONTINUE WATCHING ROW
// ═══════════════════════════════════════════════════════════
function buildContinueCard(item) {
  const card = document.createElement('div');
  card.className = 'poster-card continue-card';

  const imgSrc = item.poster || null;
  const title = item.title || 'Unknown';
  const pct = item.progress ? Math.min(100, Math.round(item.progress * 100)) : 0;
  const label = item.mediaType === 'tv'
    ? `S${item.season || 1}E${item.episode || 1}`
    : formatTime(item.timestamp || 0);

  card.innerHTML = `
    <div class="poster-play-btn">▶</div>
    ${imgSrc
      ? `<img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy">`
      : `<div class="poster-no-img">${item.mediaType === 'tv' ? '📺' : '🎬'}</div>`
    }
    <div class="poster-overlay">
      <div class="poster-title">${title}</div>
      <div class="poster-meta">
        <span style="color:var(--nf-cyan);font-size:0.58rem;">${label}</span>
      </div>
    </div>
    <div class="continue-progress-bar">
      <div class="continue-progress-fill" style="width:${pct}%"></div>
    </div>`;

  card.addEventListener('click', () => {
    if (item.mediaType === 'tv') {
      window.location.href = `/movies/watch-tv?id=${item.tmdbId}&s=${item.season || 1}&e=${item.episode || 1}&resume=1`;
    } else {
      window.location.href = `/movies/watch.html?id=${item.tmdbId}`;
    }
  });

  return card;
}

function loadContinueWatching(containerId) {
  const items = getContinueWatching();
  const section = document.getElementById('row-continue-section');
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';
  container.innerHTML = '';
  items.slice(0, 20).forEach(item => container.appendChild(buildContinueCard(item)));
}

// ═══════════════════════════════════════════════════════════
//  TV SHOWS BROWSE PAGE (movies/tvshows.html)
// ═══════════════════════════════════════════════════════════

// Build a TV show poster card (same structure as movie card, links to watch-tv)
function buildTVCard(show) {
  const card = document.createElement('div');
  card.className = 'poster-card';
  card.dataset.id = show.id;

  const imgSrc = posterUrl(show.poster_path);
  const rating = show.vote_average ? show.vote_average.toFixed(1) : 'N/A';
  const year = (show.first_air_date || '').slice(0, 4) || '—';
  const title = show.name || show.title || 'Unknown';

  card.innerHTML = `
    <div class="poster-play-btn">▶</div>
    ${imgSrc
      ? `<img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy">`
      : `<div class="poster-no-img">📺</div>`
    }
    <div class="poster-overlay">
      <div class="poster-title">${title}</div>
      <div class="poster-meta">
        <span class="poster-rating">★ ${rating}</span>
        <span>${year}</span>
      </div>
    </div>`;

  card.addEventListener('click', () => {
    window.location.href = `/movies/watch-tv?id=${show.id}`;
  });

  return card;
}

function renderTVRow(shows, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!shows || shows.length === 0) {
    container.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No results found.</p>';
    return;
  }
  shows.forEach(s => container.appendChild(buildTVCard(s)));
}

function setTVHero(show) {
  const backdrop  = document.getElementById('hero-backdrop');
  const htitle    = document.getElementById('hero-title');
  const hmeta     = document.getElementById('hero-meta');
  const hdesc     = document.getElementById('hero-desc');
  const hwatch    = document.getElementById('hero-watch');
  const title = show.name || show.title || '';

  if (backdrop && show.backdrop_path) {
    backdrop.style.backgroundImage = `url(${backdropUrl(show.backdrop_path)})`;
  }
  if (htitle) htitle.textContent = title;
  if (hmeta) {
    const rating = show.vote_average?.toFixed(1) || 'N/A';
    const year   = (show.first_air_date || '').slice(0, 4);
    hmeta.innerHTML = `<span class="hero-rating">★ ${rating}</span><span>${year}</span><span>TMDB Featured</span>`;
  }
  if (hdesc) hdesc.textContent = show.overview;
  if (hwatch) hwatch.href = `/movies/watch-tv?id=${show.id}`;
}

async function initTVPage() {
  // Scroll header behaviour
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () =>
      header.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  }

  // Continue watching row
  loadContinueWatching('row-continue');

  initGenres('tv');

  const rows = [
    { id: 'row-trending', path: '/trending/tv/week' },
    { id: 'row-popular',  path: '/tv/popular' },
    { id: 'row-toprated', path: '/tv/top_rated' },
    { id: 'row-airing',   path: '/tv/airing_today' },
    { id: 'row-onair',    path: '/tv/on_the_air' },
  ];

  rows.forEach(r => showSkeletons(r.id));

  await Promise.all(rows.map(async ({ id, path }) => {
    try {
      const data = await tmdb(path);
      renderTVRow(data.results, id);
    } catch (e) {
      const c = document.getElementById(id);
      if (c) c.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Server error. Try again later.</p>';
    }
  }));

  // Hero banner from trending TV
  try {
    const trending = await tmdb('/trending/tv/week');
    const featured = trending.results.find(s => s.backdrop_path) || trending.results[0];
    if (featured) setTVHero(featured);
  } catch (e) {}

  // TV Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runTVSearch(this.value.trim()), 400);
    });
  }
}

async function runTVSearch(query) {
  const section = document.getElementById('search-section');
  const browse  = document.getElementById('browse-section');
  const label   = document.getElementById('search-label');
  const grid    = document.getElementById('search-grid');

  if (!query) {
    if (section) section.classList.remove('visible');
    if (browse)  browse.style.display = '';
    return;
  }

  if (section) section.classList.add('visible');
  if (browse)  browse.style.display = 'none';
  if (label)   label.innerHTML = `Results for <span>"${query}"</span>`;
  if (grid)    grid.innerHTML = '<div class="spinner"></div>';

  try {
    const data = await tmdb('/search/tv', { query, page: 1 });
    if (!grid) return;
    grid.innerHTML = '';
    if (!data.results.length) {
      grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No TV shows found.</p>';
      return;
    }
    data.results.forEach(s => grid.appendChild(buildTVCard(s)));
  } catch (e) {
    if (grid) grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Server error. Try again later.</p>';
  }
}

// ═══════════════════════════════════════════════════════════
//  TV WATCH PAGE (movies/watch-tv.html)
// ═══════════════════════════════════════════════════════════

async function initWatchTVPage() {
  const params = new URLSearchParams(window.location.search);
  const showId = params.get('id');

  if (!showId) {
    document.title = 'Show Not Found — ToxibhFlix';
    return;
  }

  // Scroll header
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () =>
      header.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  }

  // Defaults: check URL params for direct season/episode links
  let defaultSeason  = parseInt(params.get('s') || '1', 10) || 1;
  let defaultEpisode = parseInt(params.get('e') || '1', 10) || 1;
  const shouldResume = params.get('resume') === '1';

  window._currentShowId = showId;
  window._currentSeason = defaultSeason;
  window._currentEpisode = defaultEpisode;

  // Check existing resume data
  const saved = getProgress(showId);
  if (saved && saved.mediaType === 'tv' && saved.timestamp > 10 && !params.get('s')) {
    defaultSeason  = saved.season  || 1;
    defaultEpisode = saved.episode || 1;
    window._currentSeason  = defaultSeason;
    window._currentEpisode = defaultEpisode;
  }

  // Load show details
  try {
    const show = await tmdb(`/tv/${showId}`);
    populateWatchTVPage(show);

    // Render season tabs
    renderSeasonTabs(show.seasons || [], showId, defaultSeason);

    // Load initial season episodes
    await fetchAndRenderEpisodes(showId, defaultSeason, defaultEpisode);

    // Recs
    try {
      const recs = await tmdb(`/tv/${showId}/recommendations`);
      renderTVRow(recs.results.slice(0, 12), 'row-recs');
    } catch (e) {}

  } catch (e) {
    showToast('⚠ Server error loading show info.');
  }

  // Resume banner
  if (saved && saved.mediaType === 'tv' && saved.timestamp > 10) {
    const banner    = document.getElementById('resume-banner');
    const sBadge    = document.getElementById('resume-season');
    const eBadge    = document.getElementById('resume-episode');
    const timeBadge = document.getElementById('resume-time');
    if (banner) {
      if (sBadge)    sBadge.textContent    = saved.season  || 1;
      if (eBadge)    eBadge.textContent    = saved.episode || 1;
      if (timeBadge) timeBadge.textContent  = formatTime(saved.timestamp);
      banner.classList.add('visible');
    }
  }

  // Resume button
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    const ts = saved ? (saved.timestamp || 0) : 0;
    loadTVPlayer(showId, saved?.season || 1, saved?.episode || 1, ts);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });

  // Fresh start button
  document.getElementById('watch-btn-fresh')?.addEventListener('click', () => {
    loadTVPlayer(showId, defaultSeason, defaultEpisode, 0);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });

  // Main watch button
  document.getElementById('watch-btn')?.addEventListener('click', () => {
    const ts = (shouldResume && saved && saved.timestamp > 10) ? saved.timestamp : 0;
    loadTVPlayer(showId, window._currentSeason, window._currentEpisode, ts);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });
}

function populateWatchTVPage(show) {
  const title = show.name || show.title || 'Unknown Show';
  document.title = `${title} — ToxibhFlix`;

  // Store globals for progress tracking
  window._currentShowTitle  = title;
  window._currentShowPoster = show.poster_path ? posterUrl(show.poster_path, 'w342') : null;

  // Backdrop
  const bd = document.getElementById('watch-backdrop');
  if (bd && show.backdrop_path) {
    bd.style.backgroundImage = `url(${backdropUrl(show.backdrop_path, 'original')})`;
  }

  // Poster
  const posterEl = document.getElementById('watch-poster');
  if (posterEl) {
    const src = posterUrl(show.poster_path, 'w342');
    if (src) { posterEl.src = src; posterEl.alt = title; }
    else posterEl.style.display = 'none';
  }

  setText('watch-title', title);
  setText('watch-tagline', show.tagline || '');
  setText('watch-overview', show.overview);
  setText('watch-rating', show.vote_average ? `★ ${show.vote_average.toFixed(1)} / 10` : '');
  setText('watch-year', (show.first_air_date || '').slice(0, 4));
  setText('watch-seasons', show.number_of_seasons ? `${show.number_of_seasons} Season${show.number_of_seasons > 1 ? 's' : ''}` : '');
  setText('watch-status', show.status || '');

  // Genres
  const genreEl = document.getElementById('watch-genres');
  if (genreEl && show.genres) {
    genreEl.innerHTML = show.genres
      .map(g => `<span class="genre-tag">${g.name}</span>`)
      .join('');
  }
}

function renderSeasonTabs(seasons, showId, activeSeason) {
  const tabs = document.getElementById('season-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';

  // Filter out season 0 (Specials) unless it has episodes
  const realSeasons = seasons.filter(s => s.season_number > 0 || s.episode_count > 0);

  realSeasons.forEach(season => {
    const btn = document.createElement('button');
    btn.className = 'season-tab' + (season.season_number === activeSeason ? ' active' : '');
    btn.textContent = season.season_number === 0 ? 'Specials' : `Season ${season.season_number}`;
    btn.dataset.season = season.season_number;

    btn.addEventListener('click', async () => {
      tabs.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      window._currentSeason = season.season_number;
      window._currentEpisode = 1;
      await fetchAndRenderEpisodes(showId, season.season_number, null);
    });

    tabs.appendChild(btn);
  });
}

async function fetchAndRenderEpisodes(showId, seasonNum, activeEpisode) {
  const grid    = document.getElementById('episode-grid');
  const title   = document.getElementById('ep-list-title');
  if (!grid) return;

  if (title) title.textContent = `Season ${seasonNum} Episodes`;
  grid.innerHTML = '<div id="ep-loading">Loading episodes…</div>';

  try {
    const data = await tmdb(`/tv/${showId}/season/${seasonNum}`);
    const episodes = data.episodes || [];
    grid.innerHTML = '';

    if (!episodes.length) {
      grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No episodes found.</p>';
      return;
    }

    episodes.forEach(ep => {
      const card = document.createElement('div');
      card.className = 'episode-card' + (ep.episode_number === activeEpisode ? ' active-ep' : '');
      card.dataset.ep = ep.episode_number;

      const still = ep.still_path ? `${IMG_BASE}/w300${ep.still_path}` : null;
      const runtime = ep.runtime ? `${ep.runtime} min` : '';

      card.innerHTML = `
        <div class="ep-thumb">
          ${still ? `<img src="${still}" alt="Ep ${ep.episode_number}" loading="lazy">` : '📺'}
        </div>
        <div class="ep-info">
          <div class="ep-num">EP ${ep.episode_number}</div>
          <div class="ep-title">${ep.name || 'Episode ' + ep.episode_number}</div>
          <div class="ep-desc">${ep.overview || 'No description available.'}</div>
          ${runtime ? `<div class="ep-runtime">${runtime}</div>` : ''}
        </div>
        <div class="ep-play-btn">▶</div>`;

      card.addEventListener('click', () => {
        window._currentEpisode = ep.episode_number;
        window._currentSeason  = seasonNum;

        // Update active state
        grid.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active-ep'));
        card.classList.add('active-ep');

        // Load player
        loadTVPlayer(showId, seasonNum, ep.episode_number, 0);
      });

      grid.appendChild(card);
    });

    // Scroll active episode into view
    const activeCard = grid.querySelector('.active-ep');
    if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (e) {
    grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Error loading episodes.</p>';
  }
}

function loadTVPlayer(showId, season, episode, startSeconds = 0) {
  const container = document.getElementById('player-container');
  if (!container) return;

  window._currentShowId  = showId;
  window._currentSeason  = season;
  window._currentEpisode = episode;

  let src = `https://www.vidking.net/embed/tv/${showId}/${season}/${episode}?color=e50914&autoPlay=true`;
  if (startSeconds > 5) src += `&progress=${Math.floor(startSeconds)}`;

  container.innerHTML = `
    <iframe
      src="${src}"
      width="100%"
      height="580"
      frameborder="0"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer-when-downgrade"
      title="TV Player S${season}E${episode}">
    </iframe>`;

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });

  showToast(startSeconds > 5
    ? `▶ Resuming S${season}E${episode} from ${formatTime(startSeconds)}`
    : `▶ Playing S${season}E${episode}`);
}

// ═══════════════════════════════════════════════════════════
//  GENRES BROWSER
// ═══════════════════════════════════════════════════════════
async function initGenres(type) {
  const containerId = type === 'movie' ? 'movie-genres' : 'tv-genres';
  const container = document.getElementById(containerId);
  if (!container) return;

  const path = type === 'movie' ? '/genre/movie/list' : '/genre/tv/list';
  try {
    const data = await tmdb(path);
    if (data.genres) {
      container.innerHTML = '';
      data.genres.forEach(g => {
        const pill = document.createElement('div');
        pill.className = 'genre-pill';
        pill.textContent = g.name;
        pill.dataset.id = g.id;
        pill.addEventListener('click', () => {
          container.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          fetchGenreResults(type, g.id, g.name);
        });
        container.appendChild(pill);
      });
    }
  } catch (e) {
    container.innerHTML = '<p style="color:var(--nf-muted);">Error loading genres.</p>';
  }
}

async function fetchGenreResults(type, genreId, genreName) {
  const sectionId = type === 'movie' ? 'movie-genre-results' : 'tv-genre-results';
  const titleId   = type === 'movie' ? 'movie-genre-title' : 'tv-genre-title';
  const rowId     = type === 'movie' ? 'movie-genre-row' : 'tv-genre-row';
  
  const section = document.getElementById(sectionId);
  const titleEl = document.getElementById(titleId);
  const rowEl   = document.getElementById(rowId);
  
  if (!section || !titleEl || !rowEl) return;
  
  section.style.display = 'block';
  titleEl.textContent = `${genreName} ${type === 'movie' ? 'Movies' : 'TV Shows'}`;
  
  // Reuse showSkeletons for this row natively
  showSkeletons(rowId);
  
  // Wait a small moment to let UI update before scrolling smoothly
  setTimeout(() => {
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
  
  try {
    const data = await tmdb(`/discover/${type}`, { with_genres: genreId });
    if (type === 'movie') {
      renderRow(data.results, rowId);
    } else {
      renderTVRow(data.results, rowId);
    }
  } catch (e) {
    rowEl.innerHTML = '<p style="color:var(--nf-muted);">Server error. Try again later.</p>';
  }
}
