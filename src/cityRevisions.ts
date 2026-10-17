import type { Building } from '../shared/types';
export const buildingDesignKey=(b:Building)=>[b.id,b.x,b.z,b.level,b.style,b.color,b.segments].join(':');
/** Geometry excludes balances, likes, avatars and activity counters. */
export const cityLayoutKey=(buildings:Building[])=>buildings.map(b=>[b.id,b.x,b.z,b.level,b.style,b.segments,b.invited_by,b.inviter_x,b.inviter_z].join(':')).sort().join('|');
