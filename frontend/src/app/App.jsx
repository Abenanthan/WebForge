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
const WebPlaygroundPage = lazy(() => import('../modules/web-playground/WebPlaygroundPage.jsx'));
const JsPlaygroundPage = lazy(() => import('../modules/js-playground/JsPlaygroundPage.jsx'));
const DomExplorerPage = lazy(() => import('../modules/dom-explorer/DomExplorerPage.jsx'));
const EventVisualizerPage = lazy(() => import('../modules/event-visualizer/EventVisualizerPage.jsx'));
const FormLabPage = lazy(() => import('../modules/form-lab/FormLabPage.jsx'));
const AjaxMonitorPage = lazy(() => import('../modules/ajax-monitor/AjaxMonitorPage.jsx'));
const CanvasStudioPage = lazy(() => import('../modules/canvas-studio/CanvasStudioPage.jsx'));

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
          { path: 'lab/web-playground', element: <WebPlaygroundPage /> },
          { path: 'lab/js-playground', element: <JsPlaygroundPage /> },
          { path: 'lab/dom-explorer', element: <DomExplorerPage /> },
          { path: 'lab/event-visualizer', element: <EventVisualizerPage /> },
          { path: 'lab/form-lab', element: <FormLabPage /> },
          { path: 'lab/ajax-monitor', element: <AjaxMonitorPage /> },
          { path: 'lab/canvas-studio', element: <CanvasStudioPage /> },
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
