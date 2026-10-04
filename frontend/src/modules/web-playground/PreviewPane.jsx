import { useEffect, useRef, useState } from 'react';
import { Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { SandboxFrame } from '../../sandbox/SandboxFrame.jsx';
import styles from './WebPlayground.module.css';

export const DEVICES = [
  { id: 'responsive', label: 'Responsive', icon: Monitor, width: null, height: null },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768, height: 1024 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 375, height: 667 },
];

/** Live preview with device emulation; fixed-size devices scale down to fit the pane. */
export function PreviewPane({ run, onMessage, onRefresh, device, onDeviceChange }) {
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const preset = DEVICES.find((d) => d.id === device) ?? DEVICES[0];

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padding = 24;
  const scale = preset.width
    ? Math.min(1, (stage.width - padding) / preset.width, (stage.height - padding) / preset.height)
    : 1;
  const sizeLabel = preset.width
    ? `${preset.width} × ${preset.height}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}`
    : `${Math.round(stage.width)} × ${Math.round(stage.height)}`;

  return (
    <section className={styles.preview} aria-label="Live preview">
      <div className={styles.paneHeader}>
        <span className={styles.paneTitle}>Preview</span>
        <div className={styles.deviceGroup} role="radiogroup" aria-label="Preview device">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={device === d.id}
                className={styles.deviceButton}
                onClick={() => onDeviceChange(d.id)}
                title={d.label}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="sr-only">{d.label}</span>
              </button>
            );
          })}
        </div>
        <span className={styles.sizeLabel}>{sizeLabel}</span>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRefresh} aria-label="Reload preview" title="Reload preview" />
      </div>

      <div ref={stageRef} className={`${styles.stage} ${preset.width ? styles.stageDevice : ''}`}>
        {run ? (
          <div
            className={styles.deviceFrame}
            style={preset.width ? {
              width: preset.width,
              height: preset.height,
              transform: `scale(${scale})`,
            } : undefined}
          >
            <SandboxFrame
              srcdoc={run.srcdoc}
              runId={run.id}
              onMessage={onMessage}
              title="Preview of index.html"
              className={styles.frame}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
