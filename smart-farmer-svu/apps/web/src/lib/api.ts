import { API_URL } from "@/lib/config";

export type ApiPayload = Record<string, unknown> & {
  success?: boolean;
  message?: string;
  error_code?: string | null;
};

export async function apiFetch(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
  token?: string | null,
): Promise<{ response: Response; data: ApiPayload }> {
  const headers = new Headers(options.headers || {});
  let body = options.body;

  if (token) {
    headers.set("Authorization", `Token ${token}`);
  }

  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers,
      body: body as BodyInit | null | undefined,
    });
  } catch {
    const data: ApiPayload = {
      success: false,
      error_code: "api_unavailable",
      message: "Backend API is unavailable. Start the API server on http://localhost:8000.",
    };
    response = new Response(JSON.stringify(data), {
      status: 503,
      headers: {
        "content-type": "application/json",
      },
    });
    return { response, data };
  }

  let data: ApiPayload = {};
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = (await response.json()) as ApiPayload;
  } else {
    const text = await response.text();
    data = text ? ({ message: text } as ApiPayload) : {};
  }

  return { response, data };
}
