import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CircleAlert, FlaskConical, LogIn } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { compactErrors, validateEmail } from '../../utils/validation.js';
import { firstName } from '../../utils/format.js';
import styles from './Auth.module.css';

// Created by backend/bin/setup.php for demonstrations.
const DEMO_ACCOUNT = { email: 'demo@webforge.local', password: 'Demo@1234' };

function validate({ email, password }) {
  return compactErrors({
    email: validateEmail(email),
    password: password ? null : 'Password is required.',
  });
}

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const fieldRefs = { email: useRef(null), password: useRef(null) };

  function update(field, value) {
    const next = { ...values, [field]: value };
    setValues(next);
    // After the first submit attempt, re-validate as the user types.
    if (submitted) setErrors(validate(next));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validate(values);
    setErrors(clientErrors);
    const firstInvalid = Object.keys(clientErrors)[0];
    if (firstInvalid) {
      fieldRefs[firstInvalid].current?.focus();
      return;
    }

    setBusy(true);
    try {
      const user = await login(values.email.trim(), values.password);
      toast.success(`Welcome back, ${firstName(user.name)}!`);
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search ?? ''}` : '/', { replace: true });
    } catch (err) {
      setBusy(false);
      if (Object.keys(err.fields ?? {}).length) setErrors(err.fields);
      setFormError(err.message);
      fieldRefs.password.current?.focus();
    }
  }

  function fillDemo() {
    setValues(DEMO_ACCOUNT);
    setErrors({});
    setFormError(null);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
      <header className={styles.formHeader}>
        <h2 id="login-title" className={styles.formTitle}>Log in</h2>
        <p className={styles.formSubtitle}>Continue to your WebForge laboratory.</p>
      </header>

      {formError && (
        <div className={styles.alert} role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <div className={styles.fields}>
        <TextField
          ref={fieldRefs.email}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
          required
        />
        <PasswordInput
          ref={fieldRefs.password}
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => update('password', e.target.value)}
          error={errors.password}
          required
        />
      </div>

      <div className={styles.submitRow}>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={LogIn}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
        <div className={styles.divider}>or</div>
        <Button variant="secondary" block icon={FlaskConical} onClick={fillDemo} disabled={busy}>
          Use the demo account
        </Button>
      </div>

      <p className={styles.switch}>
        New to WebForge? <Link to="/register" state={location.state}>Create an account</Link>
      </p>
    </form>
  );
}
