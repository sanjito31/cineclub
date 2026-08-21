# Cineclub Implementation Plan

## Summary

Cineclub should be implemented as a **server-authoritative room state machine** backed by normalized PostgreSQL tables. The browser can handle temporary selection/voting UI state, but joining, submissions, phase transitions, vote validation, finalization, and reveals must be validated server-side.

The source design establishes four user-facing phases—onboarding, selection, voting, and reveal—and relies heavily on room membership plus asynchronous Letterboxd data. The proposed database section has the right basic entities, but votes, duplicate movie selections, room progress, and reveal state need more normalization.

## Current implementation status

Updated August 20, 2026.

* **Chunk 1 is complete.** Prisma is connected to Supabase PostgreSQL, the schema is migrated, Supabase SSR authentication and profiles are implemented, and authenticated users can create or join an empty room.
* **Chunk 2 is complete.** Room creation, short codes, joining, capacity checks, roster locking, host controls, progress UI, and server-side phase transitions are implemented and covered by concurrency and authorization tests.
* **Chunk 3 is mostly complete.** Participants can search TMDB through a server-owned endpoint, submit atomic nominations before the roster is locked, and automatically advance the room to voting once the roster is locked and everyone has submitted. Same-user duplicate selections are rejected; cross-participant duplicates remain anonymous warnings and share one `room_movie`. The “someone already watched this” warning is **not done** and is deferred.
* **Chunk 4 is complete.** Participants rank nominated movies on `/rooms/[code]/vote` with grouped coverage when the room requires it, Letterboxd movie cards, TMDB overviews on nomination groups, and an immutable ballot. The last ballot advances VOTING → FINALIZING. Coverage uses the same `min(P, M)` ranking floor and every-participant coverage math on the client and server. There is no FINALIZING page yet (Chunk 5), so a refresh after the last ballot leaves `/vote` for the lobby.
* Authentication now uses **Supabase Magic Links instead of a typed email OTP code**. Room-specific destinations are preserved through authentication, while sign-ins without a selected room land on `/dashboard`.
* The authenticated dashboard lists active rooms the user hosts, active rooms they joined, and completed rooms from either role. Room cards link directly to their lobby, so returning users do not need to remember a room code.
* Profile onboarding supports an optional Letterboxd username. Watchboxd lookup runs before submission, polls pending `202` responses, blocks submission while checking, reports failures, and previews the matched avatar and canonical username.
* Watchboxd watchlist, watched-history, overlap, movie, and job methods share reusable `200`/`202`/`404`/unavailable handling and bounded polling. HTTP `200` with `data: null` and `meta.jobs` is treated as pending, the same as `202`. Selection search returns TMDB snapshots and TMDB ratings immediately, plus a Letterboxd rating when Watchboxd is ready or a pending job id when it is not. The browser polls Cineclub rating and overlap endpoints and silently fills Letterboxd ratings and overlap suggestions without blocking search or nomination.
* Selection lives on `/rooms/[code]/select`, separate from the lobby. Search results paginate five at a time, open TMDB in a new tab, and show poster, title, year, TMDB rating, and Letterboxd rating. Ratings use logo pills (TMDB blue, Letterboxd green, translucent fills, lighter outlines, white scores). Overlap suggestions sit below the slots: top 10 shared watchlist films with poster, title, year, and Letterboxd rating, linking to Letterboxd.
* Voting lives on `/rooms/[code]/vote`. When coverage is on, nominations are grouped by person; select at least one film per person (extras allowed); a green check marks a covered group; selecting a shared `roomMovieId` once covers all its nominators; the rank list appears only after coverage. When coverage is off, movies move from an unranked pool into the ranked list. Both modes still require `min(P, M)` ranks plus an irreversible checkbox. Native drag reorder plus up/down/remove. Every movie card is a whole-card Letterboxd link (new tab) with a Letterboxd rating pill; Rank/Select/Remove/Up/Down do not navigate. Per-person nomination cards show TMDB overviews fetched live from movie-details by `tmdbId` in `getVotingBallotContext` (Prisma `overview` is not selected on this path). Ranking cards are compact: poster, title/year, nominated-by, and the rating pill; they omit overviews. Nullable `room_movies.overview` exists from a later nomination persist (`20260820190000_add_room_movie_overview` applied), but the vote page does not depend on it.
* Current automated checks cover room-code validation, safe redirect destinations, optional Letterboxd usernames, lifecycle transition rules, dashboard room grouping, idempotent joining and locking, capacity races, host authorization, locked rosters, transactional phase transitions, TMDB search normalization, async polling, Watchboxd pending envelopes and decoders, nomination validation, concurrent shared-movie upserts, last-submitter voting transitions, overlap top-10, silent Letterboxd rating fill, ballot rank validation, participant coverage, immutable and concurrent ballot submits, last-submitter finalizing transitions, ranking UI helpers, and voting UI. Lint, TypeScript, tests, and the production build pass.

---

# 1. Core Architecture Decisions

### Authentication and profiles

Use Supabase Auth exclusively for identity and email Magic Links. The implementation calls `signInWithOtp`, which sends a Magic Link with the current email template, then completes the PKCE/token-hash callback on the server. Validate the cookie-backed session with `getClaims` rather than trusting client session data.

Create an application `Profile` row keyed by the Supabase user's UUID:

* `id` → `auth.users.id`
* `display_name`
* `letterboxd_username`
* timestamps

Do **not** copy the user's email into every application table or into `Room.owner_email`; Supabase Auth remains the source of truth for email. A profile table referencing the primary key of `auth.users` is the supported Supabase pattern.

The Letterboxd API can confirm that a username exists, but unless it actually authenticates ownership, treat the username as a **claimed Letterboxd profile**, not a verified identity.

The current onboarding UI checks claimed usernames through the server-side Watchboxd client. A successful lookup canonicalizes the stored username and displays the returned avatar and username, but it does not prove ownership of that Letterboxd account.

### Room creation before login

Preserve the requested UX but do not create anonymous database rooms.

1. User enters room settings.
2. Keep that configuration in same-origin browser storage so it survives a Magic Link opening in a new tab.
3. If there is no valid Supabase session cookie, perform Magic Link authentication. Existing sessions skip this step.
4. After successful authentication, create the room, generate its code, and add the host as its first participant in one transaction.

This eliminates abandoned unauthenticated room rows while producing the same visible flow described in the design.

### Authenticated dashboard

When authentication does not carry a specific create/join destination, redirect to `/dashboard` rather than the public marketing page. The dashboard groups room memberships into:

* active rooms owned by the user
* active rooms joined by the user
* completed rooms the user hosted or joined

The dashboard is server-rendered from the authenticated user's room memberships. Room codes remain visible for sharing, but opening an existing room does not require re-entering its code.

### Room code

Keep both:

* immutable UUID `room_id` as the real primary key
* short unique `room_code` for links and joining

The code is a public locator, not an authorization mechanism.

### Room lifecycle

Do not store counters such as `phase2_completed = 7`.

Use:

`SELECTION → VOTING → FINALIZING → REVEAL → COMPLETE`

Onboarding is participant-specific and therefore does not need to be a global room phase.

Progress is derived from participant submission timestamps.

A crucial missing concept is **roster locking**. The app cannot determine that "everyone has submitted" while new users are still allowed to join.

Therefore:

1. Participants may join during selection.
2. Host can lock the roster, or an optional join deadline locks it.
3. Membership cannot change afterward.
4. Once locked and every participant has submitted selections → `VOTING`.
5. Once every participant has submitted a ballot → `FINALIZING`.
6. Once final results exist → `REVEAL`.

All transitions happen server-side inside transactions.

---

# 2. Recommended Database

## `profiles`

| Column                | Purpose                  |
| --------------------- | ------------------------ |
| `id UUID PK`          | Supabase `auth.users.id` |
| `display_name`        | Required                 |
| `letterboxd_username` | Nullable                 |
| `created_at`          |                          |
| `updated_at`          |                          |

Do not store room membership here.

---

## `rooms`

| Column                         | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `id UUID PK`                   | Internal identity                   |
| `code TEXT UNIQUE`             | Short join code                     |
| `owner_id UUID FK profiles`    | Host                                |
| `name`                         | Room name                           |
| `phase`                        | Room state enum                     |
| `max_participants`             | Capacity                            |
| `selections_per_user`          | Number of available selection slots |
| `require_participant_coverage` | Voting rule                         |
| `roster_locked_at`             | Freezes membership                  |
| `join_deadline`                | Nullable                            |
| `selection_deadline`           | Nullable                            |
| `voting_deadline`              | Nullable                            |
| `finalized_at`                 | Nullable                            |
| `created_at` / `updated_at`    |                                     |

Do not store a `members` array.

Do not store completion counters.

Deadlines should initially be **constraints/host decision points**, not autonomous destructive actions. If someone misses one, the host can extend it. Avoid automatically dropping users or ballots in the MVP.

---

## `room_participants`

| Column                         | Purpose                     |
| ------------------------------ | --------------------------- |
| `id UUID PK`                   | Domain participant identity |
| `room_id FK`                   |                             |
| `user_id FK profiles`          |                             |
| `joined_at`                    |                             |
| `selection_submitted_at`       | Nullable                    |
| `voting_submitted_at`          | Nullable                    |
| `letterboxd_username_snapshot` | Username used for this room |

Constraint:

`UNIQUE(room_id, user_id)`

There is no `current_phase`. The timestamps tell you exactly what that participant has completed.

Snapshotting the Letterboxd username prevents someone's later profile edit from unexpectedly changing overlap/watched calculations for an active room.

---

# 3. Movie Selection Model

The proposed `Selects` table currently mixes movie metadata, nomination ownership, votes, vote totals, and rankings. Split those concepts.

## `room_movies`

One unique movie per room.

| Column              | Purpose                             |
| ------------------- | ----------------------------------- |
| `id UUID PK`        |                                     |
| `room_id FK`        |                                     |
| `tmdb_id`           | Canonical movie identifier          |
| `title`             | Snapshot                            |
| `release_year`      | Snapshot                            |
| `poster_path`       | Snapshot                            |
| `letterboxd_slug`   | Nullable                            |
| `letterboxd_rating` | Nullable                            |
| `rating_fetched_at` | Nullable                            |
| `letterboxd_job_id` | Nullable while a 202 job is pending |

Constraint:

`UNIQUE(room_id, tmdb_id)`

This is where deduplication occurs.

## `nominations`

Records **who selected a movie**.

| Column           | Purpose                 |
| ---------------- | ----------------------- |
| `id UUID PK`     |                         |
| `room_id`        |                         |
| `participant_id` | Selector                |
| `room_movie_id`  | Selected movie          |
| `slot_index`     | Original selection slot |
| `created_at`     |                         |

Constraints:

* `UNIQUE(participant_id, slot_index)`
* `UNIQUE(participant_id, room_movie_id)`

Two people may therefore nominate the same `room_movie`.

This preserves duplicate-selector information while presenting only one copy of the movie during voting.

Selection submission should be a single atomic transaction:

1. validate room/participant
2. validate number of selections
3. upsert each `room_movie`
4. create nominations
5. mark `selection_submitted_at`
6. check whether room can advance

The warnings about duplicates and previously watched movies remain warnings only, as specified.

---

# 4. Voting Model

Votes must not live on movie rows.

## `ballots`

* `id`
* `room_id`
* `participant_id`
* `submitted_at`

Constraint:

`UNIQUE(room_id, participant_id)`

## `ballot_ranks`

* `ballot_id`
* `room_movie_id`
* `rank`

Constraints:

* `UNIQUE(ballot_id, rank)`
* `UNIQUE(ballot_id, room_movie_id)`

Once submitted, ballots are immutable.

### Required ballot validation

Let:

* `P` = locked participant count
* `M` = unique room movie count

Require at least:

`min(P, M)` ranked movies.

Within those required ranks, the nominations associated with the ranked movies must collectively represent every participant when `require_participant_coverage = true`.

A movie nominated by Alice and Bob counts toward coverage for both.

This resolves an otherwise impossible edge case where duplicate nominations mean there are fewer unique movies than participants.

---

# 5. Vote Aggregation

The phrase "ranked choice voting" does not specify an algorithm capable of producing the complete master ordering required later.

For the MVP, use a **fixed-scale Borda-style score** because it:

* accepts partial rankings
* produces a ranking of every movie
* is simple to explain and test
* preserves optional additional rankings

For `M` unique movies:

`points = M - rank + 1`

Unranked movies receive `0`.

Sum points across ballots and sort descending.

Tie breakers:

1. Letterboxd average rating
2. stable random tiebreak value generated during finalization

The random value must be persisted so refreshing/retrying finalization never changes the result.

---

# 6. Selecting the Final Movies

The design requests one winning movie from each participant while also allowing duplicate nominations. These requirements mean the final list **cannot always contain exactly the same number of unique movies as participants**.

Use this deterministic rule:

1. Start with the globally ranked movie list.
2. Track which participants are already represented.
3. Walk downward through the ranking.
4. Add a movie if it represents at least one participant not yet represented.
5. Mark every nominator of that movie as represented.
6. Stop when all participants are represented or no movies remain.

Normally this produces approximately one movie per person. If two people nominated the same winning movie, the final unique list can legitimately be shorter.

That is preferable to inventing duplicate final entries.

---

# 7. Finalization and Letterboxd 202 Responses

The Letterboxd API explicitly uses persistent cached snapshots and may return asynchronous `202` jobs that require polling.

Do not hold a Next.js request open while waiting.

Finalization should be idempotent:

1. Room enters `FINALIZING`.
2. Determine which movie ratings are missing.
3. Request them from Watchboxd.
4. Store returned job IDs for pending responses.
5. Return `202` from Cineclub's finalization endpoint while anything remains unresolved.
6. Client periodically retries.
7. Once data is ready, calculate aggregation once.
8. Persist immutable results.
9. Run the spooky-ordering interface.
10. Move room to `REVEAL`.

If Letterboxd has no rating after a completed lookup, treat the rating as unavailable and proceed to the random tiebreaker.

Define the spooky algorithm behind a simple interface:

`orderFinalists(movies) -> ordered movie IDs`

Until the real algorithm exists, preserving aggregate order can be the development implementation.

---

# 8. Results and Reveal

## `room_movie_results`

One immutable result row per unique movie after finalization:

* `room_id`
* `room_movie_id`
* `aggregate_score`
* `aggregate_rank`
* `tie_break_rating`
* `tie_break_random`
* `is_finalist`
* `final_order` nullable
* `scheduled_reveal_at` nullable
* `revealed_at` nullable

The source currently describes both scheduled reveal dates and a host-controlled reveal button. Resolve that as:

**`scheduled_reveal_at` = earliest time the host is allowed to reveal that movie.**

The countdown therefore counts down until the next reveal becomes available; it does not automatically expose the movie.

Host reveal transaction:

1. verify current user owns room
2. find next finalist
3. verify its scheduled time has arrived
4. verify at least 24 hours since previous reveal
5. mark `revealed_at`
6. return the newly revealed movie

After the final reveal, set room to `COMPLETE`.

### Spoiler protection

Do not send unrevealed movie titles, posters, TMDB IDs, or final ordering to the browser and hide them with CSS.

The server response itself must exclude unrevealed result data.

---

# 9. External Data Boundaries

Keep Watchboxd's watchlists, watched history, and overlap data outside the Cineclub database unless a later performance need justifies caching them. The existing API already owns persistent snapshots and overlap computation.

Cineclub should persist only data needed to reproduce the room:

* participant Letterboxd username snapshot
* movie metadata used by the room
* Letterboxd rating used for tie breaking

TMDB and Watchboxd calls should go through server-side Cineclub services so API credentials and integration behavior remain out of UI components.

---

# 10. Database / Server Safety

Use Prisma only from server-side Next.js code.

For Supabase-hosted PostgreSQL, Prisma supports Supabase's pooled database connection; configure a server/runtime connection separately from migration/admin access as appropriate.

Every mutation must re-check:

* authenticated user
* room membership
* room phase
* ownership when host-only
* roster state
* submission state

Use database transactions for:

* joining at capacity
* locking roster
* selection submission
* ballot submission
* phase transition
* finalization write
* reveal

Enable RLS on exposed Supabase tables even if normal access goes through Prisma; Supabase recommends RLS for exposed schemas.

---

# Implementation Roadmap

## Chunk 1 — Foundation — Complete

**Dependency: none**

Backend/DB:

* [x] configure Prisma + Supabase PostgreSQL
* [x] implement schema above
* [x] migrations and indexes
* [x] Supabase SSR authentication with cookie refresh and server-side claim validation
* [x] Magic Link request and callback flow with safe destination preservation
* [x] profile creation/update
* [x] optional Letterboxd username validation through Watchboxd
* [x] authorization helpers
* [x] room lifecycle enum and transition guards

Frontend, in parallel:

* [x] base app shell
* [x] Create Room flow with browser-persisted draft and authenticated review step
* [x] Join Room/code flow
* [x] Magic Link UI and check-your-email state (changed from typed OTP UI)
* [x] profile onboarding UI with Letterboxd lookup states and matched-profile preview
* [x] authenticated room dashboard and default post-login destination

**Milestone achieved:** authenticated user can create or join an empty room and reopen it from the dashboard.

---

## Chunk 2 — Room Membership and State Machine — Complete

**Depends on Chunk 1**

Backend:

* [x] room creation as an atomic nested write that also adds the host participant
* [x] collision-resistant short-code generation with retry handling
* [x] idempotent participant joining
* [x] capacity, join-deadline, and existing-lock enforcement in a serializable transaction
* [x] roster locking mutation
* [x] server-side phase transition service

Frontend, in parallel:

* [x] initial room lobby
* [x] participant list
* [x] host controls
* [x] waiting/progress UI
* [x] join confirmation, share URL display, and copy/share controls

Tests:

* [x] duplicate joining
* [x] capacity race
* [x] non-owner host actions
* [x] locked roster behavior

**Milestone achieved:** a stable participant roster can progress through room states correctly.

---

## Chunk 3 — Movie Selection — Mostly complete

**Depends on room contracts; work can split three ways**

**Agent A — integration**

* [x] TMDB search service
* [x] Watchboxd user lookup, watchlist, watched-history, overlap, movie, and job methods
* [x] reusable `200`/`202`/`404`/unavailable handling and bounded polling for movie/finalization workflows, including `200` + `data: null` + `meta.jobs` pending envelopes
* [x] overlap suggestions from participant Letterboxd usernames, top 10, with client polling for pending Watchboxd jobs
* [x] TMDB search ratings plus non-blocking Letterboxd rating fill (poll until ready, then silently fill)
* [ ] room-member watched-list warnings (“someone already watched this”) — **deferred; come back later.** Watchboxd watched lists often omit TMDB ids until they resolve, so this is not reliable enough to ship yet.

**Agent B — backend**

* [x] `room_movies` and `nominations` database models and constraints
* [x] nomination submission transaction
* [x] duplicate detection service
* [x] selection validation
* [x] selection completion transition (voting still waits until the roster is locked)

**Agent C — frontend**

* [x] selection slots on `/rooms/[code]/select`, separate from the lobby
* [x] search UI (posters, 5 results per page, TMDB links, Choose stays separate)
* [x] replace/remove actions
* [x] overlap suggestions (poster, title, year, Letterboxd rating; row opens Letterboxd)
* [ ] watched warnings — deferred with Agent A
* [x] duplicate warnings (anonymous: already chosen by someone else)
* [x] TMDB and Letterboxd rating pills (logos, translucent brand fills, lighter outlines, white scores)

**Milestone achieved:** every participant can submit selections; once the roster is locked and everyone has submitted, the room automatically reaches voting. Watched-list warnings are the remaining Chunk 3 follow-up.

---

## Chunk 4 — Voting — Complete

Can begin as soon as the nomination schema/API contract is frozen.

Backend:

* [x] ballot API: Prisma ballot schema/constraints already existed; `submitBallotAction` accepts FormData `code` plus `ranks` JSON `{ roomMovieId, rank }[]` (1-based, contiguous, unique)
* [x] coverage validation: at least `min(P, M)` ranks; when `requireParticipantCoverage`, ranked movies’ nominators must cover every locked participant; a shared nomination counts for all nominators
* [x] atomic immutable ballot write plus `votingSubmittedAt` (no edit after submit)
* [x] voting completion transition: last ballot moves VOTING → FINALIZING
* [x] vote-page overviews fetched live from TMDB movie-details by `tmdbId` in `getVotingBallotContext` (Prisma `overview` is not selected on this path). Nullable `room_movies.overview` exists from a later nomination persist; migration `20260820190000_add_room_movie_overview` is applied, but the vote page does not depend on that column.

Frontend, in parallel:

* [x] ranking UI on `/rooms/[code]/vote`
* [x] grouped nominations when coverage is on: select ≥1 film per person (extras allowed); green check when a group is satisfied; a shared `roomMovieId` selected once satisfies all its nominators; rank list appears only after coverage
* [x] unranked pool → ranked list when coverage is off; still `min(P, M)`
* [x] native drag reorder plus up/down and remove
* [x] whole-card Letterboxd link (new tab) and Letterboxd rating pill on every movie card; Rank/Select/Remove/Up/Down do not navigate
* [x] TMDB overviews on per-person nomination cards only; ranking cards are compact (poster | title/year + nominated-by + pill) and omit overviews
* [x] minimum-ranking indicator
* [x] participant-coverage validation feedback
* [x] irreversible submission confirmation (checkbox required with coverage + minimum ranks)

Tests:

* [x] ballot rank validation
* [x] participant coverage, including shared nominations
* [x] immutable and concurrent ballot submits
* [x] last-submitter VOTING → FINALIZING transition
* [x] ranking UI helpers, grouped coverage, and ballot-context mapping

**Milestone achieved:** every participant can submit a valid immutable ballot. The last voter advances the room to FINALIZING; there is no FINALIZING page yet (Chunk 5), so a refresh after the last ballot leaves `/vote` for the lobby.

---

## Chunk 5 — Finalization Engine

Can be built in parallel with most Voting UI work.

* Borda aggregation implementation
* tie-breaking
* duplicate/nominator coverage logic
* finalist selection
* Watchboxd pending-rating handling
* spooky-ordering interface
* immutable `room_movie_results` (**database schema and constraints are complete; finalization write is pending**)
* idempotent finalization endpoint

Build this primarily as pure functions so the algorithm can be exhaustively unit-tested without the database.

**Milestone:** the same set of ballots always produces the same persisted final result.

---

## Chunk 6 — Reveal System

**Depends on final result contract**

Backend:

* reveal schedule storage
* next-movie calculation
* 24-hour cooldown enforcement
* host authorization
* spoiler-safe read APIs
* completion transition

Frontend, in parallel:

* countdown
* host reveal control
* reveal animation
* history of already revealed movies
* completed-room state

**Milestone:** future movies cannot be discovered or revealed early.

---

## Chunk 7 — Hardening and Release

Parallelize across specialists/agents.

**Database/concurrency**

* simultaneous joins
* simultaneous final submissions
* duplicate requests/idempotency
* simultaneous reveal attempts

**Algorithm testing**

* duplicate nominations
* incomplete rankings
* rating ties
* missing Letterboxd ratings
* fewer unique movies than participants

**Security**

* non-member room access
* member attempting host actions
* cross-room IDs
* unrevealed-result leakage
* expired/invalid auth sessions

**Integration resilience**

* Watchboxd `202`
* failed jobs
* stale data
* TMDB failures
* retries

**E2E**
Run a complete 3–4 participant room:

`create → join → lock roster → select → vote → finalize → schedule → reveal → complete`

---

# Recommended Parallel Team Split

**Agent 1 — Data/Auth/Domain**
Own Prisma schema, migrations, auth, room state machine, authorization, transactions.

**Agent 2 — Frontend**
Own onboarding, room UI, selection UI, voting UI, reveal UI.

**Agent 3 — Integrations/Algorithms**
Own TMDB, Watchboxd, async polling, vote aggregation, finalist selection, spooky-ordering interface.

**Agent 4 — Validation/Testing**
Own integration tests, concurrency tests, security tests, fixtures, and E2E flows.

Agents 2 and 3 can work almost entirely in parallel after Agent 1 freezes the initial domain types and API contracts. Voting UI and finalization logic can likewise proceed simultaneously.

## Primary acceptance criterion

A room should be reproducible entirely from persisted Cineclub data after submissions: membership is fixed, nominations and ballots are immutable, finalization is deterministic, external asynchronous work is resumable, and unrevealed results never leave the server before their authorized reveal.
