# Pimento

An open source, real-time golf tournament pool app. Create a pool, draft golfers with friends, and track live scores throughout any PGA tournament.

Built with Next.js, Supabase, and Tailwind CSS. Designed for friend groups who want a simple, good-looking way to run a golf pool without spreadsheets.

## What It Does

A **commissioner** creates a pool and invites friends. Everyone drafts golfers (either live with a timer or offline via the commissioner). Once the tournament starts, scores update automatically from ESPN. A leaderboard ranks teams by their best golfers' combined scores, handles missed cuts and withdrawals, and calculates payouts with tie-splitting.

Players get a shareable public URL to track scores on their phone. No accounts needed.

## Features

### Pool Creation & Configuration
- Configurable team size (how many golfers each player drafts)
- Best N of M scoring (e.g., best 4 of 6 golfers count toward your total)
- Custom missed cut penalty (e.g., +10 per unplayed round for cut/WD/DQ golfers)
- Buy-in amount with payment method tracking (e-transfer, PayPal, cash)
- Configurable payout positions and percentages (e.g., 1st: 60%, 2nd: 25%, 3rd: 15%)
- Drop deadline by round (allow one roster swap before a configurable round)

### Two Draft Modes
- **Live Snake Draft** -- Real-time pick-by-pick draft with configurable timer (30 seconds to 5 minutes, or unlimited). Pick order snakes each round. Supabase Realtime pushes updates to all participants instantly.
- **Manual Entry** -- Commissioner collects picks offline (group chat, text, email) and enters them all at once via a batch interface. Golfers can be shared across teams. Players get a read-only public URL to follow scores.

### Live Scoring
- Automatic score updates from ESPN's PGA leaderboard API
- Per-round score breakdowns (R1, R2, R3, R4)
- Golfer status tracking (active, cut, withdrawn, DQ)
- Cron endpoint for scheduled score refresh during tournament play
- Optional hole-by-hole scorecards via Slash Golf API with aggressive caching to stay within free tier limits (240 calls/month budget with automatic tracking)

### Leaderboard
- Teams ranked by best N golfers' combined score to par
- Tie handling (tied teams share the same rank)
- Per-golfer breakdown showing round scores, thru-hole, and status
- Clickable team rows navigate to detailed team view
- Leader gets a highlighted card, winner gets a victory card with payout info
- Responsive layout (table on desktop, cards on mobile)

### Team Detail Pages
- Expandable hole-by-hole scorecard for each golfer
- Front 9 / Back 9 layout with par row
- Visual scoring indicators (green circles for birdies/eagles, red for bogeys/doubles)
- Course hole names displayed below scorecard
- Drop golfer functionality (within configured deadline)

### Payment & Payout Tracking
- Commissioner toggles buy-in paid status per player
- Payment method displayed with instructions (auto-generates PayPal links)
- Payout calculation with tie-splitting across positions
- Commissioner records payout status (pending/paid/sent)

### Public Sharing
- Custom slug URLs for manual-mode pools (e.g., `yoursite.com/p/my-pool`)
- Read-only public leaderboard and team detail pages
- Copy-to-clipboard share button
- No authentication required for viewers

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime (subscriptions + polling fallback) |
| Styling | Tailwind CSS |
| Fonts | Playfair Display (headings), Inter (body) |
| Scoring Data | ESPN PGA API (primary), Slash Golf via RapidAPI (hole-by-hole, optional) |
| Auth | Cookie-based session tokens (pool-scoped, no OAuth) |
| Hosting | Vercel (recommended) |

## Quick Start

### Prerequisites

- Node.js 18+
- A Supabase project ([free tier](https://supabase.com) works)

### 1. Clone and install

```bash
git clone https://github.com/jesssloss/pimento.git
cd pimento
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Open the SQL Editor in your Supabase dashboard
3. Run each file in `supabase/migrations/` in order (they're numbered chronologically)
4. Copy your project URL, anon key, and service role key from Settings > API

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only, never exposed to client) |
| `RAPIDAPI_KEY` | No | For hole-by-hole scorecards via Slash Golf |
| `CRON_SECRET` | No | Bearer token for the `/api/cron/scores` endpoint |

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deploy

```bash
npx vercel
```

Or connect your GitHub repo to Vercel for automatic deployments. Set the environment variables in the Vercel dashboard.

To enable automatic score updates during a tournament, set up a cron job that hits `/api/cron/scores` with a `Bearer <CRON_SECRET>` authorization header every 1-5 minutes.

> **Note:** Vercel Hobby plans only support daily cron schedules. For live score updates during a tournament, use an external cron service (e.g., [cron-job.org](https://cron-job.org)) to hit the endpoint every 1-5 minutes.

## Architecture

```
src/
  app/
    api/                    # API routes (pool CRUD, draft, scoring, payouts)
      cron/scores/          # Scheduled score refresh endpoint
      pools/[id]/
        draft/              # Draft start, pick, batch-pick, finalize
        hole-scores/        # Slash Golf API with caching
        scores/refresh/     # Manual score refresh
        teams/              # Player management
    create/                 # Pool creation form
    join/[code]/            # Join pool via invite code
    p/[slug]/               # Public read-only pages
    pool/[id]/              # Authenticated pool pages (lobby, draft, team detail)
  components/               # Leaderboard, TeamCard, draft UI, status badges
  lib/
    data/                   # Tournament field, Slash Golf player ID mappings
    scores/                 # ESPN and Slash Golf API providers
    supabase/               # Client and server Supabase helpers
    utils/                  # Scoring calculation, snake draft order, tie/payout logic
    constants/              # UI copy
  types/                    # TypeScript interfaces

supabase/
  migrations/               # SQL migrations (run in order)
```

## Scoring Logic

Team scores are calculated as the sum of the **best N golfers** on each team, where N is the pool's `scoring_players` setting.

For golfers who miss the cut, withdraw, or are disqualified:
- Actual completed round scores count normally
- Each unplayed round adds the pool's `missed_cut_score` penalty (e.g., +10 per round)
- A golfer who is cut after Round 2 with a missed cut penalty of +10 would add +20 for Rounds 3 and 4

Dropped golfers are excluded from scoring entirely.

Ties are handled at both the leaderboard and payout level. Tied teams receive the same rank, and their combined payout percentages are split equally.

## Hole-by-Hole Scorecards (Optional)

The app can show detailed per-hole scoring using the [Slash Golf API](https://rapidapi.com/slashgolf/api/live-golf-data) via RapidAPI.

- **Free tier**: 250 calls/month
- **Built-in budget management**: The app tracks API usage in a `api_usage` table and enforces a 240 call/month cap (10-call buffer)
- **Caching strategy**: Complete rounds are cached permanently. In-progress rounds are re-fetched after 10 minutes. No API calls are made when the tournament isn't running.
- **Graceful degradation**: Without a RapidAPI key, or when the budget is exhausted, the app falls back to showing round totals only

To enable: sign up at [rapidapi.com](https://rapidapi.com), subscribe to "Live Golf Data," and add your key as `RAPIDAPI_KEY`.

## Customizing for Your Tournament

The app ships with an example PGA tournament field. To use a different tournament:

1. **Golfer field**: Update `src/lib/data/masters-field.ts` with your tournament's players and world rankings
2. **Course par**: If your course par is not 72, update the value in `src/lib/scores/espn.ts`
3. **Hole data**: Update `COURSE_PARS` and `COURSE_HOLE_NAMES` arrays in the team detail pages (`src/app/p/[slug]/team/[teamId]/page.tsx` and `src/app/pool/[id]/team/[teamId]/page.tsx`)
4. **Slash Golf IDs**: If using hole-by-hole scoring, update `src/lib/data/slashgolf-ids.ts` with player ID mappings for the Slash Golf API
5. **ESPN event**: The ESPN integration pulls whatever PGA event is currently active. No configuration needed if your tournament is on the PGA Tour schedule.

## Database Schema

The app uses 9 tables with Row Level Security enabled:

| Table | Purpose |
|---|---|
| `pools` | Pool configuration, status, invite codes, commissioner tokens |
| `teams` | Player entries with session tokens and draft positions |
| `draft_state` | Current pick number, timer state for live drafts |
| `draft_picks` | Complete pick history |
| `team_golfers` | Team rosters with drop tracking |
| `golfer_scores` | ESPN score data (summary + per-round rows) |
| `payout_rules` | Position/percentage pairs per pool |
| `payments` | Buy-in and payout status tracking |
| `hole_scores` | Cached hole-by-hole data from Slash Golf |
| `api_usage` | API call budget tracking |

All tables cascade delete from `pools`, so deleting a pool cleans up everything.

## Security Model

This app is designed for **trusted friend groups**, not public multi-tenant use:

- **Pool access**: Protected by invite codes (join) and commissioner tokens (admin actions)
- **Session management**: Cookie-based, scoped per pool. No OAuth or user accounts.
- **Database security**: Row Level Security in Supabase. Anon role has read-only access. All writes go through API routes using the service role key server-side.
- **Sensitive fields**: `commissioner_token` and `session_token` columns are revoked from the anon role at the column level

If you need full authentication, consider adding [Supabase Auth](https://supabase.com/docs/guides/auth) or [NextAuth](https://next-auth.js.org/).

## Contributing

Contributions welcome. Please open an issue first for anything beyond a small bug fix.

## License

MIT
