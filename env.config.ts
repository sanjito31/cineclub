import { loadEnvConfig } from "@next/env";

// Prisma and other root-level tools run outside the Next.js runtime. Loading
// environment files here gives them the same .env* precedence as the app.
loadEnvConfig(process.cwd());
