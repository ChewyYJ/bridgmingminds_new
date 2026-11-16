import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

export type DragPoint = { x: number; y: number };
export function RoomDragHandle({ children, label, testID, style, enabled, selected, tray = false, onStart, onMove, onEnd, onSelect }: {
  children: React.ReactNode; label: string; testID: string; style?: StyleProp<ViewStyle>; enabled: boolean; selected?: boolean; tray?: boolean;
  onStart: (point: DragPoint) => void; onMove: (point: DragPoint) => void; onEnd: (cancelled: boolean) => void; onSelect: () => void;
}) {
  const callbacks = useRef({ enabled, tray, onStart, onMove, onEnd, onSelect });
  useLayoutEffect(() => { callbacks.current = { enabled, tray, onStart, onMove, onEnd, onSelect }; }, [enabled, tray, onStart, onMove, onEnd, onSelect]);
  // PanResponder stores these callbacks; it does not invoke them while rendering.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => callbacks.current.enabled && !callbacks.current.tray,
    onMoveShouldSetPanResponder: (_event, gesture) => callbacks.current.enabled && (!callbacks.current.tray || Math.abs(gesture.dy) > Math.abs(gesture.dx)),
    onPanResponderGrant: (_event, gesture) => { callbacks.current.onSelect(); callbacks.current.onStart({ x: gesture.x0, y: gesture.y0 }); },
    onPanResponderMove: (event, gesture) => {
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4) callbacks.current.onMove({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    },
    onPanResponderRelease: (_event, gesture) => callbacks.current.onEnd(Math.abs(gesture.dx) + Math.abs(gesture.dy) <= 4),
    onPanResponderTerminate: () => callbacks.current.onEnd(true),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), []);
  return <View {...responder.panHandlers} onTouchEnd={() => { if (enabled) onSelect(); }} onPointerUp={() => { if (enabled) onSelect(); }} testID={testID} accessible accessibilityRole="button"
    accessibilityLabel={label} accessibilityHint="Drag into an open space in your room. Tap to select for rotation or putting away."
    accessibilityState={{ selected, disabled: !enabled }}
    accessibilityActions={[{ name: 'activate', label: 'Select furniture' }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') onSelect(); }}
    {...(Platform.OS === 'web' ? { 'aria-pressed': !!selected, onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (enabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(); }
    } } : {})}
    style={[style, Platform.OS === 'web' ? { touchAction: enabled ? tray ? 'pan-x' : 'none' : 'auto', userSelect: 'none', cursor: enabled ? 'grab' : 'default' } as unknown as ViewStyle : null]}>
    {children}
  </View>;
}
