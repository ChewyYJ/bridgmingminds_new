import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

/** The same subdued Coin mark in balances, prices and reward receipts. */
export function CoinIcon({ size = 19 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
    <Circle cx="10" cy="10" r="8" fill="#EFE1C4" stroke="#A68852" strokeWidth="1.5" />
    <Circle cx="10" cy="10" r="5.5" fill="none" stroke="#C4AB7B" />
    <Path d="M11.8 7.1C8.4 5.8 6.9 10.7 9.1 12.6C10 13.3 11.1 13 11.8 12.5" fill="none" stroke="#8C7348" strokeWidth="1.4" />
  </Svg>;
}
