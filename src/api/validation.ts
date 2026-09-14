export class InvalidApiResponseError extends Error {
  constructor(context: string) {
    super(`The server returned an invalid ${context}. Please try again.`);
    this.name = "InvalidApiResponseError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requireResponse(condition: unknown, context: string): asserts condition {
  if (!condition) throw new InvalidApiResponseError(context);
}
