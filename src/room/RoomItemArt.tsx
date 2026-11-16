import React, { useId } from 'react';
import { Platform, View, type ImageSourcePropType } from 'react-native';
import Svg, { Defs, FeColorMatrix, Filter, Image as SvgImage } from 'react-native-svg';
import metadata from '../../assets/room/generated/bounds.json';

const sources: Record<string, ImageSourcePropType> = {
  'oak-desk': require('../../assets/room/generated/oak-desk.png'),
  'linen-chair': require('../../assets/room/generated/linen-chair.png'),
  'oak-shelf': require('../../assets/room/generated/oak-shelf.png'),
  'woven-rug': require('../../assets/room/generated/woven-rug.png'),
  'leafy-plant': require('../../assets/room/generated/leafy-plant.png'),
  'reading-lamp': require('../../assets/room/generated/reading-lamp.png'),
  'oatmeal-sofa': require('../../assets/room/generated/oatmeal-sofa.png'),
  'coffee-table': require('../../assets/room/generated/coffee-table.png'),
  'cushion-stool': require('../../assets/room/generated/cushion-stool.png'),
  'low-cabinet': require('../../assets/room/generated/low-cabinet.png'),
  'side-table': require('../../assets/room/generated/side-table.png'),
  'ceramic-plant': require('../../assets/room/generated/ceramic-plant.png'),
};
type Bounds = { sourceWidth: number; sourceHeight: number; x: number; y: number; width: number; height: number };
const bounds = metadata as Record<string, Bounds>;
// Muted walnut/oat palette, shared by the room, tray and shop. Alpha stays untouched.
const FURNITURE_PALETTE = '0.511 0.390 0.039 0 0.020 0.116 0.785 0.039 0 0.012 0.116 0.390 0.434 0 0.005 0 0 0 1 0';

/** Align the visible sprite to its footprint without editing the original transparent image. */
export function RoomItemArt({ itemId, width, height, rotation = 0 }: { itemId: string; width: number; height: number; rotation?: 0 | 1 }) {
  const filterId = `furniture-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const box = bounds[itemId];
  if (!box || !sources[itemId]) return null;
  const scale = Math.min(width / box.width, height / box.height);
  return <View pointerEvents="none" accessible={false} style={{ width, height, overflow: 'hidden', transform: [{ scaleX: rotation === 1 ? -1 : 1 }] }}>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessible={false} {...(Platform.OS === 'web' ? { 'aria-hidden': true } : {})}>
      <Defs><Filter id={filterId} x="0%" y="0%" width="100%" height="100%" {...(Platform.OS === 'web' ? { colorInterpolationFilters: 'sRGB' } : {})}><FeColorMatrix type="matrix" values={FURNITURE_PALETTE} /></Filter></Defs>
      <SvgImage href={sources[itemId]} x={(width - box.width * scale) / 2 - box.x * scale} y={height - box.height * scale - box.y * scale}
        width={box.sourceWidth * scale} height={box.sourceHeight * scale} preserveAspectRatio="none" filter={`url(#${filterId})`}
        {...(Platform.OS === 'web' ? { style: { imageRendering: 'pixelated' } } : {})} />
    </Svg>
  </View>;
}
