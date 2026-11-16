import React from 'react';
import { Platform } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { projectRoomPoint, roomGeometry } from './geometry';

/** Original room geometry shares the editor's projection; scenery never changes hit targets. */
export function RoomBackdrop({ width, height }: { width: number; height: number }) {
  const g = roomGeometry(width, height);
  const wall = Math.max(32, g.originY - 16);
  const p = (x: number, y: number, z = 0) => { const point = projectRoomPoint(x, y, g); return `${point.x},${point.y - z}`; };
  const floorColors = ['#DED6CA', '#E4DDD3', '#D8CFC2', '#E0D8CD'];
  return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}>
    <Polygon points={`${p(0,0)} ${p(0,8)} ${p(0,8,wall)} ${p(0,0,wall)}`} fill="#EAE4DC" stroke="#B7AA9B" strokeWidth={1.4}/>
    <Polygon points={`${p(0,0)} ${p(8,0)} ${p(8,0,wall)} ${p(0,0,wall)}`} fill="#F3EEE7" stroke="#B7AA9B" strokeWidth={1.4}/>
    <Polygon points={`${p(0,0,wall)} ${p(0,8,wall)} ${p(0,8,wall-4)} ${p(0,0,wall-4)}`} fill="#DAD1C5"/>
    <Polygon points={`${p(0,0,wall)} ${p(8,0,wall)} ${p(8,0,wall-4)} ${p(0,0,wall-4)}`} fill="#E4DBCF"/>
    <Polygon points={`${p(0,8)} ${p(8,8)} ${p(8,0)} ${p(8,0,-5)} ${p(8,8,-5)} ${p(0,8,-5)}`} fill="#AD9E8A"/>
    {Array.from({ length: 64 }, (_, i) => { const x=i%8,y=Math.floor(i/8); return <Polygon key={i} points={`${p(x,y)} ${p(x+1,y)} ${p(x+1,y+1)} ${p(x,y+1)}`} fill={floorColors[(x+2*y)%4]} stroke="#CFC4B5" strokeWidth={0.7}/>; })}
    {Array.from({ length: 24 }, (_, i) => { const x=i%8,y=Math.floor(i/8)*3; const a=projectRoomPoint(x+.15,y+.3,g),b=projectRoomPoint(x+.8,y+.3,g); return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C5B8A7" strokeWidth={0.65} opacity={.45}/>; })}
    <Polygon points={`${p(0,0)} ${p(0,8)} ${p(0,8,4)} ${p(0,0,4)}`} fill="#C3B7A6"/>
    <Polygon points={`${p(0,0)} ${p(8,0)} ${p(8,0,4)} ${p(0,0,4)}`} fill="#CCC0B0"/>
    <Polygon points={`${p(0,2,wall*.78)} ${p(0,5,wall*.78)} ${p(0,5,wall*.29)} ${p(0,2,wall*.29)}`} fill="#8F8273"/>
    <Polygon points={`${p(0,2.2,wall*.75)} ${p(0,4.8,wall*.75)} ${p(0,4.8,wall*.32)} ${p(0,2.2,wall*.32)}`} fill="#E0E3DC"/>
    <Polygon points={`${p(0,2.2,wall*.39)} ${p(0,2.8,wall*.51)} ${p(0,3.4,wall*.43)} ${p(0,3.9,wall*.59)} ${p(0,4.8,wall*.41)} ${p(0,4.8,wall*.32)} ${p(0,2.2,wall*.32)}`} fill="#A9AE9F"/>
    <Polygon points={`${p(0,3.4,wall*.75)} ${p(0,3.6,wall*.75)} ${p(0,3.6,wall*.32)} ${p(0,3.4,wall*.32)}`} fill="#F4F0E9"/>
    <Polygon points={`${p(0,2.2,wall*.52)} ${p(0,4.8,wall*.52)} ${p(0,4.8,wall*.54)} ${p(0,2.2,wall*.54)}`} fill="#F4F0E9"/>
  </Svg>;
}
