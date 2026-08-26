import "server-only";

import { loadDatabaseConfig } from "@/lib/config/database";

let cachedDatabaseConfig: ReturnType<typeof loadDatabaseConfig> | undefined;

export const serverConfig = {
  get database() {
    cachedDatabaseConfig ??= loadDatabaseConfig();
    return cachedDatabaseConfig;
  },
  nodeEnv: process.env.NODE_ENV,
  tmdb: {
    readAccessToken: process.env.TMDB_API_READ_ACCESS_TOKEN?.trim(),
    apiKey: process.env.TMDB_API_KEY?.trim(),
    baseUrl: process.env.TMDB_API_URL?.trim() || undefined,
  },
  watchboxd: {
    baseUrl: process.env.WATCHBOXD_API_URL?.trim() || undefined,
  },
} as const;
