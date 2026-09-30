/**
 * Provider error hierarchy - allows sync engine to reason about failures
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(provider: string, message = "Authentication failed") {
    super(message, provider, "AUTHENTICATION_ERROR", false);
  }
}

export class ProviderPermissionError extends ProviderError {
  constructor(provider: string, message = "Permission denied") {
    super(message, provider, "PERMISSION_ERROR", false);
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(provider: string, message = "Resource not found") {
    super(message, provider, "NOT_FOUND", false);
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(provider: string, retryAfterMs?: number, message = "Rate limited") {
    super(message, provider, "RATE_LIMIT", true, retryAfterMs);
  }
}

export class ProviderTransientError extends ProviderError {
  constructor(provider: string, message = "Transient error", retryAfterMs?: number) {
    super(message, provider, "TRANSIENT_ERROR", true, retryAfterMs);
  }
}

export class ProviderUnsupportedOperationError extends ProviderError {
  constructor(provider: string, message = "Unsupported operation") {
    super(message, provider, "UNSUPPORTED_OPERATION", false);
  }
}

export function translateHttpError(
  provider: string,
  status: number,
  body: string,
  headers?: Record<string, string>
): ProviderError {
  const lowerBody = body.toLowerCase();

  if (status === 401) {
    return new ProviderAuthenticationError(provider, `Unauthorized: ${body.slice(0, 200)}`);
  }
  if (status === 403) {
    return new ProviderPermissionError(provider, `Forbidden: ${body.slice(0, 200)}`);
  }
  if (status === 404) {
    return new ProviderNotFoundError(provider, `Not found: ${body.slice(0, 200)}`);
  }
  if (status === 429) {
    const retryAfterHeader = headers?.["retry-after"] || headers?.["Retry-After"];
    let retryAfterMs: number | undefined;
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) retryAfterMs = seconds * 1000;
    }
    return new ProviderRateLimitError(provider, retryAfterMs, `Rate limited: ${body.slice(0, 200)}`);
  }
  if (status >= 500 && status < 600) {
    return new ProviderTransientError(provider, `Server error ${status}: ${body.slice(0, 200)}`);
  }
  // 400 etc - treat as transient if body suggests temporary
  if (lowerBody.includes("timeout") || lowerBody.includes("temporarily")) {
    return new ProviderTransientError(provider, body.slice(0, 200));
  }
  return new ProviderError(body.slice(0, 500), provider, `HTTP_${status}`, false);
}
