import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Activity, Anchor, RefreshCcw } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { SectionTabs } from '../../components/lab/SectionTabs.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './StateLab.module.css';

const SECTIONS = [
  { to: '/lab/state-lab', end: true, label: 'State visualizer', icon: RefreshCcw },
  { to: '/lab/state-lab/hooks', label: 'Hooks lab', icon: Anchor },
];

export default function StateLabLayout() {
  return (
    <div className={styles.page}>
      <LabHeader
        icon={Activity}
        layer="state"
        title="State & Hooks"
        description="State is data a component remembers between renders. Change it and React re-renders; effects let a component synchronise with things outside React."
        concepts={['useState', 'setState', 'functional updates', 'batching', 'immutability', 'Object.is', 'useEffect', 'dependency array', 'cleanup']}
      />
      <SectionTabs sections={SECTIONS} label="State & Hooks sections" layer="state" />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
