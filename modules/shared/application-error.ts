export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429 | 500 | 502 | 503,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function applicationErrorResponse(error: unknown) {
  if (error instanceof ApplicationError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  throw error;
}
