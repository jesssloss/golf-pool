# TODOS

## Accessibility: ARIA landmarks and roles

**What:** Add `role="table"`, `aria-label` on key regions (leaderboard, draft board, navigation), `aria-live="polite"` on the draft timer and score update elements.

**Why:** Screen readers can't distinguish sections. The draft timer countdown and live score updates are invisible to assistive technology.

**Pros:** Makes the app usable for screen reader users. Good practice.

**Cons:** ~30 min of work, no visual impact.

**Context:** The app has zero ARIA attributes. The FlipScore component and draft timer are the highest-priority targets for `aria-live`.

**Depends on:** Nothing.

## Offline/Network Error Handling

**What:** Add a connection status indicator ("Live" / "Reconnecting...") and graceful degradation when the network drops. Show stale-data warning when polling/realtime fails.

**Why:** Users watching the Masters will have spotty cell service. The app currently fails silently: realtime subscriptions disconnect, polling fails, and users see stale data with no indication.

**Pros:** Prevents confusion when data stops updating. Builds trust during the most critical usage window (tournament weekend).

**Cons:** ~1 hour of work, touches Leaderboard, Draft, and Lobby components.

**Context:** Supabase realtime has built-in reconnection, but the UI doesn't surface connection state. The 60s auto-refresh interval on the leaderboard helps, but users don't know if it's working.

**Depends on:** Nothing.
