import "./env.config";
import { defineConfig } from "prisma/config";
import { loadDatabaseConfig } from "./lib/config/database";

const migrationUrl = new URL(loadDatabaseConfig().directUrl);

// Keep Prisma's default schema and migration history out of public.
migrationUrl.searchParams.set("schema", "cineclub");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl.toString(),
  },
});
