export type Style = 'terrace' | 'modern' | 'spire';
export type Color = 'sand' | 'lilac' | 'sage' | 'coral' | 'blue';
export interface Building {
  id: string; username: string; name: string; bio: string; avatar: string | null;
  github_url: string | null; website: string | null; school: string | null;
  is_demo: number; x: number; z: number; level: number; xp:number; bricks:number|null; segments:string; likes:number;
  style: Style; color: Color; commits: number; prs: number; reviews: number;
  synced_at: string | null; updated_at: string; invited_by?: string | null; invite_degree?: number;
  inviter_x?:number|null; inviter_z?:number|null;
}
export interface Bootstrap {
  buildings: Building[]; me: string | null; demo: boolean; githubConfigured: boolean;
  claimedToday: boolean; dailyReward: number; inviteRequired: boolean;
  nextPlots:{x:number;z:number}[]; projects:PublicProject[]; likedIds:string[];
}
export const COLORS: Record<Color, { label: string; hex: string }> = {
  sand: { label: 'Sandstone', hex: '#dfba85' },
  lilac: { label: 'Lilac', hex: '#b6a3dc' },
  sage: { label: 'Sage', hex: '#8eaf9b' },
  coral: { label: 'Clay', hex: '#d89886' },
  blue: { label: 'Sky', hex: '#8fb7ca' },
};
export const STYLES: Record<Style, { label: string; description: string }> = {
  terrace: { label: 'Terraced', description: 'Room to grow, room to breathe.' },
  modern: { label: 'Modern', description: 'Clean lines. A fresh perspective.' },
  spire: { label: 'Spire', description: 'A little ambition in the skyline.' },
};
export interface PublicProject{id:string;name:string;kind:string;x:number;z:number;goal:number;funded:number;contributors:number;myContribution:number;description:string;}
export interface XpEvent{event_key:string;source:string;xp:number;bricks:number;description:string;created_at:string;}
export const DAILY_REWARD = 30;
export const STYLE_COST = 45;
export const COLOR_COST = 15;
