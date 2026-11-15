import { AVATAR_PACK, AVATAR_ATLASES } from './generated-pack';
import { defaultAvatarSelection, normalizeAvatarSelection, resolveAvatarPieces } from '../../shared/avatar-customization.mjs';

export type AvatarStyle = 'big' | 'chibi';
export type AvatarCollection = 'boy' | 'girl';
export type AvatarAnimation = 'idle' | 'walk' | 'greet' | 'speak' | 'celebrate' | 'eat' | 'eatOnigiri' | 'eatBento';
export type AvatarCategory = 'hair' | 'hat' | 'top' | 'jacket' | 'bottom' | 'shoes' | 'accessory';
export interface AvatarSelection {
  collection: AvatarCollection;
  skin: string;
  hairColor: string;
  eyeColor: string;
  hair: string;
  hat: string | null;
  top: string;
  jacket: string | null;
  bottom: string;
  shoes: string;
  accessory: string | null;
}
export interface AvatarItem { id: string; name: string; category: AvatarCategory; collection: AvatarCollection }
export interface AvatarPalette { id: string; name: string; color: string }
export interface AvatarPack {
  version: string;
  styles: Record<AvatarStyle, { width: number; height: number; slots: string[]; pivot: [number, number]; animations?: AvatarAnimation[]; pixelSize?: number; pixelSlots?: string[] }>;
  animations: Record<AvatarAnimation, { frames: number; fps: number; loopFrom: number }>;
  catalog: Record<AvatarCollection, Record<AvatarCategory, AvatarItem[]>>;
  palettes: Record<'skin' | 'hair' | 'eyes', AvatarPalette[]>;
  variants: Record<string, {
    pages: { file: string; width: number; height: number }[];
    rects: { page: number; x: number; y: number; w: number; h: number }[];
    frames: Record<AvatarAnimation, Record<string, [number, number, number]>[]>;
  }>;
}
export interface AvatarLayer {
  source: number;
  atlasWidth: number;
  atlasHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  slot: string;
}
export const defaultSelection = (collection: AvatarCollection = 'girl'): AvatarSelection =>
  defaultAvatarSelection(AVATAR_PACK, collection);
export const normalizeSelection = (value: unknown): AvatarSelection => normalizeAvatarSelection(AVATAR_PACK, value);
export function getAvatarLayers(selection: AvatarSelection, style: AvatarStyle, animation: AvatarAnimation, frame = 0): AvatarLayer[] {
  return resolveAvatarPieces(AVATAR_PACK, selection, style, animation, frame).map(piece => ({
    ...piece, source: AVATAR_ATLASES[piece.file],
  }));
}
