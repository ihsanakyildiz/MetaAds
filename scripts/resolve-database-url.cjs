function hostedDatabaseUrl() {
  const host = process.env.DB_HOST && process.env.DB_HOST.trim();
  const name = process.env.DB_NAME && process.env.DB_NAME.trim();
  const user = process.env.DB_USER && process.env.DB_USER.trim();

  if (!host || !name || !user) {
    return "";
  }

  const port = (process.env.DB_PORT && process.env.DB_PORT.trim()) || "3306";
  const password = process.env.DB_PASSWORD ?? "";

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
}

function mysqlHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function resolveDatabaseUrl() {
  const existing = (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) || "";
  const hosted = hostedDatabaseUrl();

  if (hosted && (!existing || isLoopbackHost(mysqlHostFromUrl(existing)))) {
    return hosted;
  }

  return existing;
}

function applyDatabaseUrl() {
  const url = resolveDatabaseUrl();

  if (url) {
    process.env.DATABASE_URL = url;
  }

  return url;
}

module.exports = {
  applyDatabaseUrl,
  resolveDatabaseUrl,
};
