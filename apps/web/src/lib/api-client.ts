import type { ApiResponse, ApiErrorResponse } from "@aerodirectory/shared";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] || "http://localhost:4000/api/v1";

class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  getToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    const raw = await response.text();
    const json = raw ? safeParseJson(raw) : null;

    if (!response.ok) {
      const error = json as ApiErrorResponse | NestLikeErrorResponse | null;
      throw new ApiError(
        extractErrorMessage(error) || response.statusText || "Request failed",
        response.status,
        extractErrorCode(error),
      );
    }

    return json as ApiResponse<T>;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;
    return this.request<T>(url);
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "DELETE" });
  }

  /**
   * Upload a file as multipart/form-data.
   * Content-Type must NOT be set manually — the browser sets it with the boundary.
   */
  async upload<T>(path: string, file: File): Promise<ApiResponse<T>> {
    const form = new FormData();
    form.append("file", file);

    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });

    const raw = await response.text();
    const json = raw ? safeParseJson(raw) : null;

    if (!response.ok) {
      const error = json as ApiErrorResponse | NestLikeErrorResponse | null;
      throw new ApiError(
        extractErrorMessage(error) || response.statusText || "Upload failed",
        response.status,
        extractErrorCode(error),
      );
    }

    return json as ApiResponse<T>;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface NestLikeErrorResponse {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractErrorMessage(
  error: ApiErrorResponse | NestLikeErrorResponse | null,
): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if (
    "error" in error &&
    typeof error.error === "object" &&
    error.error &&
    "message" in error.error
  ) {
    return error.error.message || null;
  }

  if ("message" in error) {
    if (Array.isArray(error.message)) {
      return error.message.join(", ");
    }
    return error.message ?? null;
  }

  return null;
}

function extractErrorCode(
  error: ApiErrorResponse | NestLikeErrorResponse | null,
): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error &&
    "code" in error.error &&
    typeof error.error.code === "string"
  ) {
    return error.error.code;
  }

  return undefined;
}

export const apiClient = new ApiClient();
