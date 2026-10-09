import { useEffect, type CSSProperties } from 'react';
import { Package } from 'lucide-react';
import './brick-reward-burst.css';

export interface RewardFlight { id: number; origin: { x: number; y: number }; target: { x: number; y: number } }

export function BrickRewardBurst({ flight, onComplete }: { flight: RewardFlight; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);
  return <div className="brick-reward-burst" aria-hidden="true">
    {Array.from({ length: 15 }, (_, i) => {
      const angle = i * 2.39996, radius = 24 + Math.sqrt(i / 14) * 48;
      const x = flight.origin.x + Math.cos(angle) * radius;
      const y = flight.origin.y + Math.sin(angle) * radius * .7;
      const style = {
        left: x - 11, top: y - 11,
        '--spawn-x': `${flight.origin.x - x}px`, '--spawn-y': `${flight.origin.y - y}px`,
        '--flight-x': `${flight.target.x - x}px`, '--flight-y': `${flight.target.y - y}px`,
        animationDelay: `${i * 12}ms, ${1400 + i * 20}ms`,
      } as CSSProperties;
      return <span className="reward-brick" key={i} style={style}><Package size={22} fill="#b9dcf7" strokeWidth={1.8}/></span>;
    })}
  </div>;
}
