import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from './RouteGuards.jsx';

const authState = { current: { status: 'anonymous', user: null } };
vi.mock('../app/providers/AuthProvider.jsx', () => ({ useAuth: () => authState.current }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<p>login page</p>} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<p>dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('route guards', () => {
  it('redirects anonymous users from protected pages to /login', () => {
    authState.current = { status: 'anonymous', user: null };
    renderAt('/');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders protected pages for authenticated users', () => {
    authState.current = { status: 'authenticated', user: { name: 'Demo' } };
    renderAt('/');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('sends authenticated users away from /login', () => {
    authState.current = { status: 'authenticated', user: { name: 'Demo' } };
    renderAt('/login');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('shows a retryable error when the server is unreachable', () => {
    authState.current = { status: 'error', error: new Error('Cannot reach the server.'), retry: vi.fn() };
    renderAt('/');
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
