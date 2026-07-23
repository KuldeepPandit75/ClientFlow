export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed");
  }

  return payload.data;
}

export async function apiGet<T>(path: string) {
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  return parseResponse<T>(response);
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  return parseResponse<T>(response);
}

export async function apiSendForm<T>(path: string, method: "POST" | "PATCH", body: FormData) {
  const response = await fetch(path, {
    method,
    body,
    credentials: "same-origin",
  });

  return parseResponse<T>(response);
}
