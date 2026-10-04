import { describe, expect, it } from 'vitest';
import { validateEmail, validateName, validateNewPassword } from './validation.js';

describe('client validation (mirrors backend Validator)', () => {
  it('validates email', () => {
    expect(validateEmail('')).toMatch(/required/);
    expect(validateEmail('nope')).toMatch(/valid email/);
    expect(validateEmail(' demo@webforge.local ')).toBeNull();
  });

  it('validates names', () => {
    expect(validateName('A')).toMatch(/at least 2/);
    expect(validateName('<script>')).toMatch(/letters/);
    expect(validateName("Anne-Marie O'Neil")).toBeNull();
    expect(validateName('Abenanthan P.')).toBeNull();
  });

  it('enforces the password policy', () => {
    expect(validateNewPassword('')).toMatch(/required/);
    expect(validateNewPassword('abcdefgh')).toMatch(/upper-case.*number.*symbol/);
    expect(validateNewPassword('Demo@1234')).toBeNull();
  });
});
