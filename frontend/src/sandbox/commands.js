/**
 * Send a command to the inspector runtime inside a sandboxed iframe.
 * The iframe has an opaque origin, so the target origin must be '*'; the
 * runtime only accepts messages whose source is its parent and whose runId matches.
 */
export function sendSandboxCommand(iframe, runId, cmd, id = null, args = {}) {
  iframe?.contentWindow?.postMessage({ __webforge: 'command', runId, cmd, id, args }, '*');
}
