import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, CircleAlert, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { PASSWORD_RULES, compactErrors, validateEmail, validateName, validateNewPassword } from '../../utils/validation.js';
import { firstName } from '../../utils/format.js';
import styles from './Auth.module.css';

const FIELDS = ['name', 'email', 'password', 'confirm'];

function validate(v) {
  return compactErrors({
    name: validateName(v.name),
    email: validateEmail(v.email),
    password: validateNewPassword(v.password),
    confirm: !v.confirm ? 'Please confirm your password.' : v.confirm !== v.password ? 'Passwords do not match.' : null,
  });
}

function PasswordChecklist({ value }) {
  return (
    <ul className={styles.rules} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        const Icon = met ? Check : X;
        return (
          <li key={rule.id} className={`${styles.rule} ${met ? styles.ruleMet : ''}`}>
            <Icon size={12} aria-hidden="true" className={styles.ruleIcon} />
            {rule.label}
            <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = { name: useRef(null), email: useRef(null), password: useRef(null), confirm: useRef(null) };

  function update(field, value) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validate(values);
    setErrors(clientErrors);
    const firstInvalid = FIELDS.find((f) => clientErrors[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setBusy(true);
    try {
      const user = await register(values.name.trim(), values.email.trim(), values.password);
      toast.success(`Account created. Welcome, ${firstName(user.name)}!`);
      navigate('/', { replace: true });
    } catch (err) {
      setBusy(false);
      // Server-side validation is authoritative: show its per-field messages.
      const serverFields = err.fields ?? {};
      setErrors(serverFields);
      setFormError(err.message);
      const firstServerInvalid = FIELDS.find((f) => serverFields[f]);
      if (firstServerInvalid) refs[firstServerInvalid].current?.focus();
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-labelledby="register-title">
      <header className={styles.formHeader}>
        <h2 id="register-title" className={styles.formTitle}>Create your account</h2>
        <p className={styles.formSubtitle}>Your experiments, projects and progress are saved to it.</p>
      </header>

      {formError && (
        <div className={styles.alert} role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <div className={styles.fields}>
        <TextField
          ref={refs.name}
          label="Full name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          error={errors.name}
          maxLength={80}
          required
        />
        <TextField
          ref={refs.email}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
          maxLength={190}
          required
        />
        <PasswordInput
          ref={refs.password}
          label="Password"
          name="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => update('password', e.target.value)}
          error={errors.password}
          maxLength={72}
          hint={<PasswordChecklist value={values.password} />}
          required
        />
        <PasswordInput
          ref={refs.confirm}
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => update('confirm', e.target.value)}
          error={errors.confirm}
          maxLength={72}
          required
        />
      </div>

      <div className={styles.submitRow}>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={UserPlus}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </div>

      <p className={styles.switch}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
