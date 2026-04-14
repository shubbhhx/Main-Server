const TMDB_API_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function cacheControlForPath(pathname) {
  const normalized = String(pathname || "").toLowerCase();
  // Trending changes quickly; keep it on a shorter edge/browser cache.
  if (normalized.includes("/trending")) {
    return "public, max-age=3600";
  }
  return "public, max-age=86400";
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function toImageUrl(path) {
  if (!path) return null;
  if (typeof path !== "string") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${IMG_BASE}/${path.replace(/^\/+/, "")}`;
}

function withFullImageUrls(value) {
  if (Array.isArray(value)) {
    return value.map(withFullImageUrls);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, raw] of Object.entries(value)) {
    result[key] = withFullImageUrls(raw);
  }

  if (Object.prototype.hasOwnProperty.call(value, "poster_path")) {
    result.poster = toImageUrl(value.poster_path);
  }

  if (Object.prototype.hasOwnProperty.call(value, "backdrop_path")) {
    result.backdrop = toImageUrl(value.backdrop_path);
  }

  if (Object.prototype.hasOwnProperty.call(value, "profile_path")) {
    result.profile = toImageUrl(value.profile_path);
  }

  return result;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const apiKey = env.TMDB_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: "TMDB_API_KEY is not configured" }, 500);
    }

    const incomingUrl = new URL(request.url);
    const endpoint = incomingUrl.pathname.replace(/^\/+/, "");
    const tmdbUrl = new URL(`${TMDB_API_BASE}/${endpoint}`);

    for (const [k, v] of incomingUrl.searchParams.entries()) {
      tmdbUrl.searchParams.set(k, v);
    }

    if (!tmdbUrl.searchParams.has("api_key")) {
      tmdbUrl.searchParams.set("api_key", apiKey);
    }

    tmdbUrl.searchParams.set("include_image_language", "en,null");

    try {
      const upstream = await fetch(tmdbUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Cloudflare-Worker",
        },
      });

      const text = await upstream.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        return jsonResponse(
          { error: "TMDB returned non-JSON response", status: upstream.status },
          upstream.status || 502
        );
      }

      const cleanPayload = withFullImageUrls(payload);
      const cacheControl = cacheControlForPath(incomingUrl.pathname);

      const newResponse = new Response(JSON.stringify(cleanPayload), {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...CORS_HEADERS,
          "Cache-Control": cacheControl,
        },
      });

      // Cache only successful responses to avoid pinning transient errors.
      if (upstream.ok) {
        await cache.put(cacheKey, newResponse.clone());
      }

      return newResponse;
    } catch (error) {
      return jsonResponse(
        {
          error: "Worker failed to fetch TMDB",
          details: error instanceof Error ? error.message : String(error),
        },
        502
      );
    }
  },
};
