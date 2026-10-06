import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ClipboardList, GraduationCap, History, TrendingUp } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { SectionTabs } from '../../components/lab/SectionTabs.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './Learn.module.css';

const SECTIONS = [
  { to: '/learn', end: true, label: 'Assessments', icon: ClipboardList },
  { to: '/learn/progress', label: 'Progress', icon: TrendingUp },
  { to: '/learn/history', label: 'History', icon: History },
];

export default function LearnLayout() {
  return (
    <div className={styles.page}>
      <LabHeader
        icon={GraduationCap}
        layer="state"
        title="Learn & Assess"
        description="Test what you learned in the labs. Answers are graded on the server; every result explains the right answer and points you to the lab that teaches it."
        concepts={['multiple choice', 'true / false', 'predict the output', 'find the error', 'matching', 'concept mastery']}
      />
      <SectionTabs sections={SECTIONS} label="Learn sections" layer="state" />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
