import { useSyncExternalStore } from 'react';
import { networkLog } from '../services/networkLog.js';

/** Live list of every request made through apiClient (newest first). */
export function useNetworkLog() {
  return useSyncExternalStore(networkLog.subscribe, networkLog.getAll, networkLog.getAll);
}
