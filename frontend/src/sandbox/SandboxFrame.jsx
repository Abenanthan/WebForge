import { forwardRef, useEffect, useRef } from 'react';

/**
 * Sandboxed preview iframe.
 *  - sandbox="allow-scripts allow-modals": opaque origin, so user code cannot read the
 *    app's cookies, storage or DOM; no forms, popups or top-level navigation.
 *  - Messages are accepted only from this iframe's window and the current run.
 * A new runId remounts the iframe so every run starts from a clean document.
 */
export const SandboxFrame = forwardRef(function SandboxFrame({ srcdoc, runId, onMessage, title, className }, ref) {
  const frameRef = useRef(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    function receive(event) {
      const frame = frameRef.current;
      const data = event.data;
      if (!frame || event.source !== frame.contentWindow) return;
      if (!data || data.__webforge !== 'sandbox' || data.runId !== runId) return;
      handlerRef.current?.(data);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [runId]);

  return (
    <iframe
      key={runId}
      ref={(node) => {
        frameRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      title={title}
      className={className}
      sandbox="allow-scripts allow-modals"
      referrerPolicy="no-referrer"
      srcDoc={srcdoc}
    />
  );
});
