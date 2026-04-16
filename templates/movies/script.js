// ═══════════════════════════════════════════════════════════
//  CINEMATIC — Movies + TV Script
//  TMDB API + Vidking embed + per-profile resume tracking
// ═══════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────
const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org';
const IMG_BASE = `${TMDB_IMAGE_ORIGIN}/t/p`;
const TMDB_IMAGE_PROXY = '/tmdb_image';
const TMDB_WORKER_PROXY = 'https://snowy-bush-2e58.subhamj422.workers.dev';
const FALLBACK_POSTER = '/static/img/no-poster.png';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const _CURRENT_URL = `${window.location.hostname}${window.location.pathname}${window.location.search}`.toLowerCase();
const isFlixRoute = window.location.pathname.startsWith('/movies') || _CURRENT_URL.includes('/flix') || _CURRENT_URL.includes('flix');
const isTVBrowser = /(smart-tv|smarttv|hbbtv|appletv|googletv|netcast|viera|webos|tizen|roku|bravia|xbox|playstation|aftb|aftt|afts|crkey|tv)/i.test(navigator.userAgent || '');
const isTVMode = isFlixRoute && (_CURRENT_URL.includes('flix') || isTVBrowser);

window.isTVMode = isTVMode;

if (isFlixRoute) {
  const applyTVModeClass = () => {
    if (document.body) {
      document.body.classList.toggle('tv-mode', isTVMode);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTVModeClass, { once: true });
  } else {
    applyTVModeClass();
  }
}

let _themeReady = false;
let _themeLoaderCount = 0;
let _particleStarted = false;

function isPortfolioRoute(pathname = window.location.pathname) {
  return pathname === '/' || pathname === '/portfolio' || pathname.startsWith('/portfolio/');
}

const ALLOW_GLOBAL_LOADER = isPortfolioRoute();

// ── IN-MEMORY CACHE ──────────────────────────────────────────
const _cache = {};
const _posterCache = {};
const _progressFlushTimers = {};
const _pendingProgressPayloads = {};

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
  if (!ALLOW_GLOBAL_LOADER) return;
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
  if (!ALLOW_GLOBAL_LOADER) return;
  _themeLoaderCount = Math.max(0, _themeLoaderCount - 1);
  if (_themeLoaderCount > 0) return;

  const loader = document.getElementById('loader');
  if (!loader) return;
  setTimeout(() => {
    if (_themeLoaderCount === 0) loader.classList.add('done');
  }, delay);
}

async function tmdb(path, params = {}) {
  const cleanEndpoint = String(path || '').replace(/^\/+/, '');
  const query = new URLSearchParams();

  if (!Object.prototype.hasOwnProperty.call(params || {}, 'language')) {
    query.set('language', 'en-US');
  }

  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      query.set(k, String(v));
    }
  });

  const endpoint = query.toString() ? `${cleanEndpoint}?${query.toString()}` : cleanEndpoint;
  const fetchUrl = `${TMDB_WORKER_PROXY}/${endpoint}`;

  if (_cache[fetchUrl] && Date.now() - _cache[fetchUrl].ts < CACHE_TTL) {
    return _cache[fetchUrl].data;
  }

  let res;
  try {
    res = await fetchFromAPI(endpoint, true);
  } catch (e) {
    throw new Error(`Network error: ${e.message || 'request failed'}`);
  }

  const data = await res.json();
  _cache[fetchUrl] = { data, ts: Date.now() };
  return data;
}

async function fetchFromAPI(endpoint, rawResponse = false) {
  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '');
  const url = `${TMDB_WORKER_PROXY}/${cleanEndpoint}`;
  // Debug: example call -> /movie/popular, /search/movie?query=avengers
  console.debug('[TMDB Worker] GET', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return rawResponse ? res : res.json();
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

function _isGuestProfile(profile = _getActiveProfile()) {
  return !!(profile && (profile.isGuest || String(profile.id || '').toLowerCase() === 'guest'));
}

function _profileQuery() {
  const p = _getActiveProfile();
  if (!p || _isGuestProfile(p)) return '';
  const q = new URLSearchParams();
  if (p.id) q.set('profile_id', p.id);
  if (p.name) q.set('profile_name', p.name);
  return q.toString();
}

function _profileHeaders() {
  const p = _getActiveProfile();
  const headers = {};
  if (p && p.id && !_isGuestProfile(p)) headers['X-Profile-Id'] = p.id;
  return headers;
}

async function resolveActiveProfile() {
  const p = _getActiveProfile();
  if (_isGuestProfile(p)) return p;
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

async function _postResumePayload(payload) {
  try {
    await fetch('/api/movies/resume-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._profileHeaders() },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

function _sendResumePayloadWithBeacon(payload) {
  if (!navigator.sendBeacon) return false;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon('/api/movies/resume-progress', blob);
  } catch (e) {
    return false;
  }
}

function _flushPendingResumeProgress(useBeacon = false) {
  Object.keys(_pendingProgressPayloads).forEach((flushKey) => {
    const payload = _pendingProgressPayloads[flushKey];
    if (!payload) return;

    if (_progressFlushTimers[flushKey]) {
      clearTimeout(_progressFlushTimers[flushKey]);
      delete _progressFlushTimers[flushKey];
    }

    delete _pendingProgressPayloads[flushKey];

    if (useBeacon && _sendResumePayloadWithBeacon(payload)) return;
    _postResumePayload(payload);
  });
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

  if (_isGuestProfile()) return;

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
  _pendingProgressPayloads[flushKey] = payload;

  if (_progressFlushTimers[flushKey]) return;

  _progressFlushTimers[flushKey] = setTimeout(() => {
    const latestPayload = _pendingProgressPayloads[flushKey];
    delete _progressFlushTimers[flushKey];
    if (!latestPayload) return;
    delete _pendingProgressPayloads[flushKey];
    _postResumePayload(latestPayload);
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
  if (_isGuestProfile()) return null;
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
  if (_isGuestProfile()) return [];
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

window.addEventListener('pagehide', () => {
  _flushPendingResumeProgress(true);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _flushPendingResumeProgress(true);
  }
});

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
  const payload = event.data;

  if (payload === 'video_ended' || payload?.event === 'ended') {
    if (window._currentShowId) {
      playNextEpisode();
    }
    return;
  }

  if (!payload || typeof payload !== 'object') return;
  const { type, currentTime, duration, movieId } = payload;

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
    playNextEpisode();
  }
});

async function autoplayNextEpisode() {
  await playNextEpisode();
}

async function playNextEpisode() {
  const showId = window._currentShowId;
  const state = window._episodeState || {};
  const season = Number(playbackModalState.currentSeasonNumber || window._currentSeason || 1);
  const episode = Number(playbackModalState.currentEpisodeNumber || window._currentEpisode || 1);
  const totalEpisodes = Number(playbackModalState.totalEpisodesInSeason || state.totalEpisodesInSeason || (state.episodes || []).length || 0);
  if (!showId) return;

  if (episode < totalEpisodes) {
    const nextEpisode = episode + 1;
    if (window._episodeState) {
      window._episodeState.activeEpisode = nextEpisode;
    }
    window._currentSeason = season;
    window._currentEpisode = nextEpisode;
    renderEpisodeCards(showId);
    loadTVPlayer(showId, season, nextEpisode, 0);
    showToast(`▶ Auto-playing next episode (E${episode + 1})`);
    return;
  }

  const nextSeason = season + 1;
  const seasonSelect = document.getElementById('season-select');
  if (seasonSelect && [...seasonSelect.options].some(o => Number(o.value) === nextSeason)) {
    seasonSelect.value = String(nextSeason);
    if (window._episodeState) {
      window._episodeState.selectedSeason = nextSeason;
      window._episodeState.activeEpisode = 1;
    }
    await fetchAndRenderEpisodes(showId, nextSeason, 1);
    loadTVPlayer(showId, nextSeason, 1, 0);
    showToast(`▶ Auto-playing next episode (S${nextSeason}E1)`);
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

let _cinematicIdleCleanup = null;
let _tvFocusCleanup = null;

function initTVSpatialNavigation() {
  if (!isTVMode || !isFlixRoute) return;

  if (_tvFocusCleanup) {
    _tvFocusCleanup();
    _tvFocusCleanup = null;
  }

  const focusSelector = [
    '.poster-card',
    '.episode-card',
    '.btn-play',
    '.btn-info',
    '.watch-btn-solid',
    '.watch-btn-glass',
    '.resume-btn',
    '.all-media-load-btn',
    '.genre-pill',
    '.search-overlay-item',
    '.sidebar-link',
    '.sidebar-toggle',
    '.back-btn',
    'button',
    'a'
  ].join(',');

  const isNaturallyFocusable = (el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
    return el.hasAttribute('tabindex');
  };

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const getFocusableElements = () => {
    const nodes = Array.from(document.querySelectorAll(focusSelector)).filter(isVisible);
    return nodes.filter((el) => {
      if (el.disabled) return false;
      if (!isNaturallyFocusable(el)) el.setAttribute('tabindex', '0');
      return true;
    });
  };

  let active = null;

  const setFocused = (el, options = { scroll: true }) => {
    if (!el || !isVisible(el)) return;
    if (active && active !== el) active.classList.remove('focused');
    active = el;
    active.classList.add('focused');
    if (document.activeElement !== active) active.focus({ preventScroll: true });
    if (options.scroll) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  const firstPreferredFocus = () => {
    const preferred = [
      '#watch-btn',
      '#hero-watch',
      '.btn-play',
      '.poster-card',
      '.episode-card',
      '.watch-btn-solid',
      '.watch-btn-glass',
      '.back-btn'
    ];

    for (const sel of preferred) {
      const candidate = document.querySelector(sel);
      if (candidate && isVisible(candidate)) return candidate;
    }

    const all = getFocusableElements();
    return all[0] || null;
  };

  const chooseByDirection = (origin, direction, candidates) => {
    if (!origin) return candidates[0] || null;
    const o = origin.getBoundingClientRect();
    const ocx = o.left + (o.width / 2);
    const ocy = o.top + (o.height / 2);
    const dir = direction.toLowerCase();

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate) => {
      if (candidate === origin) return;
      const r = candidate.getBoundingClientRect();
      const cx = r.left + (r.width / 2);
      const cy = r.top + (r.height / 2);
      const dx = cx - ocx;
      const dy = cy - ocy;

      if (dir === 'left' && dx >= -2) return;
      if (dir === 'right' && dx <= 2) return;
      if (dir === 'up' && dy >= -2) return;
      if (dir === 'down' && dy <= 2) return;

      const primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
      const cross = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      const score = primary * 1000 + cross;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best;
  };

  const resetIdle = () => {
    if (typeof window.__resetCinematicIdleTimer === 'function') {
      window.__resetCinematicIdleTimer();
    }
  };

  const onKeyDown = (event) => {
    if (!isTVMode || !isFlixRoute) return;
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;

    resetIdle();

    const all = getFocusableElements();
    if (!all.length) return;

    if (!active || !isVisible(active)) {
      setFocused(firstPreferredFocus() || all[0]);
    }

    if (key === 'Enter') {
      event.preventDefault();
      const target = active || document.activeElement;
      if (target && typeof target.click === 'function') target.click();
      return;
    }

    event.preventDefault();
    const direction = key.replace('Arrow', '').toLowerCase();
    const next = chooseByDirection(active, direction, all);
    if (next) setFocused(next);
  };

  const onFocusIn = (event) => {
    const el = event.target?.closest?.(focusSelector);
    if (el && isVisible(el)) setFocused(el, { scroll: false });
  };

  const onPointerOver = (event) => {
    const el = event.target?.closest?.(focusSelector);
    if (el && isVisible(el)) setFocused(el, { scroll: false });
  };

  const observer = new MutationObserver(() => {
    if (!active || !active.isConnected || !isVisible(active)) {
      const replacement = firstPreferredFocus();
      if (replacement) setFocused(replacement, { scroll: false });
    }
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('focusin', onFocusIn);
  window.addEventListener('mouseover', onPointerOver);
  observer.observe(document.body, { childList: true, subtree: true });

  const initial = firstPreferredFocus();
  if (initial) setFocused(initial, { scroll: false });

  _tvFocusCleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('mouseover', onPointerOver);
    observer.disconnect();
    if (active) active.classList.remove('focused');
  };
}

function initTVModeEnhancements() {
  if (!isTVMode || !isFlixRoute) return;
  initTVSpatialNavigation();
}

function initCinematicIdleMode() {
  if (_cinematicIdleCleanup) {
    _cinematicIdleCleanup();
    _cinematicIdleCleanup = null;
  }

  let idleTimer = null;
  const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];

  const setActive = () => {
    document.body.classList.remove('cinematic-idle-active');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      document.body.classList.add('cinematic-idle-active');
    }, 3000);
  };

  events.forEach(eventName => {
    window.addEventListener(eventName, setActive, { passive: true });
  });

  setActive();
  window.__resetCinematicIdleTimer = setActive;

  _cinematicIdleCleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    events.forEach(eventName => {
      window.removeEventListener(eventName, setActive, { passive: true });
    });
    if (window.__resetCinematicIdleTimer === setActive) {
      window.__resetCinematicIdleTimer = null;
    }
    document.body.classList.remove('cinematic-idle-active');
  };
}

const playbackModalState = {
  isPlaying: false,
  videoUrl: '',
  currentSeasonNumber: 1,
  currentEpisodeNumber: 1,
  totalEpisodesInSeason: 0,
  mediaType: null,
  showId: null
};

const TV_VIDEO_SERVERS = [
  {
    name: 'VidFast Pro',
    url: (showId, season, episode, startSeconds = 0) => {
      const base = `https://vidfast.pro/tv/${showId}/${season}/${episode}`;
      return startSeconds > 5
        ? `${base}?progress=${Math.floor(startSeconds)}`
        : base;
    },
    primary: true
  },
  {
    name: 'VidKing',
    url: (showId, season, episode, startSeconds = 0) => {
      let src = `https://www.vidking.net/embed/tv/${showId}/${season}/${episode}?color=00f5ff&autoPlay=true`;
      if (startSeconds > 5) src += `&progress=${Math.floor(startSeconds)}`;
      return src;
    }
  },
  {
    name: 'VidSrc',
    url: (showId, season, episode) => `https://vidsrc.xyz/embed/tv/${showId}/${season}/${episode}`
  },
  {
    name: '2Embed',
    url: (showId, season, episode) => `https://2embed.cc/embedtv/${showId}&s=${season}&e=${episode}`
  },
  {
    name: 'MultiEmbed',
    url: (showId, season, episode) => `https://multiembed.mov/?video_id=${showId}&tmdb=1&s=${season}&e=${episode}`
  }
];

const TV_SERVER_STORE_KEY = 'toxibhflix_last_tv_server';
const TV_SERVER_TIMEOUT_MS = 12000;

const tvPlaybackState = {
  activeIndex: 0,
  timeoutId: null,
  autoTried: new Set(),
  showId: null,
  season: 1,
  episode: 1,
  startSeconds: 0,
  autoSwitching: false
};

function getPrimaryTVServerIndex() {
  const idx = TV_VIDEO_SERVERS.findIndex((s) => s.primary);
  return idx >= 0 ? idx : 0;
}

function getPreferredTVServerIndex() {
  const savedName = localStorage.getItem(TV_SERVER_STORE_KEY) || '';
  const savedIdx = TV_VIDEO_SERVERS.findIndex((s) => s.name === savedName);
  if (savedIdx >= 0) return savedIdx;
  return getPrimaryTVServerIndex();
}

function setTVServerStatus(text) {
  const status = document.getElementById('video-playback-server-status');
  if (status) status.textContent = text;
}

function setActiveTVServerButton(index) {
  const list = document.getElementById('video-playback-server-list');
  if (!list) return;
  list.querySelectorAll('.video-playback-server-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.serverIndex) === index);
  });
}

function renderTVServerButtons() {
  const list = document.getElementById('video-playback-server-list');
  if (!list) return;
  list.innerHTML = '';
  TV_VIDEO_SERVERS.forEach((server, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'video-playback-server-btn';
    btn.dataset.serverIndex = String(index);
    btn.textContent = server.name;
    btn.addEventListener('click', () => {
      tvPlaybackState.autoSwitching = false;
      tvPlaybackState.autoTried = new Set([index]);
      loadTVServerByIndex(index, tvPlaybackState.showId, tvPlaybackState.season, tvPlaybackState.episode, tvPlaybackState.startSeconds, true);
    });
    list.appendChild(btn);
  });
  setActiveTVServerButton(tvPlaybackState.activeIndex);
}

function clearTVServerTimeout() {
  if (tvPlaybackState.timeoutId) {
    clearTimeout(tvPlaybackState.timeoutId);
    tvPlaybackState.timeoutId = null;
  }
}

function tryNextTVServer(nextIndex) {
  for (let i = nextIndex; i < TV_VIDEO_SERVERS.length; i += 1) {
    if (!tvPlaybackState.autoTried.has(i)) {
      tvPlaybackState.autoTried.add(i);
      loadTVServerByIndex(i, tvPlaybackState.showId, tvPlaybackState.season, tvPlaybackState.episode, tvPlaybackState.startSeconds, false);
      return;
    }
  }

  setTVServerStatus('All servers failed. Use buttons to retry.');
  showToast('⚠ All TV servers failed. Retry or choose another server.');
}

function loadTVServerByIndex(index, showId, season, episode, startSeconds = 0, isManual = false) {
  const server = TV_VIDEO_SERVERS[index];
  if (!server) return;

  tvPlaybackState.activeIndex = index;
  tvPlaybackState.showId = showId;
  tvPlaybackState.season = season;
  tvPlaybackState.episode = episode;
  tvPlaybackState.startSeconds = startSeconds;

  setActiveTVServerButton(index);
  setTVServerStatus(`Loading ${server.name}...`);

  const src = server.url(showId, season, episode, startSeconds);
  openPlaybackOverlay(src, startSeconds > 5
    ? `▶ Resuming S${season}E${episode} from ${formatTime(startSeconds)}`
    : `▶ Playing S${season}E${episode}`, {
    mediaType: 'tv',
    showId,
    currentSeasonNumber: season,
    currentEpisodeNumber: episode,
    totalEpisodesInSeason: playbackModalState.totalEpisodesInSeason
  });

  const iframe = document.querySelector('#video-playback-host iframe');
  if (!iframe) return;

  clearTVServerTimeout();
  tvPlaybackState.timeoutId = setTimeout(() => {
    setTVServerStatus('Server failed, switching...');
    if (isManual) {
      tvPlaybackState.autoTried = new Set([index]);
    }
    tvPlaybackState.autoSwitching = true;
    tryNextTVServer(index + 1);
  }, TV_SERVER_TIMEOUT_MS);

  iframe.onload = () => {
    clearTVServerTimeout();
    setTVServerStatus(`${server.name} connected`);
    localStorage.setItem(TV_SERVER_STORE_KEY, server.name);
    console.info('[TV Player] Connected:', server.name);
  };

  iframe.onerror = () => {
    clearTVServerTimeout();
    setTVServerStatus('Server failed, switching...');
    tvPlaybackState.autoSwitching = true;
    tryNextTVServer(index + 1);
  };
}

function ensurePlaybackOverlay() {
  if (!document.getElementById('video-playback-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'video-playback-overlay-style';
    style.textContent = `
      #video-playback-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #000;
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.28s ease, visibility 0.28s ease;
      }
      #video-playback-overlay.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      #video-playback-overlay.is-closing {
        opacity: 0;
        visibility: visible;
        pointer-events: none;
      }
      #video-playback-host {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: scale(1.015);
        transition: transform 0.32s ease;
      }
      #video-playback-overlay.is-open #video-playback-host {
        transform: scale(1);
      }
      .video-playback-frame {
        width: 100%;
        height: 100%;
        border: none;
      }
      .video-playback-close {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 10000;
        min-width: 48px;
        height: 48px;
        padding: 0 16px;
        border: 1px solid rgba(0,245,255,0.42);
        border-radius: 12px;
        background: rgba(0,0,0,0.56);
        color: var(--nf-text);
        font-family: 'Orbitron', monospace;
        font-size: 0.8rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        backdrop-filter: blur(10px);
        transition: var(--transition);
      }
      .video-playback-close:hover {
        border-color: var(--cyan);
        box-shadow: 0 0 14px rgba(0,245,255,0.38);
        color: var(--cyan);
      }
      .video-playback-next {
        position: fixed;
        right: 22px;
        top: 78px;
        z-index: 10000;
        display: none;
        align-items: center;
        gap: 10px;
        min-height: 50px;
        padding: 0 18px;
        border: 1px solid rgba(0,245,255,0.42);
        border-radius: 999px;
        background: rgba(0,0,0,0.7);
        color: var(--nf-text);
        backdrop-filter: blur(10px);
        font-family: 'Orbitron', monospace;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        transition: var(--transition);
      }
      .video-playback-next.visible {
        display: inline-flex;
      }
      .video-playback-next:hover:not(:disabled) {
        border-color: var(--cyan);
        box-shadow: 0 0 14px rgba(0,245,255,0.38);
        color: var(--cyan);
      }
      .video-playback-next:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .video-playback-server-ui {
        position: fixed;
        top: 18px;
        left: 18px;
        z-index: 10000;
        display: none;
        flex-direction: column;
        gap: 8px;
        max-width: min(78vw, 860px);
      }
      .video-playback-server-status {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(0,245,255,0.35);
        background: rgba(0,0,0,0.6);
        color: var(--nf-text);
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.58rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        backdrop-filter: blur(8px);
      }
      .video-playback-server-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .video-playback-server-btn {
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(0,245,255,0.35);
        background: rgba(0,0,0,0.6);
        color: var(--nf-text);
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.58rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        backdrop-filter: blur(8px);
      }
      .video-playback-server-btn:hover {
        border-color: var(--cyan);
        box-shadow: 0 0 10px rgba(0,245,255,0.28);
      }
      .video-playback-server-btn.active {
        color: #021318;
        background: linear-gradient(135deg, var(--cyan), #66fcff);
        border-color: rgba(0,245,255,0.92);
      }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('video-playback-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'video-playback-overlay';
    overlay.innerHTML = `
      <button type="button" class="video-playback-close" id="video-playback-close" aria-label="Close player">✕ Close</button>
      <button type="button" class="video-playback-next" id="video-playback-next" aria-label="Play next episode">⏭ Next Episode</button>
      <div class="video-playback-server-ui" id="video-playback-server-ui">
        <div class="video-playback-server-status" id="video-playback-server-status">Ready</div>
        <div class="video-playback-server-list" id="video-playback-server-list"></div>
      </div>
      <div id="video-playback-host"></div>`;
    document.body.appendChild(overlay);
    document.getElementById('video-playback-close')?.addEventListener('click', closePlaybackOverlay);
    document.getElementById('video-playback-next')?.addEventListener('click', () => {
      playNextEpisode();
    });
  }
}

function updatePlaybackOverlayControls() {
  const nextBtn = document.getElementById('video-playback-next');
  const serverUi = document.getElementById('video-playback-server-ui');
  if (!nextBtn) return;

  const isTVPlayback = playbackModalState.mediaType === 'tv' && !!playbackModalState.showId;
  const currentEpisode = Number(playbackModalState.currentEpisodeNumber || 1);
  const totalEpisodes = Number(playbackModalState.totalEpisodesInSeason || 0);
  const availableSeasons = window._episodeState?.availableSeasons || [];
  const currentSeason = Number(playbackModalState.currentSeasonNumber || 1);
  const hasNextInSeason = totalEpisodes > 0 && currentEpisode < totalEpisodes;
  const hasNextSeason = availableSeasons.some(seasonNum => Number(seasonNum) === currentSeason + 1);
  const canAdvance = hasNextInSeason || hasNextSeason;

  nextBtn.classList.toggle('visible', isTVPlayback);
  nextBtn.disabled = !isTVPlayback || !canAdvance;
  nextBtn.textContent = canAdvance ? '⏭ Next Episode' : '⏹ Series Complete';

  if (serverUi) {
    serverUi.style.display = isTVPlayback ? 'flex' : 'none';
  }
}

function openPlaybackOverlay(videoUrl, playbackLabel = 'Starting playback', options = {}) {
  if (!videoUrl) return;
  ensurePlaybackOverlay();
  stopWatchHeroTrailer();

  const overlay = document.getElementById('video-playback-overlay');
  const host = document.getElementById('video-playback-host');
  if (!overlay || !host) return;

  playbackModalState.isPlaying = true;
  playbackModalState.videoUrl = videoUrl;
  playbackModalState.mediaType = options.mediaType || playbackModalState.mediaType || null;
  playbackModalState.showId = options.showId ?? playbackModalState.showId ?? null;
  playbackModalState.currentSeasonNumber = Number(options.currentSeasonNumber || playbackModalState.currentSeasonNumber || 1);
  playbackModalState.currentEpisodeNumber = Number(options.currentEpisodeNumber || playbackModalState.currentEpisodeNumber || 1);
  playbackModalState.totalEpisodesInSeason = Number(options.totalEpisodesInSeason || playbackModalState.totalEpisodesInSeason || 0);
  document.body.classList.add('watch-playing');
  updatePlaybackOverlayControls();

  host.innerHTML = `
    <iframe
      class="video-playback-frame"
      src="${videoUrl}"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer-when-downgrade"
      title="ToxibhFlix Player">
    </iframe>`;
  overlay.classList.remove('is-closing');
  overlay.classList.add('is-open');
  showToast(playbackLabel);
}

function closePlaybackOverlay() {
  const overlay = document.getElementById('video-playback-overlay');
  const host = document.getElementById('video-playback-host');
  clearTVServerTimeout();
  if (host) {
    const iframe = host.querySelector('iframe');
    if (iframe) iframe.src = '';
    host.innerHTML = '';
  }
  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    window.setTimeout(() => {
      overlay.classList.remove('is-closing');
    }, 280);
  }
  playbackModalState.isPlaying = false;
  playbackModalState.videoUrl = '';
  playbackModalState.mediaType = null;
  playbackModalState.showId = null;
  playbackModalState.currentSeasonNumber = 1;
  playbackModalState.currentEpisodeNumber = 1;
  playbackModalState.totalEpisodesInSeason = 0;
  tvPlaybackState.activeIndex = 0;
  tvPlaybackState.showId = null;
  tvPlaybackState.season = 1;
  tvPlaybackState.episode = 1;
  tvPlaybackState.startSeconds = 0;
  tvPlaybackState.autoSwitching = false;
  tvPlaybackState.autoTried = new Set();
  document.body.classList.remove('watch-playing');
  updatePlaybackOverlayControls();
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && playbackModalState.isPlaying) {
    closePlaybackOverlay();
  }
});

// ── GLOBAL SEARCH OVERLAY ───────────────────────────────────
let _searchOverlayReady = false;
let _searchOverlayDebounceTimer = null;
let _searchOverlayGenreMap = null;

function ensureSearchOverlay() {
  if (_searchOverlayReady) return;
  _searchOverlayReady = true;

  if (!document.getElementById('global-search-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'global-search-overlay';
    overlay.innerHTML = `
      <div class="search-overlay-modal" role="dialog" aria-modal="true" aria-label="Search">
        <div class="search-overlay-header">
          <div class="search-overlay-title">Search</div>
          <select id="search-overlay-filter" class="search-overlay-filter" aria-label="Search filter">
            <option value="multi">Movies & TV Shows</option>
          </select>
          <button id="search-overlay-close" class="search-overlay-close" type="button" aria-label="Close search">✕</button>
        </div>
        <div class="search-overlay-input-wrap">
          <span class="search-overlay-icon">🔍</span>
          <input id="search-overlay-input" class="search-overlay-input" type="search" placeholder="Search movies and TV shows..." autocomplete="off" spellcheck="false">
        </div>
        <div id="search-overlay-results" class="search-overlay-results"></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('search-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'search-overlay-style';
    style.textContent = `
      #global-search-overlay {
        position: fixed;
        inset: 0;
        z-index: 12000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(15px);
      }
      #global-search-overlay.open { display: flex; }
      .search-overlay-modal {
        width: min(1040px, 100%);
        max-height: min(92vh, 980px);
        display: flex;
        flex-direction: column;
        background: rgba(10,10,15,0.92);
        border: 1px solid rgba(0,245,255,0.25);
        border-radius: 16px;
        box-shadow: 0 0 28px rgba(0,245,255,0.22);
        overflow: hidden;
      }
      .search-overlay-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(0,245,255,0.16);
      }
      .search-overlay-title {
        font-family: 'Orbitron', monospace;
        font-size: 0.88rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--nf-text);
        margin-right: auto;
      }
      .search-overlay-filter {
        background: rgba(15,15,20,0.75);
        border: 1px solid rgba(0,245,255,0.25);
        color: var(--nf-text);
        border-radius: 8px;
        padding: 8px 10px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.64rem;
        letter-spacing: 0.08em;
      }
      .search-overlay-close {
        width: 36px;
        height: 36px;
        border-radius: 9px;
        border: 1px solid rgba(255,0,110,0.45);
        background: rgba(20,10,18,0.7);
        color: var(--magenta);
        cursor: pointer;
      }
      .search-overlay-input-wrap {
        position: relative;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(0,245,255,0.12);
      }
      .search-overlay-icon {
        position: absolute;
        left: 30px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--nf-muted);
      }
      .search-overlay-input {
        width: 100%;
        height: 52px;
        border-radius: 11px;
        border: 1px solid rgba(0,245,255,0.22);
        background: rgba(15,15,20,0.75);
        color: var(--nf-text);
        padding: 0 16px 0 44px;
        font-size: 1.02rem;
        outline: none;
      }
      .search-overlay-input:focus {
        border-color: rgba(0,245,255,0.6);
        box-shadow: 0 0 14px rgba(0,245,255,0.25);
      }
      .search-overlay-results {
        overflow-y: auto;
        padding: 8px 8px 14px;
        max-height: 70vh;
      }
      .search-overlay-empty {
        padding: 20px 12px;
        color: var(--nf-muted);
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.72rem;
      }
      .search-overlay-item {
        display: grid;
        grid-template-columns: 72px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid transparent;
        background: rgba(255,255,255,0.02);
        cursor: pointer;
        transition: var(--transition);
      }
      .search-overlay-item + .search-overlay-item { margin-top: 6px; }
      .search-overlay-item:hover {
        border-color: rgba(0,245,255,0.5);
        background: rgba(0,245,255,0.08);
        box-shadow: 0 0 10px rgba(0,245,255,0.2);
      }
      .search-overlay-thumb {
        width: 72px;
        height: 104px;
        border-radius: 7px;
        object-fit: cover;
        background: #0d0d12;
      }
      .search-overlay-main { min-width: 0; }
      .search-overlay-item-title {
        font-family: 'Orbitron', monospace;
        font-size: 0.68rem;
        color: var(--nf-text);
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .search-overlay-item-meta {
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.58rem;
        color: var(--nf-muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-bottom: 5px;
      }
      .search-overlay-item-genres {
        font-size: 0.67rem;
        color: var(--nf-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .search-overlay-rating {
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.62rem;
        color: #ffe081;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 999px;
        padding: 3px 8px;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.getElementById('global-search-overlay');
  const closeBtn = document.getElementById('search-overlay-close');
  const input = document.getElementById('search-overlay-input');

  if (closeBtn) closeBtn.onclick = closeSearchOverlay;
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearchOverlay();
    });
  }

  if (input) {
    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(_searchOverlayDebounceTimer);
      _searchOverlayDebounceTimer = setTimeout(() => {
        runSearchOverlayQuery(query);
      }, 300);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchOverlay();
  });
}

function bindGlobalSearchOverlay() {
  ensureSearchOverlay();
  const wrapper = document.querySelector('.search-wrapper');
  const input = document.getElementById('search-input');
  const icon = document.querySelector('.search-icon');
  const triggers = document.querySelectorAll('.search-overlay-trigger');

  if (input) {
    input.setAttribute('readonly', 'readonly');
    input.addEventListener('focus', (e) => {
      e.target.blur();
      openSearchOverlay();
    });
    input.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchOverlay();
    });
  }

  if (wrapper) {
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchOverlay();
    });
  }

  if (icon) {
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchOverlay();
    });
  }

  triggers.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchOverlay();
    });
  });
}

function openSearchOverlay() {
  ensureSearchOverlay();
  const overlay = document.getElementById('global-search-overlay');
  const input = document.getElementById('search-overlay-input');
  const results = document.getElementById('search-overlay-results');
  if (!overlay || !input || !results) return;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  input.value = '';
  results.innerHTML = '<div class="search-overlay-empty">Search for a movie or TV show.</div>';
  setTimeout(() => input.focus(), 20);
}

function closeSearchOverlay() {
  const overlay = document.getElementById('global-search-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function ensureSearchGenreMap() {
  if (_searchOverlayGenreMap) return _searchOverlayGenreMap;
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdb('/genre/movie/list'),
      tmdb('/genre/tv/list')
    ]);
    const genreMap = {};
    (movieGenres.genres || []).forEach(g => { genreMap[g.id] = g.name; });
    (tvGenres.genres || []).forEach(g => { genreMap[g.id] = g.name; });
    _searchOverlayGenreMap = genreMap;
  } catch (e) {
    _searchOverlayGenreMap = {};
  }
  return _searchOverlayGenreMap;
}

function renderSearchOverlayResults(results = [], genreMap = {}) {
  const box = document.getElementById('search-overlay-results');
  if (!box) return;

  if (!results.length) {
    box.innerHTML = '<div class="search-overlay-empty">No results found.</div>';
    return;
  }

  box.innerHTML = '';

  results.forEach(item => {
    if (!item || (item.media_type !== 'movie' && item.media_type !== 'tv')) return;

    const title = item.title || item.name || 'Untitled';
    const yearRaw = item.media_type === 'movie' ? item.release_date : item.first_air_date;
    const year = (yearRaw || '').slice(0, 4) || '—';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const typeLabel = item.media_type === 'tv' ? 'TV Show' : 'Movie';
    const thumb = item.poster_path ? posterUrl(item.poster_path, 'w185') : FALLBACK_POSTER;
    const genres = (item.genre_ids || []).map(id => genreMap[id]).filter(Boolean).slice(0, 3).join(' • ') || '—';

    const row = document.createElement('div');
    row.className = 'search-overlay-item';
    row.innerHTML = `
      <img class="search-overlay-thumb" src="${thumb}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
      <div class="search-overlay-main">
        <div class="search-overlay-item-title">${title}</div>
        <div class="search-overlay-item-meta">${typeLabel} • ${year}</div>
        <div class="search-overlay-item-genres">${genres}</div>
      </div>
      <div class="search-overlay-rating">★ ${rating}</div>`;

    row.addEventListener('click', () => {
      closeSearchOverlay();
      window.location.href = item.media_type === 'tv'
        ? `/movies/watch-tv?id=${item.id}`
        : `/movies/watch.html?id=${item.id}`;
    });

    box.appendChild(row);
  });
}

async function runSearchOverlayQuery(query) {
  const box = document.getElementById('search-overlay-results');
  if (!box) return;

  if (!query) {
    box.innerHTML = '<div class="search-overlay-empty">Search for a movie or TV show.</div>';
    return;
  }

  box.innerHTML = '<div class="search-overlay-empty">Searching...</div>';
  try {
    const data = await tmdb('/search/multi', {
      query,
      page: '1',
      include_adult: 'false'
    });
    const genreMap = await ensureSearchGenreMap();
    renderSearchOverlayResults((data.results || []).slice(0, 20), genreMap);
  } catch (e) {
    box.innerHTML = '<div class="search-overlay-empty">Search failed. Try again.</div>';
  }
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
  await initAllMediaSection('movie');

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

  bindGlobalSearchOverlay();
  bindRecommendationRowAutoRefresh('movie');
  initCinematicIdleMode();
  initTVModeEnhancements();
}

function setHero(movie) {
  const backdrop = document.getElementById('hero-backdrop');
  const htitle = document.getElementById('hero-title');
  const hmeta = document.getElementById('hero-meta');
  const hdesc = document.getElementById('hero-desc');
  const hwatch = document.getElementById('hero-watch');
  bindHeroAudioToggle();

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
  bindGlobalSearchOverlay();
  initCinematicIdleMode();
  initTVModeEnhancements();
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

      const [recs, videos] = await Promise.all([
        tmdb(`/movie/${movieId}/recommendations`),
        tmdb(`/movie/${movieId}/videos`)
      ]);

      renderWatchRecommendations(recs.results.slice(0, 12), 'row-recs');
      setWatchHeroTrailer(videos);
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

  document.getElementById('watch-btn-fresh')?.addEventListener('click', () => {
    loadPlayer(movieId, 0);
    document.getElementById('resume-banner')?.classList.remove('visible');
  });

  document.getElementById('download-btn')?.addEventListener('click', () => {
    showToast('⬇ Download will be available soon');
  });

  document.getElementById('similars-btn')?.addEventListener('click', () => {
    const recSection = document.getElementById('recommendations');
    if (recSection) recSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('watch-audio-toggle')?.addEventListener('click', toggleHeroTrailerMute);

  document.getElementById('watchlist-btn')?.addEventListener('click', () => {
    toggleWatchlist(movieId, 'movie', window._currentMovieTitle || '', window._currentMoviePoster || '');
  });
}

function populateWatchPage(movie) {
  document.title = `${movie.title} — ToxibhFlix`;

  // Store globals for resume tracking
  window._currentMovieTitle = movie.title || '';
  window._currentMoviePoster = posterUrl(movie.poster_path, 'w342');
  window._currentMediaType = 'movie';

  // Backdrop
  const bd = document.getElementById('watch-backdrop');
  if (bd && movie.backdrop_path) {
    bd.style.backgroundImage = `url(${backdropUrl(movie.backdrop_path, 'original')})`;
  }

  const posterEl = document.getElementById('watch-poster');
  if (posterEl) posterEl.src = posterUrl(movie.poster_path, 'w342');

  setText('watch-title', movie.title);
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
  if (movie.credits) renderWatchActors(movie.credits, 'cast-grid');
}

function selectPreferredTrailer(videoData) {
  const videos = (videoData && videoData.results) || [];
  return videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')
    || videos.find(video => video.site === 'YouTube' && video.type === 'Teaser')
    || null;
}

function buildYouTubeAutoplayEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&rel=0&showinfo=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
}

function setWatchHeroTrailer(videoData) {
  const layer = document.getElementById('watch-trailer-layer');
  const iframe = document.getElementById('watch-trailer-iframe');
  const hero = document.getElementById('watch-hero');
  const audioBtn = document.getElementById('watch-audio-toggle');
  if (!layer || !iframe || !hero) return;

  const trailer = selectPreferredTrailer(videoData);

  if (!trailer || !trailer.key) {
    iframe.src = '';
    layer.classList.remove('active');
    hero.classList.remove('trailer-playing');
    if (audioBtn) audioBtn.style.display = 'none';
    return;
  }

  iframe.src = buildYouTubeAutoplayEmbedUrl(trailer.key);
  layer.classList.add('active');
  hero.classList.add('trailer-playing');
  window._watchHeroMuted = true;
  if (audioBtn) {
    audioBtn.style.display = 'inline-flex';
    audioBtn.textContent = '🔇';
    audioBtn.title = 'Unmute trailer';
    audioBtn.setAttribute('aria-label', 'Unmute trailer');
  }
}

function stopWatchHeroTrailer() {
  const layer = document.getElementById('watch-trailer-layer');
  const iframe = document.getElementById('watch-trailer-iframe');
  const hero = document.getElementById('watch-hero');
  const audioBtn = document.getElementById('watch-audio-toggle');
  if (iframe) iframe.src = '';
  if (layer) layer.classList.remove('active');
  if (hero) hero.classList.remove('trailer-playing');
  if (audioBtn) audioBtn.style.display = 'none';
}

function renderWatchActors(credits, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cast = (credits.cast || []).slice(0, 12);
  if (!cast.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = cast.map(actor => {
    const photo = actor.profile_path ? posterUrl(actor.profile_path, 'w185') : FALLBACK_POSTER;
    return `
      <div class="actor-card">
        <img class="actor-avatar" src="${photo}" alt="${actor.name}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
        <div class="actor-info">
          <div class="actor-name">${actor.name}</div>
          <div class="actor-character">${actor.character || '—'}</div>
        </div>
      </div>`;
  }).join('');
}

function renderWatchRecommendations(movies, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!movies || !movies.length) {
    container.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No similar movies found.</p>';
    return;
  }

  movies.forEach(movie => {
    const card = document.createElement('article');
    card.className = 'watch-rec-card';
    const imgSrc = posterUrl(movie.poster_path, 'w342');
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
    const title = movie.title || movie.name || 'Untitled';
    const year = (movie.release_date || '').slice(0, 4) || '—';

    card.innerHTML = `
      <span class="watch-badge-left">MOVIE</span>
      <span class="watch-badge-right">★ ${rating}</span>
      <img class="watch-rec-poster" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
      <div class="watch-rec-meta">
        <div class="watch-rec-title">${title}</div>
        <div class="watch-rec-year">${year}</div>
      </div>`;

    card.addEventListener('click', () => {
      window.location.href = `/movies/watch.html?id=${movie.id}`;
    });

    container.appendChild(card);
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

const VIDEO_SERVERS = [
  {
    name: 'VidFast Pro',
    url: (id) => `https://vidfast.pro/movie/${id}`,
    primary: true
  },
  {
    name: 'VidKing',
    url: (id) => `https://www.vidking.net/embed/movie/${id}?color=00f5ff&autoPlay=true`
  },
  {
    name: 'VidSrc',
    url: (id) => `https://vidsrc.xyz/embed/movie/${id}`
  },
  {
    name: '2Embed',
    url: (id) => `https://2embed.cc/embed/${id}`
  },
  {
    name: 'MultiEmbed',
    url: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`
  }
];

const VIDEO_SERVER_STORE_KEY = 'toxibhflix_last_server';
const PLAYER_FAILOVER_TIMEOUT = 12000;

const moviePlayerState = {
  movieId: null,
  activeIndex: 0,
  autoTried: new Set(),
  failoverTimer: null,
  isAutoSwitching: false,
  pendingStartSeconds: 0
};

function getServerIndexByName(name) {
  if (!name) return -1;
  return VIDEO_SERVERS.findIndex((s) => s.name === name);
}

function savePreferredServer(server) {
  if (!server || !server.name) return;
  localStorage.setItem(VIDEO_SERVER_STORE_KEY, server.name);
}

function getPreferredServerIndex() {
  const savedName = localStorage.getItem(VIDEO_SERVER_STORE_KEY) || '';
  const savedIndex = getServerIndexByName(savedName);
  if (savedIndex >= 0) return savedIndex;
  const primaryIndex = VIDEO_SERVERS.findIndex((s) => s.primary);
  return primaryIndex >= 0 ? primaryIndex : 0;
}

function getPrimaryServerIndex() {
  const primaryIndex = VIDEO_SERVERS.findIndex((s) => s.primary);
  return primaryIndex >= 0 ? primaryIndex : 0;
}

function playerElements() {
  return {
    section: document.getElementById('movie-player-section'),
    frame: document.getElementById('videoPlayer'),
    serverList: document.getElementById('serverList'),
    loading: document.getElementById('playerLoading'),
    error: document.getElementById('playerError'),
    errorMsg: document.getElementById('playerErrorMsg'),
    status: document.getElementById('playerStatus'),
    retryBtn: document.getElementById('playerRetryBtn'),
    nextBtn: document.getElementById('playerNextBtn')
  };
}

function setPlayerStatus(message) {
  const { status } = playerElements();
  if (status) status.textContent = message;
}

function setPlayerLoading(show) {
  const { loading } = playerElements();
  if (loading) loading.classList.toggle('visible', !!show);
}

function setPlayerError(message = '') {
  const { error, errorMsg } = playerElements();
  if (!error) return;
  const hasError = !!message;
  error.classList.toggle('visible', hasError);
  if (errorMsg && hasError) errorMsg.textContent = message;
}

function highlightServerButton() {
  const { serverList } = playerElements();
  if (!serverList) return;
  serverList.querySelectorAll('.server-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.index) === moviePlayerState.activeIndex);
  });
}

function buildMovieServerUrl(server, movieId, startSeconds = 0) {
  const base = server.url(movieId);
  const query = new URLSearchParams();
  if (startSeconds > 5) query.set('progress', String(Math.floor(startSeconds)));
  const q = query.toString();
  if (!q) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${q}`;
}

function scheduleFailover(index) {
  clearTimeout(moviePlayerState.failoverTimer);
  moviePlayerState.failoverTimer = setTimeout(() => {
    if (moviePlayerState.activeIndex !== index) return;
    setPlayerStatus('Server failed, switching...');
    tryNextServer(index + 1);
  }, PLAYER_FAILOVER_TIMEOUT);
}

function renderServerList() {
  const { serverList } = playerElements();
  if (!serverList) return;
  serverList.innerHTML = '';
  VIDEO_SERVERS.forEach((server, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'server-btn';
    btn.dataset.index = String(index);
    btn.textContent = server.name;
    btn.addEventListener('click', () => {
      loadServer(index, moviePlayerState.movieId, {
        manual: true,
        startSeconds: moviePlayerState.pendingStartSeconds || 0
      });
    });
    serverList.appendChild(btn);
  });
  highlightServerButton();
}

function loadServer(index, movieId, options = {}) {
  const { frame, section } = playerElements();
  if (!frame || !section) return;
  const server = VIDEO_SERVERS[index];
  if (!server || !movieId) return;

  moviePlayerState.movieId = movieId;
  moviePlayerState.activeIndex = index;
  if (options.startSeconds !== undefined) {
    moviePlayerState.pendingStartSeconds = options.startSeconds || 0;
  }

  stopWatchHeroTrailer();
  section.style.display = '';
  if (options.scroll !== false) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setPlayerError('');
  setPlayerLoading(true);
  setPlayerStatus(`Loading ${server.name}...`);
  highlightServerButton();

  clearTimeout(moviePlayerState.failoverTimer);
  scheduleFailover(index);

  frame.onload = () => {
    if (moviePlayerState.activeIndex !== index) return;
    clearTimeout(moviePlayerState.failoverTimer);
    setPlayerLoading(false);
    setPlayerError('');
    setPlayerStatus(`${server.name} connected`);
    console.info('[Player] Connected:', server.name);
    savePreferredServer(server);
  };

  frame.onerror = () => {
    if (moviePlayerState.activeIndex !== index) return;
    clearTimeout(moviePlayerState.failoverTimer);
    setPlayerStatus('Server failed, switching...');
    console.warn('[Player] Failed:', server.name);
    tryNextServer(index + 1);
  };

  const src = buildMovieServerUrl(server, movieId, moviePlayerState.pendingStartSeconds || 0);
  console.debug('[Player] Loading URL:', src);
  frame.src = src;
}

function tryNextServer(nextIndex) {
  const { frame } = playerElements();
  if (!frame || !moviePlayerState.movieId) return;

  if (!moviePlayerState.isAutoSwitching) {
    moviePlayerState.isAutoSwitching = true;
    moviePlayerState.autoTried = new Set();
  }

  for (let i = nextIndex; i < VIDEO_SERVERS.length; i += 1) {
    if (!moviePlayerState.autoTried.has(i)) {
      moviePlayerState.autoTried.add(i);
      loadServer(i, moviePlayerState.movieId, {
        manual: false,
        startSeconds: moviePlayerState.pendingStartSeconds || 0
      });
      return;
    }
  }

  setPlayerLoading(false);
  setPlayerError('All servers failed. Please retry or switch manually.');
  setPlayerStatus('No active server available');
  moviePlayerState.isAutoSwitching = false;
}

function initMoviePlayerControls(movieId) {
  const { retryBtn, nextBtn } = playerElements();
  if (retryBtn && !retryBtn.dataset.bound) {
    retryBtn.dataset.bound = '1';
    retryBtn.addEventListener('click', () => {
      if (!moviePlayerState.movieId) return;
      setPlayerStatus('Retrying current server...');
      loadServer(moviePlayerState.activeIndex, moviePlayerState.movieId, {
        manual: true,
        startSeconds: moviePlayerState.pendingStartSeconds || 0
      });
    });
  }

  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      if (!moviePlayerState.movieId) return;
      setPlayerStatus('Switching server...');
      const next = (moviePlayerState.activeIndex + 1) % VIDEO_SERVERS.length;
      loadServer(next, moviePlayerState.movieId, {
        manual: true,
        startSeconds: moviePlayerState.pendingStartSeconds || 0
      });
    });
  }

  renderServerList();
  moviePlayerState.movieId = movieId;
}

function loadPlayer(movieId, startSeconds = 0) {
  const qp = new URLSearchParams();
  qp.set('type', 'movie');
  qp.set('id', String(movieId));
  if (window._currentMovieTitle) qp.set('title', window._currentMovieTitle);
  if (window._currentMoviePoster) qp.set('poster', window._currentMoviePoster);
  if (startSeconds > 0) qp.set('start', String(Math.floor(startSeconds)));

  window.location.href = `player.html?${qp.toString()}`;

  if (startSeconds > 5) {
    showToast(`▶ Resuming from ${formatTime(startSeconds)}`);
  } else {
    showToast('▶ Starting playback');
  }
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

  if (_isGuestProfile()) {
    if (section) section.style.display = 'none';
    return;
  }

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

const allMediaState = {
  movie: {
    allMedia: [],
    currentPage: 1,
    isLoadingMore: false,
    hasMore: true
  },
  tv: {
    allMedia: [],
    currentPage: 1,
    isLoadingMore: false,
    hasMore: true
  }
};

function buildDiscoverProxyUrl(type, page) {
  const query = new URLSearchParams({
    language: 'en-US',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: String(page)
  });
  return `discover/${type}?${query.toString()}`;
}

async function fetchAllMediaPage(type, page) {
  const endpoint = buildDiscoverProxyUrl(type, page);
  const data = await fetchFromAPI(endpoint);
  return Array.isArray(data.results) ? data.results : [];
}

function renderAllMediaGrid(type) {
  const state = allMediaState[type];
  const grid = document.getElementById(type === 'movie' ? 'all-movies-grid' : 'all-tv-grid');
  const loadBtn = document.getElementById(type === 'movie' ? 'all-movies-load-more' : 'all-tv-load-more');
  if (!grid || !loadBtn) return;

  grid.innerHTML = '';
  const builder = type === 'movie' ? buildPosterCard : buildTVCard;
  state.allMedia.forEach(item => grid.appendChild(builder(item)));

  if (state.isLoadingMore) {
    loadBtn.textContent = 'Loading Data...';
    loadBtn.disabled = true;
  } else if (!state.hasMore) {
    loadBtn.textContent = 'No More Results';
    loadBtn.disabled = true;
  } else {
    loadBtn.textContent = 'Load More';
    loadBtn.disabled = false;
  }
}

async function loadMoreAllMedia(type) {
  const state = allMediaState[type];
  if (state.isLoadingMore || !state.hasMore) return;

  state.isLoadingMore = true;
  renderAllMediaGrid(type);
  try {
    const results = await fetchAllMediaPage(type, state.currentPage);
    state.allMedia = [...state.allMedia, ...results];
    state.currentPage += 1;
    if (!results.length) state.hasMore = false;
  } catch (e) {
    showToast('⚠ Unable to load more content right now.');
  } finally {
    state.isLoadingMore = false;
    renderAllMediaGrid(type);
  }
}

async function initAllMediaSection(type) {
  const loadBtn = document.getElementById(type === 'movie' ? 'all-movies-load-more' : 'all-tv-load-more');
  if (!loadBtn) return;

  loadBtn.addEventListener('click', () => {
    loadMoreAllMedia(type);
  });

  allMediaState[type].allMedia = [];
  allMediaState[type].currentPage = 1;
  allMediaState[type].isLoadingMore = false;
  allMediaState[type].hasMore = true;
  await loadMoreAllMedia(type);
}

function setTVHero(show) {
  const backdrop  = document.getElementById('hero-backdrop');
  const htitle    = document.getElementById('hero-title');
  const hmeta     = document.getElementById('hero-meta');
  const hdesc     = document.getElementById('hero-desc');
  const hwatch    = document.getElementById('hero-watch');
  const title = show.name || show.title || '';
  bindHeroAudioToggle();

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
  bindGlobalSearchOverlay();
  initCinematicIdleMode();
  initTVModeEnhancements();
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
  await initAllMediaSection('tv');

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

  bindRecommendationRowAutoRefresh('tv');

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
  bindGlobalSearchOverlay();
  initCinematicIdleMode();
  initTVModeEnhancements();
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
      const [show, videos] = await Promise.all([
        tmdb(`/tv/${showId}`),
        tmdb(`/tv/${showId}/videos`)
      ]);
      populateWatchTVPage(show);
      setWatchHeroTrailer(videos);

      const episodeSection = document.getElementById('tv-selector-section');
      if (episodeSection) episodeSection.style.display = 'block';

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
      const episodeSection = document.getElementById('tv-selector-section');
      if (episodeSection) episodeSection.style.display = 'none';
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

  document.getElementById('download-btn')?.addEventListener('click', () => {
    showToast('⬇ Download will be available soon');
  });

  document.getElementById('similars-btn')?.addEventListener('click', () => {
    const recSection = document.getElementById('recommendations');
    if (recSection) recSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('watch-audio-toggle')?.addEventListener('click', toggleHeroTrailerMute);

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
  if (_isGuestProfile()) {
    btn.dataset.inWatchlist = '0';
    btn.disabled = true;
    btn.style.display = 'none';
    return;
  }
  btn.disabled = false;
  btn.style.display = '';
  const pq = _profileQuery();
  const url = pq ? `/api/movies/watchlist?${pq}` : '/api/movies/watchlist';
  try {
    const res = await fetch(url, { headers: _profileHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];
    const exists = items.some(i => String(i.content_id) === String(contentId) && i.content_type === contentType);
    btn.dataset.inWatchlist = exists ? '1' : '0';
    if (btn.dataset.iconMode === '1') {
      btn.textContent = exists ? '✓' : '+';
      btn.title = exists ? 'In Watchlist' : 'Add to Watchlist';
      btn.setAttribute('aria-label', btn.title);
    } else {
      btn.textContent = exists ? '✓ IN WATCHLIST' : '+ WATCHLIST';
    }
  } catch (e) {}
}

async function toggleWatchlist(contentId, contentType, title, poster) {
  const btn = document.getElementById('watchlist-btn');
  if (!btn) return;
  if (_isGuestProfile()) {
    showToast('Guest mode does not save wishlist items');
    return;
  }
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
  const seasonSelect = document.getElementById('season-select');
  const searchInput = document.getElementById('episode-search');
  const sortBtn = document.getElementById('episode-sort');
  if (!seasonSelect) return;

  window._episodeState = window._episodeState || {
    selectedSeason: 1,
    searchQuery: '',
    sortOrder: 'asc',
    episodes: [],
    activeEpisode: null,
    showId: null,
    totalEpisodesInSeason: 0,
    availableSeasons: []
  };

  const state = window._episodeState;
  state.showId = showId;
  state.selectedSeason = Number(activeSeason) || 1;
  state.searchQuery = '';
  state.sortOrder = 'asc';
  state.episodes = [];
  state.activeEpisode = null;
  state.totalEpisodesInSeason = 0;
  state.availableSeasons = [];

  seasonSelect.innerHTML = '';

  const realSeasons = seasons.filter(s => s.season_number > 0 || s.episode_count > 0);
  state.availableSeasons = realSeasons.map(season => Number(season.season_number)).filter(Boolean);
  realSeasons.forEach(season => {
    const opt = document.createElement('option');
    opt.value = String(season.season_number);
    opt.textContent = season.season_number === 0 ? 'Specials' : `Season ${season.season_number}`;
    if (season.season_number === state.selectedSeason) opt.selected = true;
    seasonSelect.appendChild(opt);
  });

  seasonSelect.onchange = async (e) => {
    const nextSeason = Number(e.target.value) || 1;
    state.selectedSeason = nextSeason;
    state.activeEpisode = 1;
    window._currentSeason = nextSeason;
    window._currentEpisode = 1;
    await fetchAndRenderEpisodes(showId, nextSeason, null);
  };

  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = () => {
      state.searchQuery = (searchInput.value || '').trim().toLowerCase();
      renderEpisodeCards(showId);
    };
  }

  if (sortBtn) {
    sortBtn.dataset.order = state.sortOrder;
    sortBtn.textContent = state.sortOrder === 'asc' ? '↑' : '↓';
    sortBtn.onclick = () => {
      state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      sortBtn.dataset.order = state.sortOrder;
      sortBtn.textContent = state.sortOrder === 'asc' ? '↑' : '↓';
      sortBtn.setAttribute('aria-label', state.sortOrder === 'asc' ? 'Sort episodes ascending' : 'Sort episodes descending');
      renderEpisodeCards(showId);
    };
  }
}

async function fetchSeasonEpisodesViaProxy(showId, seasonNum) {
  const params = new URLSearchParams({
    language: 'en-US'
  });
  const endpoint = `tv/${showId}/season/${seasonNum}?${params.toString()}`;
  return await fetchFromAPI(endpoint);
}

function renderEpisodeCards(showId) {
  const grid = document.getElementById('episode-grid');
  const title = document.getElementById('ep-list-title');
  if (!grid || !window._episodeState) return;

  const state = window._episodeState;
  const seasonNum = Number(state.selectedSeason) || 1;
  const activeEpisode = state.activeEpisode;
  const searchQuery = (state.searchQuery || '').toLowerCase();

  if (title) title.textContent = `Season ${seasonNum} Episodes`;

  const filtered = (state.episodes || []).filter(ep => {
    if (!searchQuery) return true;
    return (ep.name || `Episode ${ep.episode_number}`).toLowerCase().includes(searchQuery);
  });

  filtered.sort((a, b) => state.sortOrder === 'asc'
    ? (a.episode_number || 0) - (b.episode_number || 0)
    : (b.episode_number || 0) - (a.episode_number || 0));

  grid.innerHTML = '';

  if (!filtered.length) {
    grid.innerHTML = '<div id="ep-empty">No episodes match your search.</div>';
    return;
  }

  filtered.forEach(ep => {
    const card = document.createElement('div');
    card.className = 'episode-card' + (ep.episode_number === activeEpisode ? ' active-ep' : '');
    card.dataset.ep = ep.episode_number;

    const still = ep.still_path ? stillUrl(ep.still_path, 'w300') : null;
    const thumb = still || window._currentShowPoster || FALLBACK_POSTER;
    const runtime = ep.runtime ? `${ep.runtime}m` : '';
    const airDate = ep.air_date || '';
    const epMeta = [runtime, airDate].filter(Boolean).join(' • ') || 'Air date unavailable';

    card.innerHTML = `
      <div class="ep-thumb">
        <img src="${thumb}" alt="Episode ${ep.episode_number}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}'">
        <div class="ep-badge">EP ${ep.episode_number}</div>
      </div>
      <div class="ep-info">
        <div class="ep-title">${ep.name || 'Episode ' + ep.episode_number}</div>
        <div class="ep-meta">${epMeta}</div>
        <div class="ep-desc">${ep.overview || 'No description available.'}</div>
      </div>
      <div class="ep-action" title="Offline">⬇</div>`;

    card.addEventListener('click', () => {
      state.activeEpisode = ep.episode_number;
      window._currentEpisode = ep.episode_number;
      window._currentSeason = seasonNum;

      grid.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active-ep'));
      card.classList.add('active-ep');

      loadTVPlayer(showId, seasonNum, ep.episode_number, 0);
    });

    grid.appendChild(card);
  });
}

async function fetchAndRenderEpisodes(showId, seasonNum, activeEpisode) {
  const grid    = document.getElementById('episode-grid');
  const title   = document.getElementById('ep-list-title');
  if (!grid) return;

  window._episodeState = window._episodeState || {
    selectedSeason: 1,
    searchQuery: '',
    sortOrder: 'asc',
    episodes: [],
    activeEpisode: null,
    showId: null
  };
  const state = window._episodeState;

  state.showId = showId;
  state.selectedSeason = Number(seasonNum) || 1;
  state.activeEpisode = activeEpisode || Number(window._currentEpisode) || 1;

  if (title) title.textContent = `Season ${seasonNum} Episodes`;
  grid.innerHTML = '<div id="ep-loading">Loading episodes…</div>';

  try {
    const data = await fetchSeasonEpisodesViaProxy(showId, seasonNum);
    const episodes = data.episodes || [];
    state.episodes = episodes;
    state.totalEpisodesInSeason = episodes.length;

    if (!episodes.length) {
      grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">No episodes found.</p>';
      return;
    }
    renderEpisodeCards(showId);

  } catch (e) {
    state.episodes = [];
    grid.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Error loading episodes.</p>';
  }
}

function loadTVPlayer(showId, season, episode, startSeconds = 0) {
  const qp = new URLSearchParams();
  qp.set('type', 'tv');
  qp.set('id', String(showId));
  qp.set('season', String(season || 1));
  qp.set('episode', String(episode || 1));
  if (window._currentShowTitle) qp.set('title', window._currentShowTitle);
  if (window._currentShowPoster) qp.set('poster', window._currentShowPoster);
  if (startSeconds > 0) qp.set('start', String(Math.floor(startSeconds)));

  window.location.href = `player.html?${qp.toString()}`;
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
    const audioBtn = document.getElementById('hero-audio-toggle');
    if (audioBtn) {
      audioBtn.style.display = 'none';
      audioBtn.textContent = '🔇';
      audioBtn.title = 'Unmute trailer';
      audioBtn.setAttribute('aria-label', 'Unmute trailer');
    }
    const trailer = selectPreferredTrailer(data);
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
        src="${buildYouTubeAutoplayEmbedUrl(trailer.key)}"
        frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen
        title="Trailer"></iframe>`;
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 1.2s';
      window._heroTrailerMuted = true;
      if (audioBtn) {
        audioBtn.style.display = 'inline-flex';
        audioBtn.textContent = '🔇';
        audioBtn.title = 'Unmute trailer';
        audioBtn.setAttribute('aria-label', 'Unmute trailer');
      }
    }, 2000);
  } catch(e) {
    const audioBtn = document.getElementById('hero-audio-toggle');
    if (audioBtn) audioBtn.style.display = 'none';
  }
}

function toggleHeroTrailerMute() {
  const watchBtn = document.getElementById('watch-audio-toggle');
  const browseBtn = document.getElementById('hero-audio-toggle');
  const isWatchPageButton = Boolean(watchBtn && watchBtn.offsetParent !== null);
  const btn = isWatchPageButton ? watchBtn : browseBtn;
  const iframe = isWatchPageButton
    ? document.getElementById('watch-trailer-iframe')
    : document.getElementById('hero-trailer-iframe');
  if (!iframe || !btn) return;
  const mutedKey = isWatchPageButton ? '_watchHeroMuted' : '_heroTrailerMuted';
  const muted = window[mutedKey] !== false;
  iframe.contentWindow?.postMessage(`{"event":"command","func":"${muted ? 'unMute' : 'mute'}","args":""}`, '*');
  window[mutedKey] = !muted;
  btn.textContent = window[mutedKey] ? '🔇' : '🔊';
  btn.title = window[mutedKey] ? 'Unmute trailer' : 'Mute trailer';
  btn.setAttribute('aria-label', btn.title);
}

function bindHeroAudioToggle() {
  const buttons = [
    document.getElementById('watch-audio-toggle'),
    document.getElementById('hero-audio-toggle')
  ].filter(Boolean);

  buttons.forEach(button => {
    if (button.dataset.heroAudioBound === '1') return;
    button.dataset.heroAudioBound = '1';
    button.addEventListener('click', toggleHeroTrailerMute);
  });
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
  if (_isGuestProfile()) {
    section.style.display = 'none';
    return;
  }
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

function _safeGetWatchHistoryItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem('watchHistory') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function _isValidTmdbId(value) {
  const id = String(value || '').trim();
  return /^\d+$/.test(id);
}

function _historySeedsByType(mediaType = 'movie', maxSeeds = 8) {
  const targetType = mediaType === 'tv' ? 'tv' : 'movie';
  const history = _safeGetWatchHistoryItems()
    .filter((item) => String(item?.type || 'movie') === targetType && _isValidTmdbId(item?.id))
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));

  const seen = new Set();
  const seeds = [];
  history.forEach((item) => {
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    seeds.push(id);
  });
  return seeds.slice(0, maxSeeds);
}

async function _fetchHistoryFallbackRecommendations(mediaType = 'movie', limit = 20) {
  const targetType = mediaType === 'tv' ? 'tv' : 'movie';
  const seeds = _historySeedsByType(targetType, 6);
  if (!seeds.length) return [];

  const watched = new Set(_historySeedsByType(targetType, 50));
  const merged = [];

  for (const seedId of seeds) {
    let results = [];
    try {
      const recData = await tmdb(`/${targetType}/${seedId}/recommendations`);
      results = Array.isArray(recData?.results) ? recData.results : [];
    } catch (e) {
      results = [];
    }

    if (!results.length) {
      try {
        const simData = await tmdb(`/${targetType}/${seedId}/similar`);
        results = Array.isArray(simData?.results) ? simData.results : [];
      } catch (e) {
        results = [];
      }
    }

    results.forEach((item) => {
      const candidateId = String(item?.id || '');
      if (!_isValidTmdbId(candidateId)) return;
      if (watched.has(candidateId)) return;
      if (merged.some((m) => String(m.id) === candidateId)) return;
      merged.push(item);
    });

    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
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
    let results = Array.isArray(data.results) ? data.results : [];

    if (!results.length) {
      results = await _fetchHistoryFallbackRecommendations(mediaType, 20);
    }

    if (mediaType === 'tv') {
      renderTVRow(results, containerId);
    } else {
      renderRow(results, containerId);
    }
  } catch (e) {
    const fallback = await _fetchHistoryFallbackRecommendations(mediaType, 20);
    if (mediaType === 'tv') {
      renderTVRow(fallback, containerId);
    } else {
      renderRow(fallback, containerId);
    }

    if (!fallback.length) {
      container.innerHTML = '<p style="color:var(--nf-muted);font-family:Share Tech Mono,monospace;font-size:0.7rem;">Recommendations are unavailable right now.</p>';
    }
  }
}

let _recommendationRowRefreshTimer = null;
let _recommendationRowListenersBound = false;

function bindRecommendationRowAutoRefresh(defaultMediaType = 'movie') {
  if (_recommendationRowListenersBound) return;
  _recommendationRowListenersBound = true;

  const refresh = () => {
    const row = document.getElementById('row-recommended');
    if (!row) return;

    const inferredType = window.location.pathname.includes('/tvshows') ? 'tv' : defaultMediaType;
    if (_recommendationRowRefreshTimer) clearTimeout(_recommendationRowRefreshTimer);
    _recommendationRowRefreshTimer = setTimeout(() => {
      loadRecommendationsRow('row-recommended', inferredType);
    }, 180);
  };

  window.addEventListener('toxibhflix:history-updated', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === 'watchHistory') refresh();
  });
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
