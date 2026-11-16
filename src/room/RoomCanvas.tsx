import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { isRoomUnderlay, roomItemFootprint, validateRoomPlacements, type RoomItem, type RoomPlacement } from '../../shared/room.mjs';
import { RoomBackdrop } from './RoomBackdrop';
import { RoomItemArt } from './RoomItemArt';
import { RoomDragHandle, type DragPoint } from './RoomDragHandle';
import { roomFootprintPoints, roomGeometry, roomSpriteBox, unprojectRoomPoint } from './geometry';

export type RoomCanvasHandle = { start: (itemId: string, point: DragPoint, fromTray?: boolean) => void; move: (point: DragPoint) => void; end: (cancelled?: boolean) => void };
type Props = { width: number; height: number; items: readonly RoomItem[]; placements: RoomPlacement[]; ownedItemIds: string[];
  editing: boolean; disabled?: boolean; selected: string | null; onSelect: (id: string) => void;
  onChange: (placements: RoomPlacement[]) => void; onDragChange: (dragging: boolean) => void; onStatus: (status: string) => void };
type ActiveDrag = { item: RoomItem; placement: RoomPlacement; start: DragPoint; origin: DragPoint; fromTray: boolean; moved: boolean };

export const RoomCanvas = forwardRef<RoomCanvasHandle, Props>(function RoomCanvas(props, forwardedRef) {
  const { width, height, items, placements, editing, disabled, selected, onSelect } = props;
  const canvas = useRef<View>(null);
  const current = useRef(props);
  useLayoutEffect(() => { current.current = props; }, [props]);
  const active = useRef<ActiveDrag | null>(null);
  const candidate = useRef<{ placement: RoomPlacement; valid: boolean } | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; active.current = null; candidate.current = null; }, []);
  const [ghost, setGhost] = useState<{ placement: RoomPlacement; valid: boolean } | null>(null);
  const geometry = roomGeometry(width, height);
  const start = useCallback((itemId: string, point: DragPoint, fromTray = false) => {
    const p = current.current;
    if (!p.editing || p.disabled || !p.ownedItemIds.includes(itemId)) return;
    const item = p.items.find(entry => entry.id === itemId);
    if (!item) return;
    const token = ++sequence.current;
    const original = p.placements.find(entry => entry.itemId === itemId);
    p.onSelect(itemId);
    canvas.current?.measureInWindow((x, y) => {
      if (sequence.current !== token) return;
      const pageOffset = Platform.OS === 'web' ? { x: window.scrollX, y: window.scrollY } : { x: 0, y: 0 };
      active.current = { item, placement: original ?? { itemId, x: 0, y: 0, rotation: 0 }, start: point,
        origin: { x: x + pageOffset.x, y: y + pageOffset.y }, fromTray, moved: false };
      p.onDragChange(true);
    });
  }, []);
  const move = useCallback((point: DragPoint) => {
    const drag = active.current; const p = current.current;
    if (!drag) return;
    drag.moved = true;
    const g = roomGeometry(p.width, p.height);
    let x: number; let y: number;
    if (drag.fromTray) {
      const cell = unprojectRoomPoint(point.x - drag.origin.x, point.y - drag.origin.y, g);
      const f = roomItemFootprint(drag.item, drag.placement.rotation);
      x = Math.round(cell.x - f.width / 2); y = Math.round(cell.y - f.depth / 2);
    } else {
      const across = (point.x - drag.start.x) / g.cellWidth;
      const down = (point.y - drag.start.y) / g.cellHeight;
      x = drag.placement.x + Math.round(down + across); y = drag.placement.y + Math.round(down - across);
    }
    const placement = { ...drag.placement, x, y };
    const result = validateRoomPlacements([...p.placements.filter(entry => entry.itemId !== placement.itemId), placement], p.ownedItemIds);
    const preview = { placement, valid: result.valid };
    setGhost(preview);
    // Keep the drop atomic even if React has not painted the latest drag event.
    candidate.current = preview;
    p.onStatus(result.valid ? 'Fits here' : result.error);
  }, []);
  const end = useCallback((cancelled = false) => {
    sequence.current++;
    const drag = active.current; const p = current.current;
    active.current = null;
    const previous = candidate.current;
    candidate.current = null;
    setGhost(null);
    if (!cancelled && drag?.moved && previous?.valid && p.editing && !p.disabled) {
      const placement = previous.placement;
      p.onChange([...p.placements.filter(entry => entry.itemId !== placement.itemId), placement]);
      p.onStatus(`${drag.item.name} placed. Save when you’re ready.`);
    } else if (!cancelled && drag?.moved) p.onStatus('That space is unavailable. Your item stayed where it was.');
    p.onDragChange(false);
  }, []);
  useImperativeHandle(forwardedRef, () => ({ start, move, end }), [start, move, end]);
  const drawn = placements.filter(p => p.itemId !== ghost?.placement.itemId);
  if (ghost) drawn.push(ghost.placement);
  drawn.sort((a, b) => {
    const ai = items.find(i => i.id === a.itemId)!; const bi = items.find(i => i.id === b.itemId)!;
    if (isRoomUnderlay(ai) !== isRoomUnderlay(bi)) return isRoomUnderlay(ai) ? -1 : 1;
    return (a.x + a.y + roomItemFootprint(ai,a.rotation).width + roomItemFootprint(ai,a.rotation).depth) - (b.x + b.y + roomItemFootprint(bi,b.rotation).width + roomItemFootprint(bi,b.rotation).depth);
  });
  const highlighted = ghost?.placement ?? placements.find(p => p.itemId === selected);
  const highlightItem = items.find(i => i.id === highlighted?.itemId);
  return <View ref={canvas} testID="room-canvas" collapsable={false} style={{ width, height, overflow: 'hidden' }}>
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}><RoomBackdrop width={width} height={height} /></View>
    {editing && highlighted && highlightItem && <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute' }}>
      <Polygon points={roomFootprintPoints(highlightItem, highlighted, geometry)} fill={ghost && !ghost.valid ? '#AD4B3D33' : '#78935833'} stroke={ghost && !ghost.valid ? '#AD4B3D' : '#768354'} strokeWidth={2} />
    </Svg>}
    {drawn.map(placement => {
      const item = items.find(entry => entry.id === placement.itemId); if (!item) return null;
      const box = roomSpriteBox(item, placement, geometry);
      const isGhost = ghost?.placement.itemId === placement.itemId;
      return <RoomDragHandle key={placement.itemId} label={`${item.name}, placed at ${placement.x + 1}, ${placement.y + 1}`} testID={`room-placed-${item.id}`}
        enabled={editing && !disabled && !isGhost} selected={editing && selected === item.id}
        style={{ position: 'absolute', ...box, opacity: isGhost ? .72 : 1 }}
        onSelect={() => onSelect(item.id)} onStart={point => start(item.id, point)} onMove={move} onEnd={end}>
        <View pointerEvents="none"><RoomItemArt itemId={item.id} width={box.width} height={box.height} rotation={placement.rotation} /></View>
      </RoomDragHandle>;
    })}
  </View>;
});
