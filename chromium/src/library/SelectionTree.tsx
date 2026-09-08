import { useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { t } from "../i18n";

export interface SelectionNode {
  id: string;
  label: string;
  children?: SelectionNode[];
  selectable?: boolean;
  showCount?: boolean;
}
export function treeIds(node: SelectionNode): string[] {
  return [...(node.selectable === false ? [] : [node.id]), ...(node.children ?? []).flatMap(treeIds)];
}
export function SelectionTree({ nodes, selected, onSelect, render }: {
  nodes: SelectionNode[]; selected: Set<string>; onSelect: (ids: string[], checked: boolean) => void;
  render?: (node: SelectionNode) => ReactNode;
}) {
  return <div className="selection-tree">{nodes.map((node) => <TreeNode key={node.id} node={node} selected={selected} onSelect={onSelect} render={render} />)}</div>;
}
function TreeNode({ node, selected, onSelect, render, depth = 0 }: {
  depth?: number;
  node: SelectionNode; selected: Set<string>; onSelect: (ids: string[], checked: boolean) => void;
  render?: (node: SelectionNode) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const ids = treeIds(node);
  const count = ids.filter((id) => selected.has(id)).length;
  return <div className="selection-tree__node">
    <div className="selection-tree__row">
      <div className="selection-tree__identity" style={{ "--tree-depth": depth } as CSSProperties}>
        {node.children?.length ? <button className="selection-tree__toggle" type="button" aria-expanded={expanded} aria-label={node.label} onClick={() => setExpanded(!expanded)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></button> : <span className="selection-tree__spacer" />}
        <input type="checkbox" aria-label={node.label} checked={count === ids.length} ref={(input) => { if (input) input.indeterminate = count > 0 && count < ids.length; }} onChange={(event) => onSelect(ids, event.target.checked)} />
        <strong title={node.label}>{node.label}</strong>
        {node.showCount ? <span className="selection-tree__count" title={t("linkCount")}>{ids.length}</span> : null}
      </div>
      {render?.(node)}
    </div>
    {expanded && node.children?.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} render={render} />)}
  </div>;
}
export function TreeSelectionActions({ nodes, onSelect }: { nodes: SelectionNode[]; onSelect: (ids: string[], checked: boolean) => void }) {
  return <div className="bookmark-preview-actions"><Button type="button" variant="secondary" onClick={() => onSelect(nodes.flatMap(treeIds), true)}>{t("selectAll")}</Button><Button type="button" variant="ghost" onClick={() => onSelect(nodes.flatMap(treeIds), false)}>{t("cancelSelection")}</Button></div>;
}
