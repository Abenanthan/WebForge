import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlowPipeline } from './FlowPipeline.jsx';
import { TreeView } from './TreeView.jsx';

describe('FlowPipeline', () => {
  const steps = [
    { id: 'a', label: 'Request', layer: 'network', status: 'done' },
    { id: 'b', label: 'Server', layer: 'server', status: 'active' },
    { id: 'c', label: 'Render', layer: 'render', status: 'idle' },
  ];

  it('announces each step status to screen readers and marks the active step', () => {
    render(<FlowPipeline steps={steps} label="Flow" />);
    const items = within(screen.getByRole('list', { name: 'Flow' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Request(completed)');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveTextContent('(not reached)');
    expect(screen.queryByRole('button')).toBeNull(); // not interactive without onSelect
  });

  it('becomes selectable buttons when onSelect is given', async () => {
    const onSelect = vi.fn();
    render(<FlowPipeline steps={steps} label="Flow" selectedId="a" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Request/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Render/ }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });
});

describe('TreeView (WAI-ARIA tree pattern)', () => {
  const nodes = [
    { id: 'html', children: [
      { id: 'head' },
      { id: 'body', children: [{ id: 'h1' }, { id: 'p' }] },
    ] },
  ];
  const setup = (props = {}) => {
    const onSelect = vi.fn();
    render(<TreeView nodes={nodes} label="DOM" onSelect={onSelect} renderLabel={(n) => n.id} defaultExpandedDepth={1} {...props} />);
    return onSelect;
  };
  const item = (name) => screen.getByRole('treeitem', { name: new RegExp(`^${name}`) });

  it('uses a single roving tab stop', () => {
    setup();
    const focusable = screen.getAllByRole('treeitem').filter((el) => el.tabIndex === 0);
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toBe(item('html'));
  });

  it('moves, expands, collapses and selects with the keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = setup();
    item('html').focus();

    await user.keyboard('{ArrowDown}');
    expect(item('head')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('body')).toHaveFocus();
    expect(item('body')).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowRight}'); // expand
    expect(item('body')).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowRight}'); // into first child
    expect(item('h1')).toHaveFocus();
    expect(item('h1')).toHaveAttribute('aria-level', '3');

    await user.keyboard('{ArrowLeft}'); // back to parent
    expect(item('body')).toHaveFocus();
    await user.keyboard('{End}');
    expect(item('p')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(item('html')).toHaveFocus();

    await user.keyboard('{End}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('p');
  });

  it('reveals a selected node hidden inside collapsed branches', () => {
    setup({ selectedId: 'p', defaultExpandedDepth: 0 });
    expect(item('p')).toHaveAttribute('aria-selected', 'true');
    expect(item('body')).toHaveAttribute('aria-expanded', 'true');
  });
});
