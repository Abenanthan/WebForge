import { lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import { ToastProvider } from './providers/ToastProvider.jsx';
import { AuthProvider } from './providers/AuthProvider.jsx';
import { GuestRoute, ProtectedRoute } from '../components/RouteGuards.jsx';
import { AppShell } from '../layouts/AppShell.jsx';
import { AuthLayout } from '../pages/auth/AuthLayout.jsx';

// Each page is a separate chunk, downloaded on first visit.
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage.jsx'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          // Module routes are added here as each phase lands (see app/modules.js).
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
