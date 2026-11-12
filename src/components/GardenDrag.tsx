import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PanResponder, Platform, View, ViewStyle } from "react-native";

export interface DragPoint {
  x: number;
  y: number;
}
export function GardenDrag({
  children,
  label,
  testID,
  disabled,
  style,
  onStart,
  onMove,
  onDrop,
  onCancel,
  onTap,
}: {
  children: React.ReactNode;
  label: string;
  testID?: string;
  disabled?: boolean;
  style?: ViewStyle;
  onStart: (point: DragPoint) => void;
  onMove: (point: DragPoint) => void;
  onDrop: (point: DragPoint) => void;
  onCancel: () => void;
  onTap: () => void;
}) {
  const callbacks = useRef({
    disabled,
    onStart,
    onMove,
    onDrop,
    onCancel,
    onTap,
  });
  const gesture = useRef<{
    active: boolean;
    start: DragPoint;
    moved: boolean;
  }>({ active: false, start: { x: 0, y: 0 }, moved: false });
  useLayoutEffect(() => {
    callbacks.current = { disabled, onStart, onMove, onDrop, onCancel, onTap };
    if (disabled && gesture.current.active) {
      gesture.current.active = false;
      onCancel();
    }
  }, [disabled, onStart, onMove, onDrop, onCancel, onTap]);
  useEffect(
    () => () => {
      if (gesture.current.active) {
        gesture.current.active = false;
        callbacks.current.onCancel();
      }
    },
    [],
  );
  const handlers = useMemo(() => {
    const cancel = () => {
      if (!gesture.current.active) return;
      gesture.current.active = false;
      callbacks.current.onCancel();
    };
    // PanResponder stores these callbacks; the refs are read only by events.
    // Its internal gesture state must survive the parent's preview renders.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !callbacks.current.disabled,
      onMoveShouldSetPanResponder: () => !callbacks.current.disabled,
      onPanResponderGrant: (event) => {
        if (callbacks.current.disabled) return;
        const point = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        gesture.current = { active: true, start: point, moved: false };
        callbacks.current.onStart(point);
      },
      onPanResponderStart: (_event, state) => {
        if (state.numberActiveTouches > 1) cancel();
      },
      onPanResponderMove: (event, state) => {
        if (!gesture.current.active) return;
        if (callbacks.current.disabled || state.numberActiveTouches > 1) {
          cancel();
          return;
        }
        const point = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        if (
          Math.hypot(
            point.x - gesture.current.start.x,
            point.y - gesture.current.start.y,
          ) >= 6
        )
          gesture.current.moved = true;
        callbacks.current.onMove(point);
      },
      onPanResponderRelease: (event) => {
        if (!gesture.current.active) return;
        if (callbacks.current.disabled) {
          cancel();
          return;
        }
        const point = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        const moved =
          gesture.current.moved ||
          Math.hypot(
            point.x - gesture.current.start.x,
            point.y - gesture.current.start.y,
          ) >= 6;
        gesture.current.active = false;
        if (moved) callbacks.current.onDrop(point);
        else {
          callbacks.current.onCancel();
          callbacks.current.onTap();
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: cancel,
      onShouldBlockNativeResponder: () => true,
    });
  }, []);
  const keyboard = {
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Escape" && gesture.current.active) {
        event.preventDefault();
        gesture.current.active = false;
        onCancel();
      } else if (
        !disabled &&
        !gesture.current.active &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        onTap();
      }
    },
  };
  return (
    <View
      {...handlers.panHandlers}
      {...keyboard}
      collapsable={false}
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      aria-disabled={!!disabled}
      focusable={!disabled}
      tabIndex={disabled ? -1 : 0}
      style={[
        Platform.OS === "web"
          ? ({
              touchAction: "none",
              userSelect: "none",
              cursor: disabled ? "default" : "grab",
            } as unknown as ViewStyle)
          : {},
        style,
      ]}
    >
      {children}
    </View>
  );
}
