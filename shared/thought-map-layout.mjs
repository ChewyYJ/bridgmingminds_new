/**
 * Small bounded mind-map layout shared by native and web. The graph is still
 * validated as a DAG, but its most central learner idea is presented at the
 * centre so people can read it as a thought structure rather than a flowchart.
 */
export function layoutThoughtMap(map) {
  const nodes = map.nodes.slice(0, 12);
  if (!nodes.length) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  const connections = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of map.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return null;
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    children.get(edge.source).push(edge.target);
    connections.set(edge.source, connections.get(edge.source) + 1);
    connections.set(edge.target, connections.get(edge.target) + 1);
  }
  const queue = nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    visited++;
    for (const target of children.get(id)) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodes.length) return null;
  const root =
    nodes.find((node) => node.type === "claim" && node.status === "explicit") ||
    nodes.find((node) => node.type === "claim") ||
    nodes
      .slice()
      .sort((a, b) => connections.get(b.id) - connections.get(a.id))[0];
  const branches = nodes.filter((node) => node.id !== root.id);
  const raw = [
    { id: root.id, x: -128, y: -80, width: 256, height: 160, central: true },
  ];
  const perRing = 6;
  for (let start = 0; start < branches.length; start += perRing) {
    const ring = Math.floor(start / perRing) + 1;
    const ringNodes = branches.slice(start, start + perRing);
    const radiusX = 300 + (ring - 1) * 210;
    const radiusY = 180 + (ring - 1) * 150;
    for (let index = 0; index < ringNodes.length; index++) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / ringNodes.length;
      raw.push({
        id: ringNodes[index].id,
        x: Math.cos(angle) * radiusX - 108,
        y: Math.sin(angle) * radiusY - 68,
        width: 216,
        height: 136,
        central: false,
      });
    }
  }
  const minimumX = Math.min(...raw.map((position) => position.x));
  const minimumY = Math.min(...raw.map((position) => position.y));
  const positions = raw.map((position) => ({
    ...position,
    x: position.x - minimumX + 20,
    y: position.y - minimumY + 20,
  }));
  return {
    rootId: root.id,
    positions,
    width: Math.max(...positions.map((position) => position.x + position.width)) + 20,
    height: Math.max(...positions.map((position) => position.y + position.height)) + 20,
  };
}
