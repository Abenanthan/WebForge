import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider.jsx';
import { ErrorState, LoadingState } from './ui/StateView.jsx';
import styles from './RouteGuards.module.css';

function FullPage({ children }) {
  return <div className={styles.fullPage}>{children}</div>;
}

function useAuthGate() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return <FullPage><LoadingState label="Connecting to WebForge…" /></FullPage>;
  }
  if (auth.status === 'error') {
    return (
      <FullPage>
        <ErrorState title="Cannot reach the WebForge server" error={auth.error} onRetry={auth.retry} />
      </FullPage>
    );
  }
  return null;
}

/** Renders child routes only for logged-in users; otherwise redirects to /login and remembers the target. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();
  if (gate) return gate;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Login/register pages: already-authenticated users go straight to where they were heading. */
export function GuestRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();
  if (gate) return gate;
  if (status === 'authenticated') {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />;
  }
  return <Outlet />;
}
