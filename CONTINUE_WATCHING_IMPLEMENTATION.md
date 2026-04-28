# Continue Watching Feature Implementation

## Overview
The "Continue Watching" feature displays recently watched movies and TV shows on the ToxibhFlix homepage, allowing users to resume playback from where they left off.

---

## Architecture

### 1. Backend API Endpoint
**Route:** `GET /api/movies/continue-watching`

**Query Parameters:**
- `profile_id` (optional): Profile ID to fetch continue watching for
- `profile_name` (optional): Profile name to fetch continue watching for

**Response Format:**
```json
{
  "items": [
    {
      "id": "1396",
      "tmdbId": "1396",
      "type": "tv",
      "mediaType": "tv",
      "title": "Breaking Bad",
      "poster": "https://image.tmdb.org/t/p/w500/...",
      "season": 1,
      "episode": 3,
      "timestamp": 1200,
      "duration": 3600,
      "progress": 0.33,
      "progress_percent": 33.3,
      "last_updated": "2024-04-28T10:30:00",
      "savedAt": 1714301400000
    },
    {
      "id": "597",
      "tmdbId": "597",
      "type": "movie",
      "mediaType": "movie",
      "title": "Titanic",
      "poster": "...",
      "timestamp": 1800,
      "duration": 7200,
      "progress": 0.25,
      "progress_percent": 25,
      "last_updated": "2024-04-28T09:15:00",
      "savedAt": 1714297500000
    }
  ],
  "count": 2
}
```

**Features:**
- Filters items where `progress_percent < 90%` (hides nearly finished items)
- Filters items where `timestamp > 0` (only includes items with saved progress)
- Requires `duration > 0` (skips items without duration data)
- Returns maximum 20 items sorted by `last_updated DESC`
- Includes both fallback URLs and proper error handling

---

## Frontend Implementation

### 2. Key Functions

#### `buildContinueCard(item)`
Creates a Netflix-style poster card element for a continue watching item.

**Features:**
- Validates item data before rendering
- Displays progress bar at bottom with Netflix-style glow
- Shows episode info (S1:E3) for TV shows
- Displays remaining/watched time in overlay
- Supports lazy loading of poster images
- Fallback image handling for missing posters
- Smooth hover animations with scale effect

**Returns:** DOM element or `null` if item is invalid

#### `resumePlayback(item)`
Handles navigation to the watch page with resume support.

**Logic:**
- TV shows: Navigates to `/movies/watch-tv?id=ID&s=SEASON&e=EPISODE`
- Movies: Navigates to `/movies/watch.html?id=ID`
- Both pages automatically fetch saved progress from the server

#### `loadContinueWatching(containerId)`
Loads and renders continue watching items for fallback/compatibility.

**Features:**
- Checks if user is guest profile (hides for guests)
- Fetches from server API or falls back to local storage
- Filters out null/invalid cards
- Handles empty state by hiding section
- Error handling with fallback display

#### `loadContinueWatchingRow(containerId, sectionId)`
Main function called during page initialization (used by `initIndexPage`).

**Called in:** `initIndexPage()` → Movie browse page initialization

**Features:**
- Async data fetching with proper error handling
- Shows/hides section based on data availability
- Filters and renders up to 20 cards
- Error logging for debugging

#### `getServerContinueWatching()`
Fetches continue watching data from the backend API.

**Features:**
- Guest profile check (returns empty for guests)
- Proper error handling
- Uses profile query and headers from `_profileQuery()` and `_profileHeaders()`
- Returns empty array on API errors

---

## Database Schema

### Table: `resume_progress`
```sql
CREATE TABLE resume_progress (
    profile_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    title TEXT,
    poster TEXT,
    season INTEGER,
    episode INTEGER,
    timestamp INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    progress_percent REAL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, content_id, content_type),
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
)
```

**Index:** `idx_resume_profile_updated ON resume_progress(profile_id, updated_at DESC)`

---

## UI/UX Components

### 3. Section Layout

**HTML Structure (index.html):**
```html
<div class="row-section" id="row-continue-section" style="display:none;">
  <div class="row-title">▶ Continue Watching</div>
  <div class="poster-row" id="row-continue"></div>
</div>
```

**CSS Classes:**
- `continue-card`: Styling for individual poster cards
- `continue-progress-bar`: Progress bar container
- `continue-progress-fill`: Animated progress indicator
- `poster-card`: Base card styling with Netflix animations
- `poster-play-btn`: Play icon overlay (appears on hover)
- `poster-overlay`: Title and metadata display

### 4. Visual Features

**Hover Animation:**
- Scale: 1.1x with -6px translateY
- Glow: `0 20px 50px rgba(0,0,0,0.7), var(--glow)`
- Border: Changes to cyan on hover
- Play button: Scales from 0 to 1 with spring curve

**Progress Bar:**
- Height: 4px
- Color: Linear gradient from `#e50914` to `#ff3333`
- Glow: `0 0 12px rgba(229, 9, 20, 0.6)`
- Transition: Smooth 0.3s cubic-bezier

**Empty State:**
- Section automatically hides when no items available
- Maintains clean UI when no continue watching data

---

## Resume Playback Flow

### 5. Complete Flow

1. **User clicks Continue Watching card**
   - `resumePlayback(item)` triggered
   - Navigates to watch page with content ID

2. **Watch page loads**
   - Fetches movie/TV metadata from TMDB API
   - Calls `getServerProgress()` to fetch saved timestamp

3. **Player initializes**
   - Shows "You left off at HH:MM" banner
   - User can click "RESUME" to play from timestamp
   - Or click "START OVER" to play from beginning

4. **Playing**
   - `_pushPendingResumeProgress()` tracks playback every 5 seconds
   - Sends updates to `POST /api/movies/progress` endpoint

5. **Page navigation**
   - `_flushPendingResumeProgress(true)` called on page hide
   - Ensures final progress is saved

---

## Edge Cases & Error Handling

### 6. Handled Scenarios

| Scenario | Behavior |
|----------|----------|
| Progress > 90% | Item filtered out (not shown) |
| Missing poster | Displays fallback image |
| Missing duration | Item filtered out |
| Missing timestamp | Item filtered out |
| Invalid item data | Card returns null, filtered |
| API error | Section hidden with error logged |
| Guest profile | Section hidden (not applicable) |
| No saved items | Section hidden |
| Network error | Graceful fallback to empty state |

---

## Configuration & Limits

### 7. Settings

**Backend Filtering:**
- Max items: 20
- Progress threshold: < 90%
- Timestamp threshold: > 0
- Duration requirement: > 0
- Sort order: `updated_at DESC` (newest first)

**Frontend Rendering:**
- Max cards displayed: 20 (same as backend limit)
- Lazy load images: Yes
- Fallback poster: Configurable via `FALLBACK_POSTER`
- Animation duration: 0.6s fade-in-up

---

## Testing Checklist

- [ ] Continue watching section appears when items exist
- [ ] Section hides when no items available
- [ ] Cards display correct title, poster, progress
- [ ] TV cards show S1:E3 format correctly
- [ ] Progress bar shows accurate progress (0-100%)
- [ ] Hover animations work smoothly
- [ ] Play button appears on hover
- [ ] Click navigates to correct watch page
- [ ] Resume functionality works for both movies and TV
- [ ] Episode selection works for TV shows
- [ ] Empty state doesn't show errors
- [ ] Guest profiles don't see continue watching
- [ ] Missing posters show fallback
- [ ] Progress > 90% items are hidden

---

## Performance Considerations

- Lazy loading of poster images reduces initial load time
- Maximum 20 items limits DOM nodes and render time
- Index on `(profile_id, updated_at DESC)` optimizes queries
- Async/await prevents blocking page load
- Error handling prevents cascading failures

---

## Future Enhancements

1. Add skeleton loaders during fetch
2. Implement smart caching (5-10 min TTL)
3. Add pagination for longer lists
4. Add filtering by media type (movies/TV only)
5. Add sort options (date, alphabetical)
6. Track engagement metrics
7. Implement continue watching across devices

---

## API Integration Points

**Endpoints Used:**
- `GET /api/movies/continue-watching` - Fetch continue watching data
- `POST /api/movies/progress` - Save playback progress (auto-called by watch page)
- `GET /api/movies/progress` - Fetch resume timestamp (auto-called by watch page)

**Headers Required:**
- `X-Profile-Id`: Profile ID (if using header instead of query param)

---

## Code Locations

- **Backend:** `app.py` lines 761-804
- **Frontend Functions:** `templates/movies/script.js` 
  - `buildContinueCard()` - line 2428
  - `resumePlayback()` - line 2462
  - `loadContinueWatching()` - line 2470
  - `loadContinueWatchingRow()` - line 3410
  - `getServerContinueWatching()` - line 540
- **Styles:** `templates/movies/style.css` lines 933-955
- **HTML:** `templates/movies/index.html` lines 41-44 (section) + script

---

## Troubleshooting

**Continue Watching doesn't appear:**
1. Check if user is guest profile (guests don't see it)
2. Verify user has watched content (with timestamp > 0)
3. Check browser console for errors
4. Verify API endpoint returns data

**Progress bar incorrect:**
1. Check if `progress_percent` is in valid range (0-100)
2. Verify `timestamp < duration`
3. Check database for corrupt data

**Resume not working:**
1. Check if watch.html page is loaded correctly
2. Verify API progress endpoint works
3. Check if player supports currentTime setting

---

**Last Updated:** April 28, 2024
**Version:** 1.0
