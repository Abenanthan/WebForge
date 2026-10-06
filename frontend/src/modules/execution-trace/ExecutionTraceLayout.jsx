import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { FormInput, ScanSearch, Waypoints } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { SectionTabs } from '../../components/lab/SectionTabs.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './ExecutionTrace.module.css';

const SECTIONS = [
  { to: '/trace', end: true, label: 'Trace explorer', icon: ScanSearch },
  { to: '/trace/form', label: 'Full-stack form', icon: FormInput },
];

export default function ExecutionTraceLayout() {
  return (
    <div className={styles.page}>
      <LabHeader
        icon={Waypoints}
        layer="network"
        title="Execution Trace"
        description="Follow one real operation through every layer: the click, the event, validation, state, the HTTP request, PHP, the SQL it ran, the response, React's re-render and the DOM update. Every step is measured, not simulated."
        concepts={['trace id', 'spans', 'client vs server time', 'X-Trace-Id header', 'prepared statements', 'render commit', 'waterfall']}
      />
      <SectionTabs sections={SECTIONS} label="Execution Trace sections" layer="network" />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
