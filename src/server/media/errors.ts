export class PhotoError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message = "Product photos are temporarily unavailable.",
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function photoError(error: unknown): PhotoError {
  return error instanceof PhotoError
    ? error
    : new PhotoError(503, "PHOTOS_UNAVAILABLE");
}
