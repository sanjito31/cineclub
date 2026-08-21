# Cineclub

A room based movie selection and voting app for friends to contribute together and vote on which movies to watch.

Environment: A blank NextJS 16 project
DB and Auth: Supabase PostgreSQL using Prisma ORM, Supabase Auth

## Design Overview
The app will be room based and each room will consist of 4 phases: Creation/Onboarding, Selection, Voting, Reveal. 

### Phases
1. Creation/Onboarding: 
- All users will be required to log in via Supabase email OTP. After logging in/signing up, they just need to create a name (display name) and provide optional username. The only user info we store is their display name, email, and optional letterboxd username.
- My custom Letterboxd API has option to verify and return letterboxd user information which we can then use to get that user's watchlist, watched movies, user info, and an overlap list.
- The homepage of the site should have two options for either "Create Room" or "Join Room". 
- The host will click "Create Room" where a new room is generated along with a short code unique identifier for the room. The host will be able to set various preferences such as max participants, number of movie selections, require at least one movie from each person (y/n), set deadlines (for room closures), name of the room, etc.
- After the room is created and preferences are set, then the host will be prompted to login in via Supabase email OTP
- Details about the room including preferences, owner email, short code, date/time metadata, participants (when they join) will be stored in a database
- Only after signing in will the room be considered "active" or "valid" and then can show the room's code and shareable link (link to website plus code)
- New participants will receive a link to the room or use the code to join the room and use the "Join Room" button. Once they attempt to join, start onboarding with signin/signup via email OTP, then prompt for name, letterboxd username (optional), and confirm that they want to join the room (show name so they can confirm).

2. Selection:
- For the host, after creating the room, they can move directly to movie selection and sharing the room.
- New participants complete onboarding and move to phase 2 of the room.
- Users pass through Phase 1 and Phase 2 separately. All users must complete Phase 2 before Phase 3 opens.
- Phase 2 will have a predetermined number of empty slots with a plus button for a user to click and search for a movie that they want to add. Search will be powered by TMDB API. 
- Once a movie is found, the user can click an "Add" or "Select" button to put that movie as their choice.
- Below the selection spots, there will be a "suggestions" section that will be populated with movies from a shared/overlapped list. My custom API has an endpoint where you can supply 2 to 10 letterboxd usernames and it will return a list of common movies between all the users watchlists that is ranked from most in common to least. we can then filter those suggestions by a genre. these suggestions should use the letterboxd usernames of the participants in the room, whoever is available. 
- My letterboxd API also has endpoints to read which movies that each person has already watched so if a user selects a movie that someone else has watched already, it should show a warning like "3 others have seen this already..." and include little circles with their letterboxd profile pictures (also in API), or just circle with first letter initial if no profile pic. 
- Each movie slot will have a replace button and delete button for those respective functions. Movies will sit in the slot with the poster on the left and then the title with year in parentheses
- once a movie is added as a selection, use the TMDB ID to request my custom letterboxd API to get the letterboxd average score and display it right aligned in the slot 
- Once a movie is added as a selection, the frontend will collect the already confirmed room-wide movie list. this movie list will consist of each movie that other participants have already confirmed. If a movie matches one that was already selected, it should warn the user "This movie has been selected by someone else. Maybe choose another". Of course, this process will include stale/conflicting information which is fine and once everyone completes phase 2, then we deduplicate the final list.
- This entire selection process will take place in browser and only when the user is done, then it generates a POST request for that user's choices into the master list for that room.
- User cannot complete this phase without selecting at least 1 movie.
- Still allow users to submit movies that people have watched or already submitted. the warnings above should only be warnings.
- All users will be held here until everyone completes phase 2, then phase 3 opens

3. Voting
- Ranked choice voting of the movies
- The number of required votes will be equal to the number of participants in the room. People can rank more movies after that but its not required. 
- Each of the top required ranks must include at least one movie from each person.
- for example, if 8 people each select 3 movies (very rare chance that by accident 2 or more people select the exact 3 movies), then we have 24 choices. since there are 8 participants, each user MUST rank at least 8 movies. Those 8 movies must be at least one from each person. The options will be presented in groups of who selected them. this ensures that at least one movie from each person gets consideration
- Once complete, each user will submit their rank votes. voting process takes place in browser but submitting will generate the POST request. Gate submit with "are you sure? you can't undo this" dialog box
- All users stop here until all complete phase 3

4. Reveal
- This phase will require no user input.
- the host will set up specific dates/times for each movie selection to be "revealed". synchronized countdowns to reveal the movie.
- the main part of this phase is the work to come up with the final list,which will happen behind the scenes 
- after receiving the final ranked choice votes from each user, use an appropriate algorithm to compile the vote results to come up with a master list (should include all movies, e.g. 8 people, 3 movies each, 24 total)
- The final list will the be highest ranked movie from each person. so if the list has spots #1 and #2 taken by the same user, then only choose the movie in spot #1 aka their highest ranked movie. retain the relative rankings. If there's a situation of ties or like a user's movies were ranked the to the same level/rank, then use the Letterboxd average rating to break ties. if that doesn't work, then choose one at random. 
- Letterboxd average ratings will be found using my custom API which ill give more details on implementation later but it should accept a POST request with the TMDB ID, and it will match the movie in letterboxd and return the average rating. its a scraping API, so some requests return 202 and require polling for some time to get a result
- Finally, once we get the relative list of movies (equal in length to number of participants), we will then outsource the final ordering to an algorithm TBD that will order them from least spooky to most spooky. once that list is compiled, that becomes the final list.
- then, the host ONLY can have a button which "reveals" the movies in order. So say the host clicks the reveal button, it will do some animation and then reveal the first movie from that final ordering. to prevent accidental extra reveals, after a movie is revealed, there should be a at least 24 hour cooldown period where it will prevent revealing another movie in the list


## Database

We'll need a few tables to keep track of each room and info

1. Room
- room_id
- room_code (if unique, then no need for room_id)
- owner (foreign key to user)
- members (might need some associative table)
- createdAt, modifiedAt, etc
- each of the preferences and deadlines, missing or null return defaults (will set)
- some way to manage/keep track of phase state. maybe globally, we can keep track of number of participants that completed each phase (so like 8 total participants, phase1=8 and phase2=8, then we know it's good to move to phase 3 or some other method idk you can suggest something)

2. Selects: movies themselves
- room_id (foreign key)
- movie_title
- TMDB ID or link to TMDB
- movie year
- poster link
- letterboxd slug (from my custom API)
- added by user_id
- createdAt, modifiedAt, etc
- rank
- number of votes
- voted by (maybe another associative entity)

3. Users: additional metadata
- user_id (foreign key to supabase's user table)
- letterboxd username
- createdAt, modifiedAt, etc

4. RoomParticipants
- room_id (foreign key to Room)
- user_id (foreign key to Users)
- current phase
- joined at


## Custom Letterboxd API

access at https://watchboxd.vercel.app

Letterboxd has no public API. Requests use the versioned API, which reads
persistent snapshots from Supabase Postgres. Cache misses and stale resources
create idempotent `ScrapeJob` rows and publish a minimal message to the
`scrape-jobs-v1` Vercel Queue topic. The private Node.js consumer scrapes
Letterboxd. List workers atomically save lightweight movies, ordered
relationships, and deduplicated child movie jobs. Movie workers then scrape
only the Letterboxd film page for its title, year, film ID, outbound TMDB ID,
primary poster, and rating. TMDB is never requested by this application; API
consumers can use the returned `tmdbId` directly if they need other metadata.
The browser follows `202 Accepted` job descriptors and computes no overlap
locally.

| Route | Purpose |
|-------|---------|
| `GET /api/v1/users/{username}` | Cached profile or profile job |
| `GET /api/v1/users/{username}/watchlist` | Paginated watchlist |
| `GET /api/v1/users/{username}/watched` | Paginated deduplicated watched titles |
| `GET /api/v1/users/{username}/network` | Mutual and following network |
| `GET /api/v1/movies/{tmdbId}` | Follow Letterboxd's `/tmdb/{id}/` redirect and return Letterboxd movie data |
| `GET /api/v1/movies/letterboxd/{letterboxdSlug}` | Movie lookup by Letterboxd slug or known alias |
| `GET /api/v1/overlap?users=a,b` | Server-computed paginated overlap |
| `GET /api/v1/jobs/{jobId}` | Pollable background-job status |

Fresh responses return `200`; cache misses return `202` with `Location` and
`Retry-After`; stale data returns immediately with deduplicated `refreshJobs`.
Once a watchlist or watched snapshot exists, its paginated
response returns provisional title, year, slug, and poster data without waiting
for child movie jobs. Page-scoped `meta.enrichment` reports `complete`,
`pendingSlugs`, and `failedSlugs`. Failed enrichment remains visible in these
two lists; overlap continues to require resolved page movies and omits failed
ones. List responses do not create or inspect per-movie jobs; individual movie
routes handle movie freshness and recovery.

