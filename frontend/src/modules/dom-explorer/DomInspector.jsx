import { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import styles from './DomExplorer.module.css';

const NEW_TAGS = ['div', 'p', 'span', 'h2', 'h3', 'li', 'button', 'section', 'strong', 'em', 'a', 'small'];
const STYLE_SUGGESTIONS = ['color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin', 'border', 'border-radius', 'display', 'opacity', 'text-align', 'width'];
const SHOWN_STYLES = ['display', 'position', 'color', 'background-color', 'font-size', 'font-weight', 'font-family', 'line-height', 'text-align', 'border-radius', 'opacity', 'cursor'];

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function BoxModel({ box }) {
  const sides = (values) => values.map((v) => (v === '0px' ? '–' : v.replace('px', '')));
  const [mt, mr, mb, ml] = sides(box.margin);
  const [bt, br, bb, bl] = sides(box.border);
  const [pt, pr, pb, pl] = sides(box.padding);
  return (
    <div className={styles.boxModel} aria-label={`Box model: ${box.width} by ${box.height} pixels`}>
      <div className={styles.boxMargin}>
        <span className={styles.boxLabel}>margin</span>
        <span className={styles.boxTop}>{mt}</span><span className={styles.boxRight}>{mr}</span>
        <span className={styles.boxBottom}>{mb}</span><span className={styles.boxLeft}>{ml}</span>
        <div className={styles.boxBorder}>
          <span className={styles.boxLabel}>border</span>
          <span className={styles.boxTop}>{bt}</span><span className={styles.boxRight}>{br}</span>
          <span className={styles.boxBottom}>{bb}</span><span className={styles.boxLeft}>{bl}</span>
          <div className={styles.boxPadding}>
            <span className={styles.boxLabel}>padding</span>
            <span className={styles.boxTop}>{pt}</span><span className={styles.boxRight}>{pr}</span>
            <span className={styles.boxBottom}>{pb}</span><span className={styles.boxLeft}>{pl}</span>
            <div className={styles.boxContent}>{box.width} × {box.height}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Details of the selected element plus the controlled actions the explorer allows.
 * Every action is executed inside the sandbox by the inspector runtime.
 */
export function DomInspector({ details, onCommand, onSelect, busy }) {
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [newTag, setNewTag] = useState('li');
  const [newText, setNewText] = useState('');
  const [styleProp, setStyleProp] = useState('color');
  const [styleValue, setStyleValue] = useState('');
  const [newClass, setNewClass] = useState('');

  // Pre-fill editors with the element's current content when the selection changes.
  useEffect(() => {
    if (details?.kind !== 'element') return;
    setText(details.text ?? '');
    setHtml(details.html ?? '');
  }, [details?.id, details?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (details.missing) {
    return <p className={styles.muted}>This node is no longer in the document. Pick another element.</p>;
  }

  if (details.kind === 'text') {
    return (
      <div className={styles.inspector}>
        <Section title="Text node">
          <p className={styles.textNode}>&quot;{details.text}&quot;</p>
          {details.parent && (
            <p className={styles.muted}>
              Inside{' '}
              <button type="button" className={styles.nodeLink} onClick={() => onSelect(details.parent.id)}>{details.parent.label}</button>
            </p>
          )}
        </Section>
      </div>
    );
  }

  const run = (cmd, args) => onCommand(cmd, details.id, args);
  const isRoot = ['html', 'body', 'head'].includes(details.tag);

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHead}>
        <p className={styles.nodeTitle}>
          <span className={styles.tag}>&lt;{details.tag}</span>
          {details.elId && <span className={styles.idPart}>#{details.elId}</span>}
          {details.classes.map((c) => <span key={c} className={styles.classPart}>.{c}</span>)}
          <span className={styles.tag}>&gt;</span>
        </p>
        <code className={styles.selector} title="CSS selector for this element">{details.selector}</code>
        <div className={styles.quickActions}>
          <Button size="sm" icon={details.hidden ? Eye : EyeOff} onClick={() => run('toggleVisibility')} disabled={busy}>
            {details.hidden ? 'Show' : 'Hide'}
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => run('remove')} disabled={busy || isRoot}>Remove</Button>
        </div>
      </div>

      <Section title="Classes">
        <ul className={styles.classList}>
          {details.classes.length === 0 && <li className={styles.muted}>No classes</li>}
          {details.classes.map((c) => (
            <li key={c} className={styles.classChip}>
              .{c}
              <button type="button" aria-label={`Remove class ${c}`} onClick={() => run('removeClass', { className: c })} disabled={busy}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form className={styles.inlineForm} onSubmit={(e) => { e.preventDefault(); if (newClass.trim()) { run('addClass', { className: newClass.trim() }); setNewClass(''); } }}>
          <label className="sr-only" htmlFor="new-class">New class name</label>
          <input id="new-class" className={styles.input} placeholder="new-class" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
          <Button size="sm" type="submit" icon={Plus} disabled={busy || !newClass.trim()}>Add class</Button>
        </form>
      </Section>

      <Section title="Attributes">
        {details.attributes.length === 0 ? <p className={styles.muted}>No attributes</p> : (
          <table className={styles.kvTable}>
            <tbody>
              {details.attributes.map(([name, value]) => (
                <tr key={name}><th scope="row">{name}</th><td>{value === '' ? <em className={styles.muted}>(empty)</em> : value}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {!isRoot && (
        <Section title="Text content">
          <form className={styles.stackForm} onSubmit={(e) => { e.preventDefault(); run('setText', { text }); }}>
            <label className="sr-only" htmlFor="el-text">Text content</label>
            <textarea id="el-text" className={styles.textarea} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            <Button size="sm" type="submit" disabled={busy}>Set textContent</Button>
          </form>
        </Section>
      )}

      {!isRoot && (
        <Section title="Inner HTML">
          <form className={styles.stackForm} onSubmit={(e) => { e.preventDefault(); run('setHtml', { html }); }}>
            <label className="sr-only" htmlFor="el-html">Inner HTML</label>
            <textarea id="el-html" className={`${styles.textarea} mono`} rows={3} value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} />
            <Button size="sm" type="submit" disabled={busy}>Set innerHTML</Button>
          </form>
        </Section>
      )}

      <Section title="Add child element">
        <form className={styles.inlineForm} onSubmit={(e) => { e.preventDefault(); run('addChild', { tag: newTag, text: newText }); setNewText(''); }}>
          <label className="sr-only" htmlFor="new-tag">Tag</label>
          <select id="new-tag" className={styles.input} value={newTag} onChange={(e) => setNewTag(e.target.value)}>
            {NEW_TAGS.map((t) => <option key={t} value={t}>&lt;{t}&gt;</option>)}
          </select>
          <label className="sr-only" htmlFor="new-text">Text</label>
          <input id="new-text" className={styles.input} placeholder="Text (optional)" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <Button size="sm" type="submit" icon={Plus} disabled={busy}>Append</Button>
        </form>
      </Section>

      <Section title="Inline style">
        <form className={styles.inlineForm} onSubmit={(e) => { e.preventDefault(); run('setStyle', { prop: styleProp, value: styleValue }); }}>
          <label className="sr-only" htmlFor="style-prop">CSS property</label>
          <input id="style-prop" className={`${styles.input} mono`} list="style-props" value={styleProp} onChange={(e) => setStyleProp(e.target.value)} />
          <datalist id="style-props">{STYLE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
          <label className="sr-only" htmlFor="style-value">Value</label>
          <input id="style-value" className={`${styles.input} mono`} placeholder="e.g. tomato" value={styleValue} onChange={(e) => setStyleValue(e.target.value)} />
          <Button size="sm" type="submit" disabled={busy || !styleProp.trim()}>Apply</Button>
        </form>
        {details.inlineStyle && <code className={styles.inlineStyle}>style=&quot;{details.inlineStyle}&quot;</code>}
      </Section>

      <Section title="Family">
        <dl className={styles.family}>
          <dt>Parent</dt>
          <dd>
            {details.parent
              ? <button type="button" className={styles.nodeLink} onClick={() => onSelect(details.parent.id)}>{details.parent.label}</button>
              : <span className={styles.muted}>none (document root)</span>}
          </dd>
          <dt>Children ({details.children.length})</dt>
          <dd className={styles.childLinks}>
            {details.children.length === 0 && <span className={styles.muted}>none</span>}
            {details.children.map((c) => (
              <button key={c.id} type="button" className={styles.nodeLink} onClick={() => onSelect(c.id)}>{c.label}</button>
            ))}
          </dd>
        </dl>
      </Section>

      <Section title="Box model">
        <BoxModel box={details.box} />
      </Section>

      <Section title="Computed styles">
        <table className={styles.kvTable}>
          <tbody>
            {SHOWN_STYLES.map((p) => (
              <tr key={p}>
                <th scope="row">{p}</th>
                <td>
                  {/^rgb/.test(details.styles[p]) && <span className={styles.swatch} style={{ background: details.styles[p] }} aria-hidden="true" />}
                  {details.styles[p]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
