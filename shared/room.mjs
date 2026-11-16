export const ROOM_SIZE = 8;
const item = (id, name, category, width, depth, height, price, description) =>
  Object.freeze({ id, name, category, width, depth, height, price, starter: price === null, description, assetKey: id });

export const ROOM_CATALOG = Object.freeze([
  item('oak-desk', 'Oak desk', 'tables', 2, 1, 44, null, 'A little space for your next big idea.'),
  item('linen-chair', 'Linen chair', 'seating', 1, 1, 50, null, 'A comfortable place to pause and think.'),
  item('oak-shelf', 'Oak shelf', 'storage', 2, 1, 88, null, 'Keep your favourite reads close.'),
  item('woven-rug', 'Woven rug', 'decor', 3, 3, 2, null, 'A soft foundation. Furniture can sit on this rug.'),
  item('leafy-plant', 'Leafy plant', 'decor', 1, 1, 66, null, 'A quiet green corner for your room.'),
  item('reading-lamp', 'Reading lamp', 'decor', 1, 1, 84, 30, 'A warm glow for a thoughtful evening.'),
  item('oatmeal-sofa', 'Oatmeal sofa', 'seating', 2, 1, 46, 120, 'Make a comfortable reading corner.'),
  item('coffee-table', 'Coffee table', 'tables', 2, 1, 28, 50, 'Room for a book and a cup of tea.'),
  item('cushion-stool', 'Cushion stool', 'seating', 1, 1, 26, 25, 'A small extra seat, just for you.'),
  item('low-cabinet', 'Low cabinet', 'storage', 2, 1, 48, 70, 'Keep your space calm and collected.'),
  item('side-table', 'Side table', 'tables', 1, 1, 34, 35, 'A little table beside your favourite seat.'),
  item('ceramic-plant', 'Ceramic plant', 'decor', 1, 1, 34, 12, 'A small leafy friend in a ceramic pot.'),
]);

export const STARTER_ROOM_PLACEMENTS = Object.freeze([
  Object.freeze({ itemId: 'oak-desk', x: 1, y: 1, rotation: 0 }),
  Object.freeze({ itemId: 'linen-chair', x: 1, y: 2, rotation: 0 }),
  Object.freeze({ itemId: 'oak-shelf', x: 5, y: 0, rotation: 0 }),
  Object.freeze({ itemId: 'woven-rug', x: 0, y: 1, rotation: 0 }),
  Object.freeze({ itemId: 'leafy-plant', x: 6, y: 2, rotation: 0 }),
]);

export function roomItemFootprint(item, rotation) {
  return rotation === 1 ? { width: item.depth, depth: item.width } : { width: item.width, depth: item.depth };
}
export function isRoomUnderlay(item) { return item.id === 'woven-rug'; }

/** Pure validation shared by the editor and server. The server always supplies ownership. */
export function validateRoomPlacements(placements, ownedItemIds) {
  const invalid = (code, error) => ({ valid: false, code, error });
  if (!Array.isArray(placements) || placements.length > ROOM_CATALOG.length)
    return invalid('room_invalid_layout', 'Choose a valid room layout.');
  const owned = ownedItemIds === undefined ? null : new Set(ownedItemIds);
  const seen = new Set(), accepted = [], occupied = [];
  for (const placement of placements) {
    if (!placement || typeof placement !== 'object' || Array.isArray(placement) ||
      Object.keys(placement).length !== 4 || Object.keys(placement).some(key => !['itemId', 'x', 'y', 'rotation'].includes(key)))
      return invalid('room_invalid_placement', 'Each item needs its position and rotation.');
    const { itemId, x, y, rotation } = placement;
    const item = ROOM_CATALOG.find(entry => entry.id === itemId);
    if (!item) return invalid('room_unknown_item', 'Choose an item from the room catalogue.');
    if (seen.has(itemId)) return invalid('room_duplicate_item', 'You can place one of each item.');
    if (owned && !owned.has(itemId)) return invalid('room_item_not_owned', 'Own this item before placing it.');
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || ![0, 1].includes(rotation))
      return invalid('room_invalid_placement', 'Use a whole grid position and a valid rotation.');
    const { width, depth } = roomItemFootprint(item, rotation);
    if (x < 0 || y < 0 || x + width > ROOM_SIZE || y + depth > ROOM_SIZE)
      return invalid('room_out_of_bounds', 'Keep every item inside your room.');
    const underlay = isRoomUnderlay(item);
    for (const other of occupied) {
      if (underlay !== other.underlay) continue;
      if (x < other.x + other.width && x + width > other.x && y < other.y + other.depth && y + depth > other.y)
        return invalid('room_overlap', 'These items overlap. Move one to a clear space.');
    }
    seen.add(itemId);
    occupied.push({ x, y, width, depth, underlay });
    accepted.push({ itemId, x, y, rotation });
  }
  return { valid: true, placements: accepted };
}
