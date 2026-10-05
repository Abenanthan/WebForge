import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ArrowDownUp, Code, Component, Network } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { SectionTabs } from '../../components/lab/SectionTabs.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './ComponentStudio.module.css';

const SECTIONS = [
  { to: '/lab/component-studio', end: true, label: 'Component tree', icon: Network },
  { to: '/lab/component-studio/jsx', label: 'JSX playground', icon: Code },
  { to: '/lab/component-studio/props', label: 'Props visualizer', icon: ArrowDownUp },
];

export default function ComponentStudioLayout() {
  return (
    <div className={styles.page}>
      <LabHeader
        icon={Component}
        layer="render"
        title="Component Studio"
        description="See how a React app is built from components: the tree they form, the props that flow down, the state each one owns, and every re-render it causes."
        concepts={['components', 'JSX', 'React.createElement', 'props', 'state', 'children', 're-render', 'React.memo', 'keys']}
      />
      <SectionTabs sections={SECTIONS} label="Component Studio sections" layer="render" />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
