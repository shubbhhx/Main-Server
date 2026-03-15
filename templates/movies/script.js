// ═══════════════════════════════════════════════════════════
//  CINEMATIC — Movies + TV Script
//  TMDB API + Vidking embed + per-profile resume tracking
// ═══════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────
const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org';
const IMG_BASE = `${TMDB_IMAGE_ORIGIN}/t/p`;
const TMDB_IMAGE_PROXY = '/tmdb_image';
const FALLBACK_POSTER = '/static/img/no-poster.png';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _themeReady = false;
let _themeLoaderCount = 0;
let _particleStarted = false;

// ── IN-MEMORY CACHE ──────────────────────────────────────────
const _cache = {};
const _posterCache = {};
const _progressFlushTimers = {};

// ── PORTFOLIO THEME FX (BG + LOADER) ─────────────────────────
function ensureThemeEffects() {
  if (_themeReady) return;
  _themeReady = true;

  if (!document.getElementById('grid-bg')) {
    const grid = document.createElement('div');
    grid.id = 'grid-bg';
    document.body.prepend(grid);
  }

  if (!document.getElementById('scanline')) {
    const scanline = document.createElement('div');
    scanline.id = 'scanline';
    document.body.prepend(scanline);
  }

  if (!document.getElementById('particle-canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'particle-canvas';
    document.body.prepend(canvas);
  }

  if (!document.getElementById('loader')) {
    const loader = document.createElement('div');
    loader.id = 'loader';
    loader.className = 'done';
    loader.innerHTML = `
      <svg class="loader-robot-svg" viewBox="0 0 100 100">
        <g class="robot-outline" stroke-linejoin="round">
          <polygon points="25,4 30,22 23,22" />
          <polygon points="75,4 70,22 77,22" />
          <rect x="20" y="22" width="60" height="6" />
          <polygon points="45,10 55,10 58,18 55,22 45,22 42,18" />
          <polygon points="30,28 70,28 70,35 55,50 45,50 30,35" />
          <polyline points="33,30 46,30 50,35 46,40" />
          <polyline points="67,30 54,30 50,35 54,40" />
          <rect x="22" y="28" width="8" height="15" />
          <rect x="70" y="28" width="8" height="15" />
          <rect x="15" y="30" width="7" height="15" rx="2" />
          <rect x="78" y="30" width="7" height="15" rx="2" />
          <polygon points="22,43 30,43 32,60 20,60" />
          <polygon points="70,43 78,43 80,60 68,60" />
          <rect x="22" y="60" width="8" height="6" rx="1" />
          <rect x="70" y="60" width="8" height="6" rx="1" />
          <polygon points="45,50 55,50 53,55 47,55" />
          <polygon points="35,46 43,46 43,73 32,73" />
          <polygon points="57,46 65,46 68,73 57,73" />
          <rect x="35" y="73" width="8" height="20" rx="2" />
          <rect x="31" y="76" width="4" height="14" rx="1" />
          <rect x="57" y="73" width="8" height="20" rx="2" />
          <rect x="65" y="76" width="4" height="14" rx="1" />
        </g>
        <clipPath id="robot-clip-movies">
          <polygon points="25,4 30,22 23,22" />
          <polygon points="75,4 70,22 77,22" />
          <rect x="20" y="22" width="60" height="6" />
          <polygon points="45,10 55,10 58,18 55,22 45,22 42,18" />
          <polygon points="30,28 70,28 70,35 55,50 45,50 30,35" />
          <rect x="22" y="28" width="8" height="15" />
          <rect x="70" y="28" width="8" height="15" />
          <rect x="15" y="30" width="7" height="15" rx="2" />
          <rect x="78" y="30" width="7" height="15" rx="2" />
          <polygon points="22,43 30,43 32,60 20,60" />
          <polygon points="70,43 78,43 80,60 68,60" />
          <rect x="22" y="60" width="8" height="6" rx="1" />
          <rect x="70" y="60" width="8" height="6" rx="1" />
          <polygon points="45,50 55,50 53,55 47,55" />
          <polygon points="35,46 43,46 43,73 32,73" />
          <polygon points="57,46 65,46 68,73 57,73" />
          <rect x="35" y="73" width="8" height="20" rx="2" />
          <rect x="31" y="76" width="4" height="14" rx="1" />
          <rect x="57" y="73" width="8" height="20" rx="2" />
          <rect x="65" y="76" width="4" height="14" rx="1" />
        </clipPath>
        <rect x="0" y="100" width="100" height="0" class="robot-fill" id="robotFillElementMovies" clip-path="url(#robot-clip-movies)" />
      </svg>
      <div class="loader-pct" id="loaderPctMovies">0%</div>
      <div class="loader-text" id="loaderTextMovies">SYSTEM BOOT SEQUENCE</div>
      <div class="loader-sub" id="loaderSubMovies">AI CORE ENGAGED</div>`;
    document.body.appendChild(loader);
  }

  if (!_particleStarted) {
    _particleStarted = true;
    startThemeParticles();
  }
}

function startThemeParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  const particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    const opacity = Math.random() * 0.5 + 0.1;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 2 + 0.5,
      color: Math.random() > 0.7
        ? `rgba(255,0,110,${opacity})`
        : `rgba(0,245,255,${opacity})`
    };
  }

  resize();
  for (let i = 0; i < 80; i++) particles.push(makeParticle());
  window.addEventListener('resize', resize, { passive: true });

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,245,255,${0.07 * (1 - d / 130)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    drawConnections();
    requestAnimationFrame(animate);
  }

  animate();
}

function showThemeLoader(text = 'SYSTEM BOOT SEQUENCE', sub = 'AI CORE ENGAGED') {
  ensureThemeEffects();
  _themeLoaderCount++;

  const loader = document.getElementById('loader');
  const pct = document.getElementById('loaderPctMovies');
  const fill = document.getElementById('robotFillElementMovies');
  const txt = document.getElementById('loaderTextMovies');
  const subTxt = document.getElementById('loaderSubMovies');
  if (!loader || !pct || !fill || !txt || !subTxt) return;

  if (loader._timer) {
    clearInterval(loader._timer);
    loader._timer = null;
  }

  txt.textContent = text;
  subTxt.textContent = sub;
  loader.classList.remove('done');
  let progress = 0;
  pct.textContent = '0%';
  fill.setAttribute('height', '0');
  fill.setAttribute('y', '100');

  loader._timer = setInterval(() => {
    progress += Math.floor(Math.random() * 8) + 2;
    if (progress > 100) progress = 100;
    pct.textContent = progress + '%';
    fill.setAttribute('height', String(progress));
    fill.setAttribute('y', String(100 - progress));
    if (progress === 100) {
      clearInterval(loader._timer);
      loader._timer = null;
    }
  }, 30);
}

function hideThemeLoader(delay = 220) {
  _themeLoaderCount = Math.max(0, _themeLoaderCount - 1);
  if (_themeLoaderCount > 0) return;

  const loader = document.getElementById('loader');
  if (!loader) return;
  setTimeout(() => {
    if (_themeLoaderCount === 0) loader.classList.add('done');
  }, delay);
}

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
  } else if (path.startsWith('/movie/') && path.endsWith('/videos')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/movie/${id}/videos`;
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
  } else if (path.startsWith('/tv/') && path.endsWith('/videos')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/tv/${id}/videos`;
  } else if (path.startsWith('/tv/') && path.endsWith('/credits')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/tv/${id}/credits`;
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
function tmdbProxyUrl(absoluteUrl) {
  return `${TMDB_IMAGE_PROXY}?url=${encodeURIComponent(absoluteUrl)}`;
}

function normalizePosterValue(value, size = 'w342') {
  if (!value) return FALLBACK_POSTER;
  if (value.startsWith('/tmdb_image') || value.startsWith('/static/')) return value;
  if (value.startsWith('/')) return posterUrl(value, size);
  if (value.startsWith(IMG_BASE) || value.includes('image.tmdb.org/t/p')) {
    return tmdbProxyUrl(value);
  }
  return value;
}

function posterUrl(path, size = 'w342') {
  if (!path) return FALLBACK_POSTER;
  const cacheKey = `${size}:${path}`;
  if (_posterCache[cacheKey]) return _posterCache[cacheKey];
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const resolved = tmdbProxyUrl(`${IMG_BASE}/${size}${cleanPath}`);
  _posterCache[cacheKey] = resolved;
  return resolved;
}
function backdropUrl(path, size = 'w1280') {
  if (!path) return null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return tmdbProxyUrl(`${IMG_BASE}/${size}${cleanPath}`);
}
function stillUrl(path, size = 'w300') {
  if (!path) return null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return tmdbProxyUrl(`${IMG_BASE}/${size}${cleanPath}`);
}

// ── RESUME WATCHING (Per-Profile, Movie + TV) ────────────────────
// Storage key: toxibhflix_resume_{profileId}_{tmdbId}
// Data: { profileId, tmdbId, mediaType, title, poster, season, episode,
//         timestamp, progress, savedAt }

function _getActiveProfile() {
  return JSON.parse(localStorage.getItem('toxibhflix_profile') || 'null');
}

function _profileQuery() {
  const p = _getActiveProfile();
  if (!p) return '';
  const q = new URLSearchParams();
  if (p.id) q.set('profile_id', p.id);
  if (p.name) q.set('profile_name', p.name);
  return q.toString();
}

function _profileHeaders() {
  const p = _getActiveProfile();
  const headers = {};
  if (p && p.id) headers['X-Profile-Id'] = p.id;
  return headers;
}

async function resolveActiveProfile() {
  const p = _getActiveProfile();
  if (!p || p.id) return p;
  try {
    const res = await fetch('/api/movies/profile/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_name: p.name, avatar: p.emoji || '👤' })
    });
    if (!res.ok) return p;
    const data = await res.json();
    const resolved = data.profile || null;
    if (resolved) {
      const normalized = {
        id: resolved.id,
        name: resolved.name,
        emoji: resolved.emoji,
        ts: Date.now()
      };
      localStorage.setItem('toxibhflix_profile', JSON.stringify(normalized));
      return normalized;
    }
  } catch (e) {}
  return p;
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

  const pid = data.profileId || (_getActiveProfile() || {}).id;
  const payload = {
    profile_id: pid || null,
    profile_name: (_getActiveProfile() || {}).name || null,
    content_id: String(tmdbId),
    content_type: entry.mediaType || 'movie',
    title: entry.title || '',
    poster: entry.poster || '',
    season: entry.season || null,
    episode: entry.episode || null,
    timestamp: entry.timestamp || 0,
    duration: data.duration || 0,
    progress_percent: data.duration > 0 ? ((entry.timestamp || 0) / data.duration) * 100 : (entry.progress || 0) * 100
  };

  const flushKey = `${payload.content_type}:${payload.content_id}`;
  if (_progressFlushTimers[flushKey]) clearTimeout(_progressFlushTimers[flushKey]);
  _progressFlushTimers[flushKey] = setTimeout(async () => {
    try {
      await fetch('/api/movies/resume-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._profileHeaders() },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }, 800);
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

async function getServerProgress(tmdbId, mediaType = 'movie') {
  const q = new URLSearchParams();
  q.set('content_id', String(tmdbId));
  q.set('content_type', mediaType);
  const pq = _profileQuery();
  if (pq) {
    const qp = new URLSearchParams(pq);
    qp.forEach((v, k) => q.set(k, v));
  }
  try {
    const res = await fetch(`/api/movies/resume-progress?${q.toString()}`, { headers: _profileHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.progress;
    if (!p) return null;
    return {
      tmdbId: p.content_id,
      mediaType: p.content_type,
      title: p.title,
      poster: p.poster,
      season: p.season,
      episode: p.episode,
      timestamp: p.timestamp || 0,
      duration: p.duration || 0,
      progress: (p.progress_percent || 0) / 100,
      savedAt: p.updated_at ? Date.parse(p.updated_at) : Date.now()
    };
  } catch (e) {
    return null;
  }
}

async function getServerContinueWatching() {
  try {
    const pq = _profileQuery();
    const url = pq ? `/api/movies/continue-watching?${pq}` : '/api/movies/continue-watching';
    const res = await fetch(url, { headers: _profileHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (e) {
    return [];
  }
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
  const { type, currentTime, duration, movieId } = event.data;

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
        progress: 0,
        duration: duration || 0
      });
    } else {
      // Movie — save legacy + new format
      _legacySaveProgress(id, currentTime);
      saveProgress(id, {
        mediaType: 'movie',
        timestamp: currentTime,
        title: window._currentMovieTitle || '',
        poster: window._currentMoviePoster || null,
        progress: 0,
        duration: duration || 0
      });
    }
  }

  if (type === 'ended' && window._currentShowId) {
    autoplayNextEpisode();
  }
});

async function autoplayNextEpisode() {
  const showId = window._currentShowId;
  const season = Number(window._currentSeason || 1);
  const episode = Number(window._currentEpisode || 1);
  if (!showId) return;

  const grid = document.getElementById('episode-grid');
  const nextCard = grid ? grid.querySelector(`.episode-card[data-ep="${episode + 1}"]`) : null;
  if (nextCard) {
    nextCard.click();
    showToast(`▶ Auto-playing next episode (E${episode + 1})`);
    return;
  }

  const nextSeason = season + 1;
  const nextSeasonTab = document.querySelector(`.season-tab[data-season="${nextSeason}"]`);
  if (nextSeasonTab) {
    nextSeasonTab.click();
    setTimeout(() => {
      const firstEp = document.querySelector('.episode-card[data-ep="1"]');
      if (firstEp) {
        firstEp.click();
        showToast(`▶ Auto-playing next episode (S${nextSeason}E1)`);
      }
    }, 600);
  }
}

// ── POSTER CARD BUILDER ──────────────────────────────────────
function buildPosterCard(movie) {
  const card = document.createElement('div');
  card.className = 'poster-card';
  card.dataset.id = movie.id;

  const imgSrc = posterUrl(movie.poster_path);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const year = (movie.release_date || '').slice(0, 4) || '—';

  card.innerHTML = `
    <div class="rating-badge">★ ${rating}</div>
    <div class="poster-play-btn">▶</div>
    <img class="poster-img" src="${imgSrc}" alt="${movie.title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
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

function initRowIntersectionObserver() {
  const sections = document.querySelectorAll('.row-section');
  if (!sections.length) return;
  if (!('IntersectionObserver' in window)) {
    sections.forEach(s => s.classList.add('row-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('row-visible');
      }
    });
  }, { rootMargin: '120px 0px', threshold: 0.08 });

  sections.forEach(s => observer.observe(s));
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
  await resolveActiveProfile();
  showThemeLoader('FETCHING MOVIES', 'SYNCING STREAM CATALOG');
  initRowIntersectionObserver();
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

  try {
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

    // Top 10 Today
    showSkeletons('row-top10');
    try {
      const top10data = await tmdb('/movie/top_rated');
      renderTop10Row(top10data.results, 'row-top10');
    } catch(e) {
      const c = document.getElementById('row-top10');
      if (c) c.innerHTML = '';
    }

    await loadRecommendationsRow('row-recommended', 'movie');
    await loadWatchlistRow('row-watchlist', 'row-watchlist-section');
  } finally {
    hideThemeLoader();
  }

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
  fetchHeroTrailer(movie.id, 'movie');
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
  showThemeLoader('SEARCHING MOVIES', 'QUERYING TMDB NODES');

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
  } finally {
    hideThemeLoader();
  }
}

// ══════════════════════════════════════════════════════════════
//  WATCH PAGE (movies/watch.html)
// ══════════════════════════════════════════════════════════════
async function initWatchPage() {
  await resolveActiveProfile();
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('id');

  if (!movieId) {
    document.title = 'Movie Not Found — Cinematic';
    return;
  }

  showThemeLoader('LOADING MOVIE', 'MOUNTING STREAM INTERFACE');

  window._currentMovieId = movieId;

  // Scroll header
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () =>
      header.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  }

  try {
    try {
      const movie = await tmdb(`/movie/${movieId}`, { append_to_response: 'credits' });
      populateWatchPage(movie);

      // Load recommendations
      const recs = await tmdb(`/movie/${movieId}/recommendations`);
      renderRow(recs.results.slice(0, 12), 'row-recs');
    } catch (e) {
      showToast('⚠ Server error. Please try again.');
    }
  } finally {
    hideThemeLoader();
  }

  // Resume check — supports both old (cinematic_progress) and new (per-profile) format
  const saved = (await getServerProgress(movieId, 'movie')) || getProgress(movieId);
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

  document.getElementById('watchlist-btn')?.addEventListener('click', () => {
    toggleWatchlist(movieId, 'movie', window._currentMovieTitle || '', window._currentMoviePoster || '');
  });
}

function populateWatchPage(movie) {
  document.title = `${movie.title} — Cinematic`;

  // Store globals for resume tracking
  window._currentMovieTitle = movie.title || '';
  window._currentMoviePoster = posterUrl(movie.poster_path, 'w342');
  window._currentMediaType = 'movie';

  // Backdrop
  const bd = document.getElementById('watch-backdrop');
  if (bd && movie.backdrop_path) {
    bd.style.backgroundImage = `url(${backdropUrl(movie.backdrop_path, 'original')})`;
  }

  // Poster
  const posterEl = document.getElementById('watch-poster');
  if (posterEl) {
    posterEl.src = posterUrl(movie.poster_path, 'w342');
    posterEl.alt = movie.title;
    posterEl.onerror = function () {
      this.onerror = null;
      this.src = FALLBACK_POSTER;
    };
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

  setWatchlistButtonState(movie.id, 'movie');
  // Cast
  if (movie.credits) buildCastSection(movie.credits, 'cast-grid');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function loadPlayer(movieId, startSeconds = 0) {
  const container = document.getElementById('player-container');
  if (!container) return;

  // ── Load directly via Vidking (Iframe avoids CORS) ──
  let src = `https://www.vidking.net/embed/movie/${movieId}?color=00f5ff&autoPlay=true`;
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

  const imgSrc = normalizePosterValue(item.poster || null);
  const title = item.title || 'Unknown';
  const pct = item.progress ? Math.min(100, Math.round(item.progress * 100)) : 0;
  const remaining = (item.duration && item.duration > item.timestamp)
    ? `${formatTime(item.duration - item.timestamp)} left`
    : `${formatTime(item.timestamp || 0)}`;
  const label = item.mediaType === 'tv'
    ? `S${item.season || 1}E${item.episode || 1} • ${remaining}`
    : remaining;

  card.innerHTML = `
    <div class="poster-play-btn">▶</div>
    <img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
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
  const section = document.getElementById('row-continue-section');
  const container = document.getElementById(containerId);
  if (!container) return;

  (async () => {
    const serverItems = await getServerContinueWatching();
    const fallbackItems = getContinueWatching();
    const items = (serverItems && serverItems.length) ? serverItems : fallbackItems;

    if (!items || items.length === 0) {
      if (section) section.style.display = 'none';
      return;
    }

    if (section) section.style.display = 'block';
    container.innerHTML = '';
    items.slice(0, 20).forEach(item => container.appendChild(buildContinueCard(item)));
  })();
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
    <div class="rating-badge">★ ${rating}</div>
    <div class="poster-play-btn">▶</div>
    <img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
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
  fetchHeroTrailer(show.id, 'tv');
}

async function initTVPage() {
  await resolveActiveProfile();
  showThemeLoader('FETCHING TV SHOWS', 'SYNCING STREAM CATALOG');
  initRowIntersectionObserver();
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

  try {
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

    // Top 10 TV Today
    showSkeletons('row-top10');
    try {
      const top10tv = await tmdb('/tv/top_rated');
      renderTop10Row(top10tv.results, 'row-top10', 'tv');
    } catch(e) {
      const c = document.getElementById('row-top10');
      if (c) c.innerHTML = '';
    }

    await loadRecommendationsRow('row-recommended', 'tv');
    await loadWatchlistRow('row-watchlist', 'row-watchlist-section');
  } finally {
    hideThemeLoader();
  }

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
  showThemeLoader('SEARCHING TV SHOWS', 'QUERYING TMDB NODES');

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
  } finally {
    hideThemeLoader();
  }
}

// ═══════════════════════════════════════════════════════════
//  TV WATCH PAGE (movies/watch-tv.html)
// ═══════════════════════════════════════════════════════════

async function initWatchTVPage() {
  await resolveActiveProfile();
  const params = new URLSearchParams(window.location.search);
  const showId = params.get('id');

  if (!showId) {
    document.title = 'Show Not Found — ToxibhFlix';
    return;
  }

  showThemeLoader('LOADING TV SHOW', 'MOUNTING STREAM INTERFACE');

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
  const saved = (await getServerProgress(showId, 'tv')) || getProgress(showId);
  if (saved && saved.mediaType === 'tv' && saved.timestamp > 10 && !params.get('s')) {
    defaultSeason  = saved.season  || 1;
    defaultEpisode = saved.episode || 1;
    window._currentSeason  = defaultSeason;
    window._currentEpisode = defaultEpisode;
  }

  // Load show details
  try {
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

      // Cast
      try {
        const credits = await tmdb(`/tv/${showId}/credits`);
        buildCastSection(credits, 'cast-grid');
      } catch(e) {}

    } catch (e) {
      showToast('⚠ Server error loading show info.');
    }
  } finally {
    hideThemeLoader();
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

  document.getElementById('watchlist-btn')?.addEventListener('click', () => {
    toggleWatchlist(showId, 'tv', window._currentShowTitle || '', window._currentShowPoster || '');
  });
}

function populateWatchTVPage(show) {
  const title = show.name || show.title || 'Unknown Show';
  document.title = `${title} — ToxibhFlix`;

  // Store globals for progress tracking
  window._currentShowTitle  = title;
  window._currentShowPoster = posterUrl(show.poster_path, 'w342');
  window._currentMediaType = 'tv';

  // Backdrop
  const bd = document.getElementById('watch-backdrop');
  if (bd && show.backdrop_path) {
    bd.style.backgroundImage = `url(${backdropUrl(show.backdrop_path, 'original')})`;
  }

  // Poster
  const posterEl = document.getElementById('watch-poster');
  if (posterEl) {
    posterEl.src = posterUrl(show.poster_path, 'w342');
    posterEl.alt = title;
    posterEl.onerror = function () {
      this.onerror = null;
      this.src = FALLBACK_POSTER;
    };
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

  setWatchlistButtonState(show.id, 'tv');
}

async function setWatchlistButtonState(contentId, contentType) {
  const btn = document.getElementById('watchlist-btn');
  if (!btn) return;
  const pq = _profileQuery();
  const url = pq ? `/api/movies/watchlist?${pq}` : '/api/movies/watchlist';
  try {
    const res = await fetch(url, { headers: _profileHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];
    const exists = items.some(i => String(i.content_id) === String(contentId) && i.content_type === contentType);
    btn.dataset.inWatchlist = exists ? '1' : '0';
    btn.textContent = exists ? '✓ IN WATCHLIST' : '+ WATCHLIST';
  } catch (e) {}
}

async function toggleWatchlist(contentId, contentType, title, poster) {
  const btn = document.getElementById('watchlist-btn');
  if (!btn) return;
  const inList = btn.dataset.inWatchlist === '1';
  const payload = {
    profile_id: (_getActiveProfile() || {}).id || null,
    profile_name: (_getActiveProfile() || {}).name || null,
    content_id: String(contentId),
    content_type: contentType,
    title: title || '',
    poster: poster || ''
  };
  try {
    if (inList) {
      await fetch('/api/movies/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ..._profileHeaders() },
        body: JSON.stringify(payload)
      });
      showToast('Removed from Watchlist');
    } else {
      await fetch('/api/movies/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._profileHeaders() },
        body: JSON.stringify(payload)
      });
      showToast('Added to Watchlist');
    }
    await setWatchlistButtonState(contentId, contentType);
  } catch (e) {
    showToast('⚠ Watchlist update failed');
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

      const still = stillUrl(ep.still_path, 'w300');
      const runtime = ep.runtime ? `${ep.runtime} min` : '';

      card.innerHTML = `
        <div class="ep-thumb">
          ${still ? `<img src="${still}" alt="Ep ${ep.episode_number}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">` : '📺'}
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

  let src = `https://www.vidking.net/embed/tv/${showId}/${season}/${episode}?color=00f5ff&autoPlay=true`;
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

  showThemeLoader(type === 'movie' ? 'LOADING GENRE MOVIES' : 'LOADING GENRE TV', 'BUILDING DISCOVERY GRID');
  
  try {
    const data = await tmdb(`/discover/${type}`, { with_genres: genreId });
    if (type === 'movie') {
      renderRow(data.results, rowId);
    } else {
      renderTVRow(data.results, rowId);
    }
  } catch (e) {
    rowEl.innerHTML = '<p style="color:var(--nf-muted);">Server error. Try again later.</p>';
  } finally {
    hideThemeLoader();
  }
}

// ═══════════════════════════════════════════════════════════
//  HERO TRAILER AUTO-PLAY
// ═══════════════════════════════════════════════════════════
async function fetchHeroTrailer(id, type = 'movie') {
  try {
    const path = type === 'movie' ? `/movie/${id}/videos` : `/tv/${id}/videos`;
    const data = await tmdb(path);
    const trailer = (data.results || []).find(v =>
      v.site === 'YouTube' && v.type === 'Trailer' && v.official
    ) || (data.results || []).find(v =>
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    if (!trailer) return;
    setTimeout(() => {
      const backdrop = document.getElementById('hero-backdrop');
      if (!backdrop) return;
      let wrap = document.getElementById('hero-trailer-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'hero-trailer-wrap';
        backdrop.parentNode.insertBefore(wrap, backdrop.nextSibling);
      }
      wrap.innerHTML = `<iframe
        id="hero-trailer-iframe"
        src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailer.key}&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1"
        frameborder="0" allow="autoplay" allowfullscreen
        title="Trailer"></iframe>`;
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 1.2s';
      window._heroTrailerMuted = true;
      const audioBtn = document.getElementById('hero-audio-toggle');
      if (audioBtn) {
        audioBtn.style.display = 'inline-flex';
        audioBtn.textContent = '🔊 Unmute';
      }
    }, 2000);
  } catch(e) {}
}

function toggleHeroTrailerMute() {
  const iframe = document.getElementById('hero-trailer-iframe');
  const btn = document.getElementById('hero-audio-toggle');
  if (!iframe || !btn) return;
  const muted = window._heroTrailerMuted !== false;
  iframe.contentWindow?.postMessage(JSON.stringify({
    event: 'command',
    func: muted ? 'unMute' : 'mute',
    args: []
  }), '*');
  window._heroTrailerMuted = !muted;
  btn.textContent = window._heroTrailerMuted ? '🔊 Unmute' : '🔇 Mute';
}

// ═══════════════════════════════════════════════════════════
//  TOP 10 ROW
// ═══════════════════════════════════════════════════════════
function buildTop10Card(movie, rank, type) {
  const card = document.createElement('div');
  card.className = 'poster-card top10-card';
  card.dataset.id = movie.id;
  const imgSrc = posterUrl(movie.poster_path);
  const title = movie.title || movie.name || 'Unknown';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const isTV = type === 'tv' || (!movie.title && movie.name);
  card.innerHTML = `
    <div class="top10-number">${rank}</div>
    <div class="rating-badge">★ ${rating}</div>
    <div class="poster-play-btn">▶</div>
    <img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
    <div class="poster-overlay">
      <div class="poster-title">${title}</div>
    </div>`;
  card.addEventListener('click', () => {
    window.location.href = isTV ? `/movies/watch-tv?id=${movie.id}` : `/movies/watch.html?id=${movie.id}`;
  });
  return card;
}

function buildWatchlistCard(item) {
  const card = document.createElement('div');
  card.className = 'poster-card';
  const title = item.title || 'Untitled';
  const mediaType = item.content_type || 'movie';
  const imgSrc = normalizePosterValue(item.poster || null);
  card.innerHTML = `
    <div class="poster-play-btn">▶</div>
    <img class="poster-img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
    <div class="poster-overlay">
      <div class="poster-title">${title}</div>
      <div class="poster-meta"><span>${mediaType.toUpperCase()}</span></div>
    </div>`;
  card.addEventListener('click', () => {
    window.location.href = mediaType === 'tv'
      ? `/movies/watch-tv?id=${item.content_id}`
      : `/movies/watch.html?id=${item.content_id}`;
  });
  return card;
}

async function loadWatchlistRow(containerId, sectionId) {
  const container = document.getElementById(containerId);
  const section = document.getElementById(sectionId);
  if (!container || !section) return;
  const pq = _profileQuery();
  const url = pq ? `/api/movies/watchlist?${pq}` : '/api/movies/watchlist';
  try {
    const res = await fetch(url, { headers: _profileHeaders() });
    if (!res.ok) throw new Error('watchlist fetch failed');
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    container.innerHTML = '';
    items.slice(0, 20).forEach(item => container.appendChild(buildWatchlistCard(item)));
  } catch (e) {
    section.style.display = 'none';
  }
}

async function loadRecommendationsRow(containerId, mediaType = 'movie') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const q = new URLSearchParams();
  q.set('content_type', mediaType);
  const pq = _profileQuery();
  if (pq) {
    const qp = new URLSearchParams(pq);
    qp.forEach((v, k) => q.set(k, v));
  }

  try {
    const res = await fetch(`/api/movies/recommendations?${q.toString()}`, { headers: _profileHeaders() });
    if (!res.ok) throw new Error('recommendations failed');
    const data = await res.json();
    const results = data.results || [];
    if (mediaType === 'tv') {
      renderTVRow(results, containerId);
    } else {
      renderRow(results, containerId);
    }
  } catch (e) {
    container.innerHTML = '';
  }
}

function renderTop10Row(movies, containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  movies.slice(0, 10).forEach((m, i) => container.appendChild(buildTop10Card(m, i + 1, type)));
}

// ═══════════════════════════════════════════════════════════
//  CAST SECTION
// ═══════════════════════════════════════════════════════════
function buildCastSection(credits, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cast = (credits.cast || []).slice(0, 12);
  if (!cast.length) return;
  container.innerHTML = cast.map(actor => {
    const photo = actor.profile_path ? posterUrl(actor.profile_path, 'w185') : FALLBACK_POSTER;
    const char = actor.character ? `<div class="cast-char">${actor.character}</div>` : '';
    return `<div class="cast-card">
      <div class="cast-photo-wrap">
        <img class="cast-photo" src="${photo}" alt="${actor.name}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
      </div>
      <div class="cast-name">${actor.name}</div>
      ${char}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
