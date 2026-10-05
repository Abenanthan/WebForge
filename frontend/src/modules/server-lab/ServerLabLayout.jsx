import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Cookie, FileText, FlaskConical, Send, Server } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { SectionTabs } from '../../components/lab/SectionTabs.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './ServerLab.module.css';

const SECTIONS = [
  { to: '/lab/server-lab', end: true, label: 'PHP experiments', icon: FlaskConical },
  { to: '/lab/server-lab/form', label: 'Form processing', icon: Send },
  { to: '/lab/server-lab/sessions', label: 'Sessions', icon: Cookie },
  { to: '/lab/server-lab/files', label: 'File handling', icon: FileText },
];

/** Shared header and section navigation for the Server Lab. */
export default function ServerLabLayout() {
  return (
    <div className={styles.page}>
      <LabHeader
        icon={Server}
        layer="server"
        title="Server Lab"
        description="Watch PHP work on the server. You choose the input; fixed, whitelisted PHP code processes it, and every step it takes is shown. No code you type is ever executed."
        concepts={['variables', 'operators', 'conditions', 'loops', 'arrays', 'strings', 'functions', '$_POST', 'htmlspecialchars', '$_SESSION', 'fopen / fwrite']}
      />
      <SectionTabs sections={SECTIONS} label="Server Lab sections" layer="server" />
      {/* Own boundary: switching sections keeps the header and tabs on screen. */}
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
