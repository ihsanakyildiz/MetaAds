const CALLBACK_PATH = "/api/meta/oauth/callback";

export function defaultOAuthRedirectUri() {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3003").replace(
    /\/+$/,
    "",
  );
  return `${appUrl}${CALLBACK_PATH}`;
}

export function normalizeOAuthRedirectUri(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return defaultOAuthRedirectUri();
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Geçerli bir http veya https adresi girin.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Adres http veya https ile başlamalı.");
  }

  const isLocalHost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (!isLocalHost && !url.hostname.includes(".")) {
    throw new Error("Geçerli bir alan adı veya ngrok adresi girin.");
  }

  if (!url.pathname || url.pathname === "/") {
    url.pathname = CALLBACK_PATH;
  }

  url.hash = "";
  url.search = "";

  return url.toString().replace(/\/+$/, "");
}
