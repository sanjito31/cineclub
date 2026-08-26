type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig = {
  directUrl: string;
  pooledUrl: string;
};

const DEFAULT_BASE_DOMAIN = "supabase.com";
const DEFAULT_DATABASE_NAME = "postgres";
const DEFAULT_REGION = "us-west-2";

function readValue(environment: DatabaseEnvironment, name: string) {
  const value = environment[name]?.trim();
  return value || undefined;
}

function parseUrl(value: string, name: string, protocols: readonly string[]) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}.`);
  }

  return url;
}

function parseProjectUrl(environment: DatabaseEnvironment) {
  const value =
    readValue(environment, "SUPABASE_PROJECT_URL") ??
    readValue(environment, "NEXT_PUBLIC_SUPABASE_URL");

  return value
    ? parseUrl(value, "SUPABASE_PROJECT_URL", ["http:", "https:"])
    : undefined;
}

function parseBaseDomain(
  environment: DatabaseEnvironment,
) {
  const baseDomain =
    readValue(environment, "SUPABASE_DB_BASE_DOMAIN") ?? DEFAULT_BASE_DOMAIN;
  const hostnamePart = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

  if (
    baseDomain.includes("://") ||
    baseDomain.split(".").length < 2 ||
    !baseDomain.split(".").every((part) => hostnamePart.test(part))
  ) {
    throw new Error(
      "SUPABASE_DB_BASE_DOMAIN must be a domain such as supabase.com.",
    );
  }

  return baseDomain.toLowerCase();
}

function requireComponent(
  environment: DatabaseEnvironment,
  name: string,
  missing: string[],
) {
  const value = readValue(environment, name);
  if (!value) missing.push(name);
  return value ?? "";
}

function buildConnectionUrls(environment: DatabaseEnvironment): DatabaseConfig {
  const projectUrl = parseProjectUrl(environment);
  const missing: string[] = [];
  const username = requireComponent(environment, "DB_USERNAME", missing);
  const password = requireComponent(environment, "DB_PASSWORD", missing);
  const projectRef =
    readValue(environment, "SUPABASE_PROJECT_REF") ??
    projectUrl?.hostname.split(".")[0] ??
    "";
  const region = readValue(environment, "SUPABASE_DB_REGION") ?? DEFAULT_REGION;

  if (!projectRef) {
    missing.push(
      "SUPABASE_PROJECT_REF (or SUPABASE_PROJECT_URL/NEXT_PUBLIC_SUPABASE_URL)",
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Database configuration is incomplete. Missing: ${missing.join(", ")}.`,
    );
  }

  const hostnamePart = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if (!hostnamePart.test(projectRef)) {
    throw new Error("SUPABASE_PROJECT_REF is not a valid hostname label.");
  }
  if (!hostnamePart.test(region)) {
    throw new Error("SUPABASE_DB_REGION is not a valid hostname label.");
  }

  const baseDomain = parseBaseDomain(environment);
  const databaseName =
    readValue(environment, "DB_NAME") ?? DEFAULT_DATABASE_NAME;

  const directUrl = new URL("postgresql://localhost");
  directUrl.username = `${username}.${projectRef}`;
  directUrl.password = password;
  directUrl.hostname = `aws-0-${region}.pooler.${baseDomain}`;
  directUrl.port = "5432";
  directUrl.pathname = databaseName;

  const pooledUrl = new URL("postgresql://localhost");
  pooledUrl.username = `${username}.${projectRef}`;
  pooledUrl.password = password;
  pooledUrl.hostname = `aws-0-${region}.pooler.${baseDomain}`;
  pooledUrl.port = "6543";
  pooledUrl.pathname = databaseName;
  pooledUrl.searchParams.set("pgbouncer", "true");

  return {
    directUrl: directUrl.toString(),
    pooledUrl: pooledUrl.toString(),
  };
}

function readConnectionUrl(
  environment: DatabaseEnvironment,
  name: "DATABASE_URL" | "DIRECT_URL",
) {
  const value = readValue(environment, name);
  if (!value) return undefined;

  parseUrl(value, name, ["postgres:", "postgresql:"]);
  return value;
}

export function loadDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): DatabaseConfig {
  const pooledUrl = readConnectionUrl(environment, "DATABASE_URL");
  const directUrl = readConnectionUrl(environment, "DIRECT_URL");

  if (pooledUrl && directUrl) {
    return { pooledUrl, directUrl };
  }

  const generated = buildConnectionUrls(environment);
  return {
    pooledUrl: pooledUrl ?? generated.pooledUrl,
    directUrl: directUrl ?? generated.directUrl,
  };
}
