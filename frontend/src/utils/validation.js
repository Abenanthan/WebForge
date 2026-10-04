/**
 * Client-side validation rules. They mirror backend/src/Core/Validator.php,
 * so the user gets instant feedback while the server stays the authority.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;

export const PASSWORD_RULES = [
  { id: 'length', label: '8–72 characters', test: (v) => v.length >= 8 && v.length <= 72 },
  { id: 'lower', label: 'A lower-case letter', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'An upper-case letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'A number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol (e.g. ! @ #)', test: (v) => /[^a-zA-Z\d]/.test(v) },
];

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return 'Email is required.';
  if (v.length > 190) return 'Email must be at most 190 characters.';
  if (!EMAIL_PATTERN.test(v)) return 'Enter a valid email address.';
  return null;
}

export function validateName(value) {
  const v = value.trim();
  if (!v) return 'Name is required.';
  if (v.length < 2) return 'Name must be at least 2 characters.';
  if (v.length > 80) return 'Name must be at most 80 characters.';
  if (!NAME_PATTERN.test(v)) return 'Use letters, spaces, dots, apostrophes and hyphens only.';
  return null;
}

export function validateNewPassword(value) {
  if (!value) return 'Password is required.';
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  return failed.length ? `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.` : null;
}

/** Remove null entries so `Object.keys(errors).length` means "has errors". */
export function compactErrors(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}
