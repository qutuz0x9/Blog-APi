import { describe, expect, it } from 'vitest';
import { HttpError, parseId, requireFields } from '../src/utils/http-error.js';

describe('parseId', () => {
  it('parses a positive integer string', () => {
    expect(parseId('42')).toBe(42);
  });

  it.each([undefined, 'abc', '0', '-1', '1.5', ''])('rejects %j', (bad) => {
    expect(() => parseId(bad)).toThrow(expect.objectContaining({ status: 400, message: 'Invalid id' }));
  });
});

describe('requireFields', () => {
  it('passes when all fields are present', () => {
    expect(() => requireFields({ name: 'a', age: 0 }, ['name', 'age'])).not.toThrow();
  });

  it('lists missing and empty fields in the message', () => {
    const body = { name: '', email: undefined, ok: 1 } as Record<string, unknown>;
    expect(() => requireFields(body, ['name', 'email', 'ok'])).toThrow(HttpError);
    expect(() => requireFields(body, ['name', 'email', 'ok'])).toThrow('Missing required fields: name, email');
  });
});
