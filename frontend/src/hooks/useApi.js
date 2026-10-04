import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and exposes loading / success / error state.
 * The loader receives an AbortSignal; stale requests are aborted on re-run/unmount.
 *
 *   const { data, error, status, reload } = useApi((signal) => api.get('/stats/dashboard', { signal }), []);
 */
export function useApi(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    loaderRef.current(controller.signal).then(
      (data) => !controller.signal.aborted && setState({ status: 'success', data, error: null }),
      (error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        setState((s) => ({ ...s, status: 'error', error }));
      },
    );
    return controller;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const controllerRef = useRef(null);
  const reload = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = run();
  }, [run]);

  useEffect(() => {
    controllerRef.current = run();
    return () => controllerRef.current?.abort();
  }, [run]);

  return { ...state, reload };
}
