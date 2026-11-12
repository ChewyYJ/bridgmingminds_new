/** Small bounded DAG layout shared by native and web; no DOM-only graph engine. */
export function layoutThoughtMap(map) {
  const nodes = map.nodes.slice(0, 12);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  const depth = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of map.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return null;
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    children.get(edge.source).push(edge.target);
  }
  const queue = nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    visited++;
    for (const target of children.get(id)) {
      depth.set(target, Math.max(depth.get(target), depth.get(id) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodes.length) return null;
  const rows = new Map();
  const positions = nodes.map((node) => {
    const column = depth.get(node.id),
      row = rows.get(column) || 0;
    rows.set(column, row + 1);
    return {
      id: node.id,
      x: 20 + column * 304,
      y: 20 + row * 180,
      width: 236,
      height: 148,
    };
  });
  const maximumRows = Math.max(1, ...rows.values());
  for (const position of positions)
    position.y += (maximumRows - rows.get(depth.get(position.id))) * 90;
  return {
    positions,
    width: Math.max(
      300,
      ...positions.map((position) => position.x + position.width + 20),
    ),
    height: Math.max(
      200,
      ...positions.map((position) => position.y + position.height + 20),
    ),
  };
}
