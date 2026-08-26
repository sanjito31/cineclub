import assert from "node:assert/strict";
import test from "node:test";
import { loadDatabaseConfig } from "../lib/config/database";

test("database config builds direct and pooled Supabase URLs", () => {
  const config = loadDatabaseConfig({
    DB_USERNAME: "app user",
    DB_PASSWORD: "p@ss/word?value",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  });

  const directUrl = new URL(config.directUrl);
  assert.equal(directUrl.username, "app%20user.abcdefghijklmnopqrst");
  assert.equal(directUrl.password, "p%40ss%2Fword%3Fvalue");
  assert.equal(
    directUrl.host,
    "aws-0-us-west-2.pooler.supabase.com:5432",
  );
  assert.equal(directUrl.pathname, "/postgres");
  assert.equal(directUrl.searchParams.has("pgbouncer"), false);

  const pooledUrl = new URL(config.pooledUrl);
  assert.equal(pooledUrl.username, "app%20user.abcdefghijklmnopqrst");
  assert.equal(pooledUrl.password, "p%40ss%2Fword%3Fvalue");
  assert.equal(
    pooledUrl.host,
    "aws-0-us-west-2.pooler.supabase.com:6543",
  );
  assert.equal(pooledUrl.searchParams.get("pgbouncer"), "true");
});

test("database config can derive the project ref and override the DB domain", () => {
  const config = loadDatabaseConfig({
    DB_USERNAME: "postgres",
    DB_PASSWORD: "password",
    SUPABASE_PROJECT_URL: "https://project-ref.supabase.co",
    SUPABASE_DB_REGION: "eu-central-1",
    SUPABASE_DB_BASE_DOMAIN: "supabase.example",
  });

  assert.equal(
    new URL(config.directUrl).host,
    "aws-0-eu-central-1.pooler.supabase.example:5432",
  );
  assert.equal(
    new URL(config.pooledUrl).host,
    "aws-0-eu-central-1.pooler.supabase.example:6543",
  );
});

test("database config rejects a URL where a DB base domain is expected", () => {
  assert.throws(
    () =>
      loadDatabaseConfig({
        DB_USERNAME: "postgres",
        DB_PASSWORD: "password",
        SUPABASE_PROJECT_REF: "project-ref",
        SUPABASE_DB_REGION: "us-west-2",
        SUPABASE_DB_BASE_DOMAIN: "https://supabase.com",
      }),
    /must be a domain such as supabase\.com/,
  );
});

test("database config preserves full URL overrides", () => {
  const config = loadDatabaseConfig({
    DATABASE_URL: "postgresql://runtime.example:6543/app?custom=true",
    DIRECT_URL: "postgresql://direct.example:5432/app",
  });

  assert.equal(
    config.pooledUrl,
    "postgresql://runtime.example:6543/app?custom=true",
  );
  assert.equal(config.directUrl, "postgresql://direct.example:5432/app");
});

test("database config reports missing URL components without exposing secrets", () => {
  assert.throws(
    () =>
      loadDatabaseConfig({
        DB_PASSWORD: "do-not-print-this",
        SUPABASE_PROJECT_REF: "project-ref",
      }),
    (error: unknown) =>
      error instanceof Error &&
      /DB_USERNAME/.test(error.message) &&
      !/SUPABASE_DB_REGION/.test(error.message) &&
      !/do-not-print-this/.test(error.message),
  );
});
