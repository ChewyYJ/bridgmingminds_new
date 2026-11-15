/**
 * Build a display tree around the topic. Argument links remain available in
 * the outline, including links outside the display tree.
 */
export function layoutThoughtMap(map, availableWidth = 0) {
  if (!map.nodes.length || map.nodes.length > 12) return null;
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  if (byId.size !== map.nodes.length) return null;

  const outgoing = new Map(map.nodes.map(({ id }) => [id, []]));
  const neighbours = new Map(map.nodes.map(({ id }) => [id, []]));
  for (const { source, target } of map.edges) {
    if (!byId.has(source) || !byId.has(target)) return null;
    outgoing.get(source).push(target);
    neighbours.get(source).push(target);
    neighbours.get(target).push(source);
  }
  const checked = new Set();
  const active = new Set();
  function acyclic(id) {
    if (active.has(id)) return false;
    if (checked.has(id)) return true;
    active.add(id);
    if (!outgoing.get(id).every(acyclic)) return false;
    active.delete(id);
    checked.add(id);
    return true;
  }
  if (!map.nodes.every(({ id }) => acyclic(id))) return null;

  const claim = map.nodes.find(
    ({ type, status }) => type === "claim" && status === "explicit",
  );
  const seen = new Set();
  const branches = [];
  if (claim) {
    seen.add(claim.id);
    branches.push({ id: claim.id, children: [], rows: 1 });
  }
  function branch(id) {
    seen.add(id);
    const children = [];
    for (const next of neighbours.get(id)) {
      if (!seen.has(next)) children.push(branch(next));
    }
    const rows = children.reduce((total, child) => total + child.rows, 0);
    return { id, children, rows: Math.max(1, rows) };
  }
  // Reserve direct links to the claim as their own spokes before traversing.
  const direct = new Set(claim ? neighbours.get(claim.id) : []);
  for (const id of direct) seen.add(id);
  for (const id of direct) branches.push(branch(id));
  for (const id of byId.keys()) {
    if (!seen.has(id)) branches.push(branch(id));
  }

  const left = { branches: [], rows: 0, depth: 0 };
  const right = { branches: [], rows: 0, depth: 0 };
  const depth = (item) => 1 + Math.max(0, ...item.children.map(depth));
  for (const item of branches.sort((a, b) => b.rows - a.rows)) {
    const side = left.rows <= right.rows ? left : right;
    side.branches.push(item);
    side.rows += item.rows;
    side.depth = Math.max(side.depth, depth(item));
  }

  const cardWidth = 208,
    cardHeight = 110,
    centreWidth = 224;
  const columnWidth = cardWidth + 48,
    rowHeight = cardHeight + 24;
  const padding = 24;
  const halfWidth =
    centreWidth / 2 +
    padding +
    columnWidth * Math.max(left.depth, right.depth, 1);
  const width = Math.max(availableWidth, halfWidth * 2);
  const extraSpacing = Math.min(110, (width - halfWidth * 2) / 4);
  const height = Math.max(
    420,
    Math.max(left.rows, right.rows) * rowHeight + padding * 2,
  );
  const centre = {
    x: (width - centreWidth) / 2,
    y: (height - 144) / 2,
    width: centreWidth,
    height: 144,
  };
  const positions = [];
  function place(item, parent, side, level, top) {
    const distance = (level - 1) * columnWidth + 48 + extraSpacing;
    positions.push({
      id: item.id,
      parent,
      x:
        side < 0
          ? centre.x - distance - cardWidth
          : centre.x + centre.width + distance,
      y: top + (item.rows * rowHeight - cardHeight) / 2,
      width: cardWidth,
      height: cardHeight,
    });
    let next = top;
    for (const child of item.children) {
      place(child, item.id, side, level + 1, next);
      next += child.rows * rowHeight;
    }
  }
  for (const [side, direction] of [
    [left, -1],
    [right, 1],
  ]) {
    let top = (height - side.rows * rowHeight) / 2;
    for (const item of side.branches) {
      place(item, null, direction, 1, top);
      top += item.rows * rowHeight;
    }
  }
  return { centre, positions, width, height };
}
