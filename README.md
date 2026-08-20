# Cineclub

Cineclub is a room-based movie nomination, voting, and reveal app. Chunk 1 includes Supabase Magic Link authentication, profile onboarding, authenticated room creation, join-by-code, and the initial room lobby.

## Environment

In addition to the Prisma database URLs, set these values in `.env.local` from the Supabase project Connect/API settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=postgresql://your-runtime-pooler-url
DIRECT_URL=postgresql://your-migration-url
```

The publishable key is designed for browser use. Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.

In Supabase Authentication → URL Configuration, allow the callback URLs used by each environment, including `http://localhost:3000/auth/confirm` during local development and `https://your-domain.example/auth/confirm` in production. The default Magic Link template can remain unchanged; Cineclub passes this callback through `emailRedirectTo` and exchanges the returned PKCE code for a cookie-backed session.

`WATCHBOXD_API_URL` can override the default `https://watchboxd.vercel.app` server-side integration URL when needed.

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
