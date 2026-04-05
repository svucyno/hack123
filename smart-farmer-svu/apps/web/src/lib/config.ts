import type { NextRequest } from "next/server";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveMediaBaseUrl(request?: NextRequest): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  if (request) {
    return trimTrailingSlash(request.nextUrl.origin);
  }

  return "";
}
