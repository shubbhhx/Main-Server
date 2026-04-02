const TMDB_BASE = 'https://api.themoviedb.org/3';
const CACHE_TTL = 86400;

function json(data, status = 200, ttl = CACHE_TTL) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=600`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default {
  async fetch(request, env) {
    try {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, 60);

      const url = new URL(request.url);
      const path = url.pathname;
      const endpoint = path.startsWith('/') ? path.slice(1) : path;

      return await tmdb(endpoint, url.search, env);
    } catch (err) {
      return json({ error: err?.message || 'Unknown error' }, 502, 60);
    }
  },
};

async function tmdb(endpoint, query, env) {
  const TMDB_API = env.TMDB_API_KEY;
  if (!TMDB_API) {
    return new Response(JSON.stringify({ error: 'TMDB_API_KEY is not configured' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const separator = query ? '&' : '?';
  const response = await fetch(
    `${TMDB_BASE}/${endpoint}${query}${separator}api_key=${TMDB_API}&language=en-US`
  );

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public,s-maxage=86400,max-age=86400',
    },
  });
}
