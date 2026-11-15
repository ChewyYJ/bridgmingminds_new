import type { AvatarCategory, AvatarCollection, AvatarPack, AvatarSelection, AvatarStyle, AvatarAnimation } from '../src/avatar/pack';
export const AVATAR_CATEGORIES: AvatarCategory[];
export function shouldHideBodyArms(style: AvatarStyle, animation: AvatarAnimation, longSleeves: boolean): boolean;
export function defaultAvatarSelection(pack: AvatarPack, collection?: AvatarCollection): AvatarSelection;
export function normalizeAvatarSelection(pack: AvatarPack, value: unknown): AvatarSelection;
export function resolveAvatarPieces(pack: AvatarPack, selection: unknown, style: AvatarStyle, animation: AvatarAnimation, frame?: number): Array<{
  file: string; atlasWidth: number; atlasHeight: number; x: number; y: number; width: number; height: number; offsetX: number; offsetY: number; slot: string; variant: string;
}>;
