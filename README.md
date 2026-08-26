# Cineclub

Cineclub is a room-based movie nomination, voting, and reveal app. Chunk 1 includes Supabase Magic Link authentication, profile onboarding, authenticated room creation, join-by-code, and the initial room lobby.

## Environment

Copy `.env.example` to `.env.local` and set these values from the Supabase
project Connect/API settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DB_USERNAME=app_runtime
DB_PASSWORD=your-database-password
TMDB_API_READ_ACCESS_TOKEN=your-server-side-tmdb-read-token
```

`lib/config/database.ts` URL-encodes the credentials and builds both connection
strings. Runtime Prisma traffic uses the Supavisor transaction pooler on port
6543 with `pgbouncer=true`, while Prisma CLI and migrations use the same
Supavisor host in session mode on port 5432 without that parameter. Despite the
Prisma environment variable name `DIRECT_URL`, this is a session-pooler URL,
not Supabase's `db.<project-ref>` direct endpoint. `DB_NAME` defaults to
`postgres`, `SUPABASE_DB_REGION` defaults to `us-west-2`, and the database base
domain defaults to `supabase.com`. The project reference is derived from
`NEXT_PUBLIC_SUPABASE_URL`; `SUPABASE_PROJECT_REF` and `SUPABASE_PROJECT_URL`
remain available as optional overrides.

Enter `DB_PASSWORD` as the raw password; the URL builder safely encodes special
characters when it creates each connection string.

Existing `DATABASE_URL` and `DIRECT_URL` values remain supported as individual
overrides, which is useful for custom connection endpoints and credential
rotation.

The publishable key is designed for browser use. Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.

In Supabase Authentication → URL Configuration, allow the callback URLs used by each environment, including `http://localhost:3000/auth/confirm` during local development and `https://your-domain.example/auth/confirm` in production. The default Magic Link template can remain unchanged; Cineclub passes this callback through `emailRedirectTo` and exchanges the returned PKCE code for a cookie-backed session.

`WATCHBOXD_API_URL` can override the default `https://watchboxd.vercel.app` server-side integration URL when needed.

TMDB search accepts either `TMDB_API_READ_ACCESS_TOKEN` (preferred) or
`TMDB_API_KEY`. Both are server-only credentials; do not prefix either with
`NEXT_PUBLIC_`. `TMDB_API_URL` can override the default
`https://api.themoviedb.org/3` integration URL for controlled environments.

Apply migrations and regenerate Prisma Client before running the app:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Run the foundation checks with `npm test`, `npm run lint`, and `npm run build`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
