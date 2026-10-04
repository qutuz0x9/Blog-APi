export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseId(value: string | string[] | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid id');
  }
  return id;
}

export function requireFields<T extends Record<string, unknown>>(body: T, fields: (keyof T)[]): void {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === '');
  if (missing.length > 0) {
    throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
}
