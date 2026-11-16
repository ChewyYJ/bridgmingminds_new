import { roomItemFootprint, type RoomItem, type RoomPlacement } from '../../shared/room.mjs';

// The taller shell gives the bookcase and floor lamp headroom without shrinking furniture.
export const ROOM_ASPECT_RATIO = 1.02;

export function roomGeometry(width: number, height: number) {
  const cellWidth = (width - 24) / 8;
  const cellHeight = cellWidth / 2;
  return { width, height, cellWidth, cellHeight, originX: width / 2, originY: height - 16 - 8 * cellHeight };
}
export type RoomGeometry = ReturnType<typeof roomGeometry>;
export function projectRoomPoint(x: number, y: number, g: RoomGeometry) {
  return { x: g.originX + (x - y) * g.cellWidth / 2, y: g.originY + (x + y) * g.cellHeight / 2 };
}
export function unprojectRoomPoint(x: number, y: number, g: RoomGeometry) {
  const across = (x - g.originX) / g.cellWidth;
  const down = (y - g.originY) / g.cellHeight;
  return { x: down + across, y: down - across };
}
export function roomFootprintPoints(item: RoomItem, p: RoomPlacement, g: RoomGeometry) {
  const f = roomItemFootprint(item, p.rotation);
  return [[p.x,p.y],[p.x+f.width,p.y],[p.x+f.width,p.y+f.depth],[p.x,p.y+f.depth]]
    .map(([x,y]) => projectRoomPoint(x,y,g)).map(point => `${point.x},${point.y}`).join(' ');
}
export function roomSpriteBox(item: RoomItem, p: RoomPlacement, g: RoomGeometry) {
  const f = roomItemFootprint(item, p.rotation);
  const front = projectRoomPoint(p.x + f.width, p.y + f.depth, g);
  const center = projectRoomPoint(p.x + f.width / 2, p.y + f.depth / 2, g);
  const width = (f.width + f.depth) * g.cellWidth / 2 * 1.12;
  const height = (f.width + f.depth) * g.cellHeight / 2 + item.height * g.cellWidth / 40;
  return { left: center.x - width / 2, top: front.y - height, width, height };
}
