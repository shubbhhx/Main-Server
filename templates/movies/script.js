// ═══════════════════════════════════════════════════════════
//  CINEMATIC — Movies Script
//  TMDB API + Vidking embed + localStorage progress tracking
// ═══════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── IN-MEMORY CACHE ──────────────────────────────────────────
const _cache = {};

async function tmdb(path, params = {}) {
  // Map TMDB path to our server proxy endpoint
  let url;
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
  } else if (path.endsWith('/recommendations')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/movie/${id}/recommendations`;
  } else if (path.startsWith('/movie/')) {
    const id = path.split('/')[2];
    url = `/api/tmdb/movie/${id}`;
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

// ── PROGRESS: localStorage ───────────────────────────────────
const PROG_KEY = 'cinematic_progress';

function saveProgress(movieId, seconds) {
  const all = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  all[movieId] = { seconds: Math.floor(seconds), ts: Date.now() };
  localStorage.setItem(PROG_KEY, JSON.stringify(all));
}

function getProgress(movieId) {
  const all = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  return all[movieId] || null;
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}h ${m}m`
    : `${m}m ${s}s`;
}

// ── MESSAGE LISTENER (Vidking progress events) ───────────────
window.addEventListener('message', function (event) {
  if (!event.data || typeof event.data !== 'object') return;
  const { type, currentTime, movieId } = event.data;

  // Vidking sends: { type: 'timeupdate', currentTime: <seconds>, movieId: <tmdbId> }
  if (type === 'timeupdate' && currentTime > 5) {
    const id = movieId || window._currentMovieId;
    if (id) saveProgress(id, currentTime);
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

  // Resume check
  const saved = getProgress(movieId);
  if (saved && saved.seconds > 10) {
    const banner = document.getElementById('resume-banner');
    const label = document.getElementById('resume-time');
    if (banner && label) {
      label.textContent = formatTime(saved.seconds);
      banner.classList.add('visible');
    }
  }

  // Resume button
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    loadPlayer(movieId, saved?.seconds || 0);
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

  // ── Route through server proxy so VPN IP is used, not user's IP ──
  let src = `/proxy/player/${movieId}?color=e50914&autoPlay=true`;
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
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      title="Movie Player">
    </iframe>`;

  // Scroll player into view
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });

  showToast(startSeconds > 5
    ? `▶ Resuming from ${formatTime(startSeconds)}`
    : '▶ Starting playback — routed via server');
}
