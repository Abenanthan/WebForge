import { EMAIL_PATTERN, NAME_PATTERN, PASSWORD_RULES } from '../../utils/validation.js';

/**
 * Client-side rules for the Form Validation Lab. Each mirrors a rule enforced
 * by backend/src/Controllers/FormLabController.php. `html` is the equivalent
 * native HTML constraint, where one exists.
 */
export const FIELDS = [
  {
    name: 'name', label: 'Full name', type: 'text', autoComplete: 'name',
    attrs: { required: true, minLength: 2, maxLength: 80 },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v.trim() !== '' },
      { id: 'min', label: 'At least 2 characters', html: 'minlength="2"', test: (v) => v.trim().length >= 2 },
      { id: 'max', label: 'At most 80 characters', html: 'maxlength="80"', test: (v) => v.trim().length <= 80 },
      { id: 'chars', label: 'Letters, spaces, . \' - only', custom: true, test: (v) => NAME_PATTERN.test(v.trim()) },
    ],
  },
  {
    name: 'email', label: 'Email', type: 'email', autoComplete: 'email', inputMode: 'email',
    attrs: { required: true, maxLength: 190 },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v.trim() !== '' },
      { id: 'email', label: 'Valid email format', html: 'type="email"', test: (v) => EMAIL_PATTERN.test(v.trim()) },
    ],
    serverOnly: ['Not already registered (database lookup)'],
  },
  {
    name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password',
    attrs: { required: true, minLength: 8, maxLength: 72 },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v !== '' },
      ...PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, custom: r.id !== 'length', html: r.id === 'length' ? 'minlength="8" maxlength="72"' : null, test: r.test })),
    ],
  },
  {
    name: 'confirm', label: 'Confirm password', type: 'password', autoComplete: 'new-password',
    attrs: { required: true },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v !== '' },
      { id: 'match', label: 'Matches password', custom: true, test: (v, all) => v === all.password },
    ],
  },
  {
    name: 'age', label: 'Age', type: 'number', inputMode: 'numeric',
    attrs: { required: true, min: 13, max: 120, step: 1 },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => String(v).trim() !== '' },
      { id: 'int', label: 'Whole number', html: 'type="number" step="1"', test: (v) => /^-?\d+$/.test(String(v).trim()) },
      { id: 'range', label: 'Between 13 and 120', html: 'min="13" max="120"', test: (v) => Number(v) >= 13 && Number(v) <= 120 },
    ],
  },
  {
    name: 'pincode', label: 'PIN code', type: 'text', inputMode: 'numeric', hint: '6 digits, not starting with 0',
    attrs: { required: true, pattern: '[1-9][0-9]{5}' },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v.trim() !== '' },
      { id: 'pattern', label: 'Matches /^[1-9][0-9]{5}$/', html: 'pattern="[1-9][0-9]{5}"', test: (v) => /^[1-9][0-9]{5}$/.test(v.trim()) },
    ],
  },
  {
    name: 'username', label: 'Username', type: 'text', autoComplete: 'username', hint: '3–20 lowercase letters, digits or _',
    attrs: { required: true, pattern: '[a-z0-9_]{3,20}' },
    rules: [
      { id: 'required', label: 'Required', html: 'required', test: (v) => v.trim() !== '' },
      { id: 'pattern', label: 'Matches /^[a-z0-9_]{3,20}$/', html: 'pattern="[a-z0-9_]{3,20}"', test: (v) => /^[a-z0-9_]{3,20}$/.test(v.trim()) },
    ],
    serverOnly: ['Not a reserved name (server policy)'],
  },
];

export const EMPTY_VALUES = Object.fromEntries(FIELDS.map((f) => [f.name, '']));

export const PRESETS = {
  valid: { name: 'Asha Rao', email: 'asha.rao@example.com', password: 'Secure@2026', confirm: 'Secure@2026', age: '21', pincode: '600001', username: 'asha_r' },
  invalid: { name: 'A1', email: 'asha@', password: 'password', confirm: 'Password', age: '9', pincode: '012345', username: 'Asha R' },
  serverOnly: { name: 'Demo Student', email: 'demo@webforge.local', password: 'Secure@2026', confirm: 'Secure@2026', age: '20', pincode: '600002', username: 'admin' },
};

/** Run every client rule; a rule after a failed "required" is reported as skipped. */
export function validateClient(values) {
  const results = {};
  for (const field of FIELDS) {
    const value = values[field.name] ?? '';
    const empty = String(value).trim() === '';
    results[field.name] = field.rules.map((rule) => {
      if (rule.id !== 'required' && empty) return { ...rule, passed: true, skipped: true };
      return { ...rule, passed: Boolean(rule.test(value, values)) };
    });
  }
  return results;
}

export const firstError = (ruleResults) => ruleResults?.find((r) => !r.passed && !r.skipped);
