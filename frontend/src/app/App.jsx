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
const ServerLabLayout = lazy(() => import('../modules/server-lab/ServerLabLayout.jsx'));
const ServerExperimentsTab = lazy(() => import('../modules/server-lab/ExperimentsTab.jsx'));
const ServerFormTab = lazy(() => import('../modules/server-lab/FormTab.jsx'));
const ServerSessionsTab = lazy(() => import('../modules/server-lab/SessionsTab.jsx'));
const ServerFilesTab = lazy(() => import('../modules/server-lab/FilesTab.jsx'));
const DatabaseLabPage = lazy(() => import('../modules/database-lab/DatabaseLabPage.jsx'));
const ComponentStudioLayout = lazy(() => import('../modules/component-studio/ComponentStudioLayout.jsx'));
const ComponentTreeTab = lazy(() => import('../modules/component-studio/TreeTab.jsx'));
const JsxTab = lazy(() => import('../modules/component-studio/JsxTab.jsx'));
const PropsTab = lazy(() => import('../modules/component-studio/PropsTab.jsx'));
const StateLabLayout = lazy(() => import('../modules/state-lab/StateLabLayout.jsx'));
const StateTab = lazy(() => import('../modules/state-lab/StateTab.jsx'));
const HooksTab = lazy(() => import('../modules/state-lab/HooksTab.jsx'));
const RoutingVisualizerPage = lazy(() => import('../modules/routing/RoutingVisualizerPage.jsx'));
const ExecutionTraceLayout = lazy(() => import('../modules/execution-trace/ExecutionTraceLayout.jsx'));
const TraceExplorerTab = lazy(() => import('../modules/execution-trace/ExplorerTab.jsx'));
const FullStackFormTab = lazy(() => import('../modules/execution-trace/FullStackFormTab.jsx'));
const ProjectsPage = lazy(() => import('../pages/projects/ProjectsPage.jsx'));
const LearnLayout = lazy(() => import('../modules/learn/LearnLayout.jsx'));
const AssessmentsTab = lazy(() => import('../modules/learn/AssessmentsTab.jsx'));
const QuizPage = lazy(() => import('../modules/learn/QuizPage.jsx'));
const AttemptPage = lazy(() => import('../modules/learn/AttemptPage.jsx'));
const ProgressTab = lazy(() => import('../modules/learn/ProgressTab.jsx'));
const HistoryTab = lazy(() => import('../modules/learn/HistoryTab.jsx'));

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
          {
            path: 'lab/server-lab',
            element: <ServerLabLayout />,
            children: [
              { index: true, element: <ServerExperimentsTab /> },
              { path: 'form', element: <ServerFormTab /> },
              { path: 'sessions', element: <ServerSessionsTab /> },
              { path: 'files', element: <ServerFilesTab /> },
            ],
          },
          { path: 'lab/database-lab', element: <DatabaseLabPage /> },
          {
            path: 'lab/component-studio',
            element: <ComponentStudioLayout />,
            children: [
              { index: true, element: <ComponentTreeTab /> },
              { path: 'jsx', element: <JsxTab /> },
              { path: 'props', element: <PropsTab /> },
            ],
          },
          {
            path: 'lab/state-lab',
            element: <StateLabLayout />,
            children: [
              { index: true, element: <StateTab /> },
              { path: 'hooks', element: <HooksTab /> },
            ],
          },
          { path: 'lab/routing-visualizer', element: <RoutingVisualizerPage /> },
          {
            path: 'trace',
            element: <ExecutionTraceLayout />,
            children: [
              { index: true, element: <TraceExplorerTab /> },
              { path: 'form', element: <FullStackFormTab /> },
            ],
          },
          { path: 'projects', element: <ProjectsPage /> },
          {
            path: 'learn',
            element: <LearnLayout />,
            children: [
              { index: true, element: <AssessmentsTab /> },
              { path: 'quiz/:slug', element: <QuizPage /> },
              { path: 'attempts/:id', element: <AttemptPage /> },
              { path: 'progress', element: <ProgressTab /> },
              { path: 'history', element: <HistoryTab /> },
            ],
          },
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
