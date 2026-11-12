import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, type ViewProps } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

const nativeDriver = Platform.OS !== "web";

/** Content remains readable and interactive throughout this short reveal. */
export function MotionView({
  children,
  style,
  replayKey,
  distance = 6,
  duration = 220,
  disabled = false,
  ...props
}: ViewProps & {
  replayKey?: string | number;
  distance?: number;
  duration?: number;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  const previous = useRef<{ key: string | number | undefined } | null>(null);
  useEffect(() => {
    const reveal = !previous.current || previous.current.key !== replayKey;
    previous.current = { key: replayKey };
    progress.stopAnimation();
    if (reduced || disabled || !reveal) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [disabled, duration, progress, reduced, replayKey]);

  return (
    <Animated.View
      {...props}
      style={[
        style,
        {
          opacity:
            reduced || disabled
              ? 1
              : progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1],
                }),
          transform: [
            {
              translateY:
                reduced || disabled
                  ? 0
                  : progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [distance, 0],
                    }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A finite acknowledgement of a real value change; no ambient loops. */
export function MotionPulse({
  children,
  style,
  triggerKey,
  animateOnMount = false,
  enabled = true,
  anchorY = 0,
  ...props
}: ViewProps & {
  triggerKey: string | number;
  animateOnMount?: boolean;
  enabled?: boolean;
  anchorY?: number;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const previous = useRef<{ key: string | number } | null>(null);
  useEffect(() => {
    const changed = previous.current
      ? previous.current.key !== triggerKey
      : animateOnMount;
    previous.current = { key: triggerKey };
    progress.stopAnimation();
    progress.setValue(0);
    if (reduced || !enabled || !changed) return;
    const animation = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: nativeDriver,
        isInteraction: false,
      }),
      Animated.spring(progress, {
        toValue: 0,
        stiffness: 240,
        damping: 21,
        mass: 0.55,
        overshootClamping: true,
        useNativeDriver: nativeDriver,
        isInteraction: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [animateOnMount, enabled, progress, reduced, triggerKey]);

  return (
    <Animated.View
      {...props}
      style={[
        style,
        {
          transform: [
            { translateY: anchorY },
            {
              scale:
                reduced || !enabled
                  ? 1
                  : progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.055],
                    }),
            },
            { translateY: -anchorY },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Bind to an Animated.View/AnimatedPressable; press actions are never delayed. */
export function usePressMotion({
  disabled = false,
  scale = 0.975,
}: { disabled?: boolean; scale?: number } = {}) {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    value.stopAnimation();
    value.setValue(1);
    return () => value.stopAnimation();
  }, [disabled, reduced, value]);
  const move = useCallback(
    (pressed: boolean) => {
      value.stopAnimation();
      if (reduced || disabled) {
        value.setValue(1);
        return;
      }
      Animated.spring(value, {
        toValue: pressed ? scale : 1,
        stiffness: 340,
        damping: 25,
        mass: 0.45,
        overshootClamping: true,
        useNativeDriver: nativeDriver,
        isInteraction: false,
      }).start();
    },
    [disabled, reduced, scale, value],
  );
  return {
    style: { transform: [{ scale: reduced || disabled ? 1 : value }] },
    onPressIn: useCallback(() => move(true), [move]),
    onPressOut: useCallback(() => move(false), [move]),
  };
}
