import Constants from "expo-constants";

type ExpoConfigWithHost = {
  hostUri?: string;
};

type ExpoGoConfigWithDebuggerHost = {
  debuggerHost?: string;
};

function extractHost(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }

  const normalized = candidate.replace(/^https?:\/\//, "").replace(/^exp:\/\//, "").trim();
  if (!normalized) {
    return null;
  }

  const host = normalized.split(/[/:?]/)[0]?.trim();
  return host || null;
}

function sanitizeManualUrl(candidate: string): string {
  const trimmed = candidate.trim().replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

export function resolveWebUrl(): string {
  const manualUrl = sanitizeManualUrl(process.env.EXPO_PUBLIC_WEB_URL || "");
  if (manualUrl) {
    return manualUrl;
  }

  const host =
    extractHost((Constants.expoConfig as ExpoConfigWithHost | null)?.hostUri) ||
    extractHost((Constants.expoGoConfig as ExpoGoConfigWithDebuggerHost | null)?.debuggerHost) ||
    extractHost((Constants.platform as ExpoConfigWithHost | null)?.hostUri);

  if (host) {
    return `http://${host}:3000`;
  }

  return "http://localhost:3000";
}

export function buildHealthUrl(webUrl: string): string {
  return `${webUrl.replace(/\/$/, "")}/healthz`;
}

export function buildConnectionHelp(webUrl: string): string {
  if (webUrl.includes("localhost") || webUrl.includes("127.0.0.1")) {
    return "Start the Next.js web app first. For a real phone, replace localhost with your computer LAN IP in apps/mobile/.env.";
  }
  return "Start the Next.js web app first, keep your phone and computer on the same Wi-Fi, then tap retry.";
}
