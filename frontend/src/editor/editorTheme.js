import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Editor chrome and syntax colours expressed as CSS variables (styles/tokens.css),
 * so the editor follows the app's dark/light theme without being reconfigured.
 */
const chrome = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--text)',
    fontSize: '13.5px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '10px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--editor-selection) !important',
  },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-gutter)',
    color: 'var(--editor-line-number)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--editor-active-line)', color: 'var(--text-muted)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warning-soft)', outline: '1px solid var(--warning)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    color: 'var(--text)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--text)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panel input, .cm-panel button': { fontSize: '12px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--danger)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--danger)',
    textUnderlineOffset: '3px',
  },
  '.cm-errorLine': { backgroundColor: 'var(--danger-soft)' },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.propertyName], color: 'var(--syn-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--syn-tag)' },
  { tag: [t.attributeName], color: 'var(--syn-attribute)' },
  { tag: [t.attributeValue], color: 'var(--syn-string)' },
  { tag: [t.className, t.typeName], color: 'var(--syn-type)' },
  { tag: [t.operator, t.punctuation, t.separator], color: 'var(--syn-operator)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--syn-variable)' },
  { tag: [t.color, t.constant(t.name)], color: 'var(--syn-number)' },
  { tag: t.invalid, color: 'var(--syn-invalid)' },
]);

export const webforgeEditorTheme = [chrome, syntaxHighlighting(highlight)];
