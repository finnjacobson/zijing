import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CharShard, StrokeData, TreeNode } from '../lib/types';
import { StrokeSvg } from './StrokeSvg';

const OP_NAMES: Record<string, string> = {
  '⿰': 'left → right',
  '⿱': 'top → bottom',
  '⿲': 'left → middle → right',
  '⿳': 'top → middle → bottom',
  '⿴': 'surround',
  '⿵': 'surround from above',
  '⿶': 'surround from below',
  '⿷': 'surround from left',
  '⿸': 'surround from upper left',
  '⿹': 'surround from upper right',
  '⿺': 'surround from lower left',
  '⿻': 'overlaid',
};
const ROLE_LABEL = { semantic: 'meaning', phonetic: 'sound', form: 'form' } as const;

function Node({ node, depth, onHover, active }: { node: TreeNode; depth: number; onHover: (n: TreeNode | null) => void; active: TreeNode | null }) {
  const [open, setOpen] = useState(depth < 2);
  // Pure IDS grouping node without a character of its own (e.g. ⿱ inside a larger IDS).
  if (!node.c) {
    return (
      <div className="tnode group">
        <span className="op" title={OP_NAMES[node.op ?? ''] ?? node.op}>
          {node.op}
        </span>
        <Kids node={node} depth={depth} onHover={onHover} active={active} />
      </div>
    );
  }
  const unknown = node.c === '？';
  const hasKids = !!node.kids?.length;
  return (
    <div className={'tnode' + (node.role ? ' role-' + node.role : '')}>
      <div
        className={'tcard' + (active === node ? ' active' : '')}
        onMouseEnter={() => node.strokes && onHover(node)}
        onMouseLeave={() => node.strokes && onHover(null)}
      >
        {unknown ? (
          <span className="tchar unknown" title="Component not identified in Make Me a Hanzi">
            ？
          </span>
        ) : depth === 0 ? (
          <span className="tchar kai">{node.c}</span>
        ) : (
          <Link to={`/char/${node.c}`} className="tchar kai" onFocus={() => node.strokes && onHover(node)} onBlur={() => onHover(null)}>
            {node.c}
          </Link>
        )}
        {depth > 0 && node.role && <span className={'role-tag ' + node.role}>{ROLE_LABEL[node.role]}</span>}
        {hasKids && (
          <button className="tcaret" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}>
            <span className="op">{node.op}</span>
            {open ? '−' : '+'}
          </button>
        )}
      </div>
      {hasKids && open && <Kids node={node} depth={depth} onHover={onHover} active={active} />}
    </div>
  );
}

function Kids({ node, depth, onHover, active }: { node: TreeNode; depth: number; onHover: (n: TreeNode | null) => void; active: TreeNode | null }) {
  return (
    <div className="tkids">
      {node.kids!.map((k, i) => (
        <Node key={i} node={k} depth={depth + 1} onHover={onHover} active={active} />
      ))}
    </div>
  );
}

export function DecompTree({ shard, strokes }: { shard: CharShard; strokes: StrokeData | null }) {
  const [hover, setHover] = useState<TreeNode | null>(null);
  const tree = shard.tree;
  const mm = shard.mm;
  if (!tree || !mm) return <div className="empty-state">No decomposition data for this character.</div>;
  const ety = mm.ety;
  const decomposable = !!tree.kids?.length;
  const firstLevel = (tree.kids ?? []).flatMap(function walk(n): TreeNode[] {
    return n.c ? [n] : (n.kids ?? []).flatMap(walk);
  });

  return (
    <div className="decomp">
      <div className="ety-summary">
        {mm.from !== shard.c && (
          <p className="faint small">
            Structure data is for the {shard.k === 't' ? 'simplified' : 'traditional'} form{' '}
            <Link to={`/char/${mm.from}`} className="kai">
              {mm.from}
            </Link>
            .
          </p>
        )}
        {ety ? (
          <p>
            <span className="chip zhu">{ety.type}</span>{' '}
            {ety.type === 'pictophonetic' ? (
              <>
                {ety.semantic && (
                  <>
                    <Link to={`/char/${ety.semantic}`} className="kai role-semantic-text">
                      {ety.semantic}
                    </Link>{' '}
                    {ety.hint ? <span className="muted">({ety.hint})</span> : null} gives the meaning
                  </>
                )}
                {ety.semantic && ety.phonetic && '; '}
                {ety.phonetic && (
                  <>
                    <Link to={`/char/${ety.phonetic}`} className="kai role-phonetic-text">
                      {ety.phonetic}
                    </Link>{' '}
                    gives the sound
                  </>
                )}
                .
              </>
            ) : (
              <span>{ety.hint}</span>
            )}
          </p>
        ) : (
          <p className="faint small">No etymology note in Make Me a Hanzi.</p>
        )}
        <p className="faint small">
          IDS <span className="ids">{mm.ids}</span>
          {tree.op && <> · {OP_NAMES[tree.op] ?? ''}</>}
        </p>
      </div>

      {decomposable ? (
        <div className="decomp-body">
          <div className="tree-scroll">
            <Node node={tree} depth={0} onHover={setHover} active={hover} />
          </div>
          {strokes && firstLevel.some((n) => n.strokes?.length) && (
            <div className="component-preview">
              <StrokeSvg data={strokes} focus={hover?.strokes ?? null} outline={false} colors={hover?.strokes ? Object.fromEntries(hover.strokes.map((i) => [i, hover.role === 'phonetic' ? 'var(--t3)' : hover.role === 'semantic' ? 'var(--jade)' : 'var(--zhu)'])) : undefined} />
              <div className="faint small">{hover ? `strokes of ${hover.c}` : 'Hover a component to see its strokes'}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">{shard.c} is a primitive: it doesn’t break down further in this data.</div>
      )}
      <div className="legend small">
        <span className="role-tag semantic">meaning</span> semantic component <span className="role-tag phonetic">sound</span> phonetic component{' '}
        <span className="role-tag form">form</span> structural / other
      </div>
    </div>
  );
}
