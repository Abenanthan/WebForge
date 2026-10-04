import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { setDiagnostics } from '@codemirror/lint';
import { webforgeEditorTheme } from './editorTheme.js';
import styles from './CodeEditor.module.css';

const LANGUAGES = {
  html: () => html(),
  css: () => css(),
  javascript: () => javascript(),
  jsx: () => javascript({ jsx: true }),
};

/**
 * CodeMirror 6 editor for multiple documents.
 * One EditorState is kept per `docId`, so each file keeps its own undo history,
 * selection and scroll position when the user switches tabs.
 *
 * Imperative handle: focus(), goTo(line, col)
 * diagnostics: [{ line, col?, message }]  (1-based, rendered as squiggles + gutter)
 */
export const CodeEditor = forwardRef(function CodeEditor(
  { docId, value, language, onChange, onRun, onSave, diagnostics = [], ariaLabel, readOnly = false },
  ref,
) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const statesRef = useRef(new Map());
  const currentDocRef = useRef(docId);
  const callbacks = useRef({ onChange, onRun, onSave });
  callbacks.current = { onChange, onRun, onSave };

  function createState(doc) {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        Prec.highest(keymap.of([
          { key: 'Mod-Enter', run: () => { callbacks.current.onRun?.(); return true; } },
          { key: 'Mod-s', preventDefault: true, run: () => { callbacks.current.onSave?.(); return true; } },
        ])),
        (LANGUAGES[language] ?? LANGUAGES.javascript)(),
        webforgeEditorTheme,
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? `${docId} editor` }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString());
        }),
      ],
    });
  }

  // Mount once.
  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current, state: createState(value) });
    viewRef.current = view;
    statesRef.current.set(docId, view.state);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch documents, or replace content changed from outside (reset, project load).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const states = statesRef.current;

    if (currentDocRef.current !== docId) {
      states.set(currentDocRef.current, view.state); // remember the outgoing document
      const saved = states.get(docId);
      view.setState(saved && saved.doc.toString() === value ? saved : createState(value));
      currentDocRef.current = docId;
      return;
    }
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, value]);

  // Show runtime/syntax errors inside the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const mapped = diagnostics
      .filter((d) => d.line >= 1 && d.line <= doc.lines)
      .map((d) => {
        const line = doc.line(d.line);
        const from = Math.min(line.from + Math.max(0, (d.col ?? 1) - 1), line.to);
        return { from, to: line.to > from ? line.to : from, severity: 'error', message: d.message };
      });
    view.dispatch(setDiagnostics(view.state, mapped));
  }, [diagnostics, docId, value]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    goTo(line, col = 1) {
      const view = viewRef.current;
      if (!view) return;
      const l = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
      const pos = Math.min(l.from + Math.max(0, col - 1), l.to);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      view.focus();
    },
  }), []);

  return <div ref={hostRef} className={styles.host} data-doc={docId} />;
});
