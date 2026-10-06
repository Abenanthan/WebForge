import {
  ArrowLeftRight,
  Braces,
  ClipboardCheck,
  Code,
  Component,
  Database,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  MousePointerClick,
  Network,
  Palette,
  Route,
  Server,
  Activity,
  Waypoints,
} from 'lucide-react';

/**
 * Single source of truth for every WebForge section.
 * Drives the sidebar, dashboard quick-launch and route registration.
 *
 * status: 'ready'   → route is registered and fully functional
 *         'planned' → shown disabled with the phase it lands in (never a dead link)
 * layer:  colour token (--layer-*) used for the module's accent
 * quiz:   slug of the related assessment (LabHeader links to it)
 */
export const MODULE_GROUPS = [
  {
    id: 'overview',
    label: 'Overview',
    modules: [
      { id: 'dashboard', title: 'Dashboard', path: '/', icon: LayoutDashboard, layer: 'ui', status: 'ready',
        description: 'Progress, recent work and quick launch.' },
    ],
  },
  {
    id: 'client',
    label: 'Client-side Labs',
    modules: [
      { id: 'web-playground', title: 'Web Playground', path: '/lab/web-playground', icon: Code, layer: 'render', status: 'ready', quiz: 'html-css-fundamentals',
        description: 'HTML, CSS & JS editor with live preview and console.' },
      { id: 'js-playground', title: 'JS Playground', path: '/lab/js-playground', icon: Braces, layer: 'state', status: 'ready', quiz: 'javascript-core',
        description: 'Run JavaScript and watch input → execution → output.' },
      { id: 'dom-explorer', title: 'DOM Explorer', path: '/lab/dom-explorer', icon: Network, layer: 'dom', status: 'ready', quiz: 'dom-and-events',
        description: 'Inspect the DOM tree and mutate elements live.' },
      { id: 'event-visualizer', title: 'Event Visualizer', path: '/lab/event-visualizer', icon: MousePointerClick, layer: 'event', status: 'ready', quiz: 'dom-and-events',
        description: 'Follow an event from user action to UI update.' },
      { id: 'form-lab', title: 'Form Validation Lab', path: '/lab/form-lab', icon: ClipboardCheck, layer: 'validation', status: 'ready', quiz: 'dom-and-events',
        description: 'Client-side vs server-side validation, side by side.' },
      { id: 'ajax-monitor', title: 'AJAX Monitor', path: '/lab/ajax-monitor', icon: ArrowLeftRight, layer: 'network', status: 'ready', quiz: 'ajax-and-http',
        description: 'Send real async requests and inspect every byte.' },
      { id: 'canvas-studio', title: 'Canvas Studio', path: '/lab/canvas-studio', icon: Palette, layer: 'dom', status: 'ready', quiz: 'html-css-fundamentals',
        description: 'Draw with the Canvas API and pointer events.' },
    ],
  },
  {
    id: 'server',
    label: 'Server-side Labs',
    modules: [
      { id: 'server-lab', title: 'Server Lab', path: '/lab/server-lab', icon: Server, layer: 'server', status: 'ready', quiz: 'php-and-mysql',
        description: 'PHP processing, sessions and file handling, step by step.' },
      { id: 'database-lab', title: 'Database Lab', path: '/lab/database-lab', icon: Database, layer: 'database', status: 'ready', quiz: 'php-and-mysql',
        description: 'INSERT, SELECT, UPDATE, DELETE with the real SQL shown.' },
    ],
  },
  {
    id: 'react',
    label: 'React Labs',
    modules: [
      { id: 'component-studio', title: 'Component Studio', path: '/lab/component-studio', icon: Component, layer: 'render', status: 'ready', quiz: 'react-fundamentals',
        description: 'Component trees, JSX and props flowing between them.' },
      { id: 'state-lab', title: 'State & Hooks', path: '/lab/state-lab', icon: Activity, layer: 'state', status: 'ready', quiz: 'react-fundamentals',
        description: 'useState, useEffect and every re-render they cause.' },
      { id: 'routing-visualizer', title: 'Routing Visualizer', path: '/lab/routing-visualizer', icon: Route, layer: 'router', status: 'ready', quiz: 'react-fundamentals',
        description: 'Watch the router match paths and render components.' },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    modules: [
      { id: 'execution-trace', title: 'Execution Trace', path: '/trace', icon: Waypoints, layer: 'network', status: 'ready', quiz: 'ajax-and-http', signature: true,
        description: 'See one operation travel through every layer of the stack.' },
      { id: 'projects', title: 'Projects', path: '/projects', icon: FolderKanban, layer: 'database', status: 'ready',
        description: 'Save, open and manage your experiments.' },
      { id: 'learn', title: 'Learn & Assess', path: '/learn', icon: GraduationCap, layer: 'state', status: 'ready',
        description: 'Quizzes, history and concept mastery.' },
    ],
  },
];

export const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

/** The eight labs featured on the dashboard. */
export const QUICK_LAUNCH_IDS = [
  'web-playground', 'dom-explorer', 'event-visualizer', 'ajax-monitor',
  'server-lab', 'database-lab', 'component-studio', 'execution-trace',
];

export function findModuleByPath(pathname) {
  return ALL_MODULES.find((m) => m.path !== '/' && pathname.startsWith(m.path))
    ?? ALL_MODULES.find((m) => m.path === pathname);
}
