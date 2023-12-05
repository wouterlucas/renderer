import { assertTruthy } from '../utils.js';
import { CoreNode } from './CoreNode.js';

export type NodeTree = {
  add(node: CoreNode): void;
  get(id: number): CoreNode | undefined;
  remove(id: number): void;
  sort(): void;
  getNodes(): CoreNode[];
  findParent(n: CoreNode): CoreNode | undefined;
  findChildren(n: CoreNode): CoreNode[];
};

let _tree: Map<number, CoreNode> = new Map<number, CoreNode>();
const _dirtyNodes: Map<number, CoreNode> = new Map<number, CoreNode>();

export const tree = {
  add(node: CoreNode) {
    // console.log('Adding node', node.id, _tree);
    _tree.set(node.id, node);
  },

  get(id: number | null): CoreNode | null {
    if (id === null) {
      return null;
    }

    // console.log('Getting node', id, _tree);
    const resp = _tree.get(id);
    assertTruthy(resp, `Node ${id} not found`);
    return resp;
  },

  remove(id: number) {
    // console.log('Removing node', id);
    _tree.delete(id);
  },

  sort() {
    const sorted = Array.from(_tree.values()).sort((a, b) => a.id - b.id);
    _tree = new Map<number, CoreNode>(sorted.map((n) => [n.id, n]));
  },

  getNodes(idList: Array<number> | undefined): CoreNode[] {
    console.log('Getting nodes', idList);
    if (idList && idList.length > 0) {
      return idList
        .map((id) => {
          const node = this.get(id);
          return node;
        })
        .filter(Boolean) as CoreNode[];
    }

    return Array.from(_tree.values());
  },

  findParent(n: CoreNode): CoreNode | undefined {
    assertTruthy(n.parentId, 'Node has no parent');

    return _tree.get(n.parentId);
  },

  findChildren(n: CoreNode): CoreNode[] {
    assertTruthy(n.childrenIds, 'Node has no children');

    return n.childrenIds
      .map((id) => this.get(id))
      .filter(Boolean) as CoreNode[];
  },

  getAllNodes(): CoreNode[] {
    return Array.from(_tree.values());
  },

  // Dirty nodes
  markDirty(node: CoreNode) {
    _dirtyNodes.set(node.id, node);
  },

  getDirtyNodes(): CoreNode[] {
    return Array.from(_dirtyNodes.values());
  },

  clearDirtyNodes(): void {
    _dirtyNodes.clear();
  },

  hasDirtyNodes(): boolean {
    return _dirtyNodes.size > 0;
  },
};
