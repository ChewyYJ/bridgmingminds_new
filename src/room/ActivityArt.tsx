import React from 'react';
import { Platform } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

/** Small original pixel symbols; text labels remain outside the decorative art. */
export function ActivityArt({ kind, size = 58 }: { kind: 'speak' | 'read' | 'words' | 'respond'; size?: number }) {
  const ink = '#665447', paper = '#F7F0E4', shade = '#D2BEA1', wood = '#AD9272';
  return <Svg width={size} height={size} viewBox="0 0 48 48" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}>
    {kind === 'speak' ? <>
      <Path d="M11 3H21V5H25V9H27V19H25V23H21V25H17V33H14V40H9V38H7V34H9V26H7V22H5V10H7V5H11Z" fill={ink}/>
      <Path d="M12 6H21V8H24V18H22V21H11V19H8V10H10V8H12Z" fill={shade}/>
      <Path d="M11 8H21V10H24V13H8V11H11ZM10 15H23V17H10Z" fill={paper}/>
      <Path d="M12 24H17V29H15V36H10V33H12Z" fill={wood}/>
      <Path d="M26 25L36 20L46 26V39L35 45L25 39V26Z" fill={ink}/>
      <Path d="M28 27L36 23L43 27L35 31ZM28 30L34 33V41L28 37Z" fill={paper}/>
      <Path d="M37 33L44 29V37L37 41Z" fill={shade}/>
      <Rect x={34} y={25} width={3} height={3} fill={ink}/><Rect x={29} y={33} width={2} height={2} fill={ink}/><Rect x={39} y={32} width={2} height={2} fill={ink}/><Rect x={39} y={37} width={2} height={2} fill={ink}/>
    </> : kind === 'words' ? <>
      <Path d="M3 10H24V13H27V37H24V40H3V37H1V13H3Z" fill={ink}/><Rect x={4} y={13} width={20} height={24} fill={shade}/>
      <Path d="M20 7H42V10H45V35H42V38H20V35H18V10H20Z" fill={ink}/><Rect x={21} y={10} width={21} height={25} fill={paper}/>
      <Path d="M8 31V20H11V17H14V20H17V31H14V27H11V31ZM11 21V24H14V21Z" fill={ink}/>
      <Path d="M26 15H38V18H35V21H32V24H29V27H38V30H25V27H28V24H31V21H34V18H26Z" fill={wood}/>
    </> : kind === 'read' ? <>
      <Path d="M3 10H17L24 14L31 10H44V37H30L24 41L18 37H3Z" fill={ink}/>
      <Path d="M6 13H17L22 16V36L17 34H6ZM26 16L31 13H41V34H31L26 36Z" fill={paper}/>
      <Path d="M7 17H16V19H7ZM7 22H18V24H7ZM7 27H18V29H7ZM30 17H40V19H30ZM28 22H40V24H28ZM28 27H40V29H28Z" fill={shade}/>
      <Path d="M38 3H41V5H44V8H41V6H38ZM43 1H46V3H48V6H46V4H43Z" fill={wood}/>
    </> : <>
      <Path d="M3 7H35V10H38V39H6V37H3Z" fill={ink}/><Rect x={6} y={10} width={29} height={26} fill={paper}/>
      <Rect x={9} y={13} width={12} height={9} fill={shade}/><Path d="M24 13H32V15H24ZM24 18H32V20H24ZM9 25H31V27H9ZM9 30H25V32H9Z" fill={wood}/>
      <G><Path d="M40 19H44V22H47V26L32 42L25 44L27 36Z" fill={ink}/><Path d="M39 24L42 27L31 39L28 40L29 37Z" fill={wood}/><Path d="M40 22H43V25H40ZM28 40L31 39L29 42H27Z" fill={paper}/></G>
    </>}
  </Svg>;
}
