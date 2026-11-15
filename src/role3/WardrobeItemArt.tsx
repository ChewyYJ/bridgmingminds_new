import React, { useMemo } from "react";
import { Image, Platform, View } from "react-native";
import { Asset } from "expo-asset";
import Svg, { Path } from "react-native-svg";
import { resolveAvatarPieces } from "../../shared/avatar-customization.mjs";
import { AVATAR_ATLASES, AVATAR_PACK } from "../avatar/generated-pack";
import { normalizeSelection, type AvatarCategory, type AvatarItem, type AvatarSelection } from "../avatar/pack";

/** The real wearable layers, tightly framed without a body or other clothing. */
export function WardrobeItemArt({ selection, item, size = 82 }: { selection: AvatarSelection; item: AvatarItem; size?: number }) {
  const art = useMemo(() => {
    const look = normalizeSelection({ ...selection, [item.category]: item.id, ...(item.category === "top" ? { jacket: null } : {}), ...(item.category === "hair" ? { hat: null } : {}) });
    const prefix = `big/${item.collection}/${item.category}/${item.id}`;
    const layers = resolveAvatarPieces(AVATAR_PACK, look, "big", "idle", 0).filter(piece => piece.variant === prefix || piece.variant.startsWith(prefix + "/"));
    if (!layers.length) return null;
    const left = Math.min(...layers.map(piece => piece.offsetX));
    const top = Math.min(...layers.map(piece => piece.offsetY));
    const width = Math.max(...layers.map(piece => piece.offsetX + piece.width)) - left;
    const height = Math.max(...layers.map(piece => piece.offsetY + piece.height)) - top;
    return { layers, left, top, width, height, scale: Math.min((size - 10) / width, (size - 10) / height, 2) };
  }, [selection, item, size]);
  return <View accessible={false} pointerEvents="none" testID={`item-art-${item.id}`} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    {art && <View style={{ width: art.width * art.scale, height: art.height * art.scale }}>
      <View style={{ position: "absolute", width: art.width, height: art.height, transformOrigin: "top left", transform: [{ scale: art.scale }] }}>
        {art.layers.map((layer, index) => {
          const source = AVATAR_ATLASES[layer.file];
          const imageStyle = { position: "absolute" as const, left: -layer.x, top: -layer.y, width: layer.atlasWidth, height: layer.atlasHeight };
          return <View key={`${layer.slot}-${index}`} style={{ position: "absolute", left: layer.offsetX - art.left, top: layer.offsetY - art.top, width: layer.width, height: layer.height, overflow: "hidden" }}>
            {Platform.OS === "web" ? React.createElement("img", { src: Asset.fromModule(source).uri, alt: "", draggable: false, style: { ...imageStyle, imageRendering: "pixelated", maxWidth: "none" } }) : <Image source={source} resizeMode="stretch" fadeDuration={0} accessible={false} style={imageStyle} />}
          </View>;
        })}
      </View>
    </View>}
  </View>;
}

const outlines: Record<AvatarCategory, string> = {
  hair: "M6 24c-3-5-2-12 1-16C10 4 18 3 22 7c4 4 4 11 1 17l-4-1 1-9c-3 0-5-2-6-5-1 4-4 6-7 7l1 7-2 1Z",
  hat: "M5 18c0-7 3-11 10-11s9 4 9 11M2 19c5-3 11-3 16-1 4 2 7 2 10 1M6 23c6 1 12 1 17-1",
  top: "m10 5-7 5 4 6 3-2v13h11V14l3 2 4-6-8-5c-1 4-8 4-10 0Z",
  jacket: "m10 5-6 5-2 17 6 1 2-13v14h11V15l2 13 6-1-3-17-7-5-4 4-5-4ZM15 10v19M10 5l1 8 4-3 4 3 1-8",
  bottom: "M8 4h15l1 24h-7l-2-15-2 15H6L8 4ZM8 8h15M15 4v7",
  shoes: "M4 17V9h7l3 8 10 3c3 1 4 3 4 6H3v-5l1-4ZM4 22h23M14 17l-3 2M18 19l-3 2",
  accessory: "M3 13h9v8H4l-1-8Zm15 0h9l-1 8h-8v-8Zm-6 3h6M3 13 1 10M27 13l2-3",
};
export function WardrobeCategoryIcon({ category, color = "#4B4036" }: { category: AvatarCategory; color?: string }) {
  return <Svg width={25} height={25} viewBox="0 0 32 32" accessible={false}><Path d={outlines[category]} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
