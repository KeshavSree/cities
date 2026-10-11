import { useEffect, type CSSProperties } from 'react';
import { Package } from 'lucide-react';
import './brick-reward-burst.css';

export interface RewardFlight {
  id:number;
  origin:{x:number;y:number};
  target:{x:number;y:number};
  count:number;
  staggerMs:number;
  hoverMs:number;
}

export function BrickRewardBurst({ flight, onComplete }: { flight: RewardFlight; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete,(flight.count-1)*flight.staggerMs+flight.hoverMs+850);
    return () => clearTimeout(timer);
  }, [flight,onComplete]);
  return <div className="brick-reward-burst" aria-hidden="true">
    {Array.from({ length: flight.count }, (_, i) => {
      const angle = i * 2.39996, radius = 24 + Math.sqrt(i/Math.max(1,flight.count-1)) * 48;
      const x = flight.origin.x + Math.cos(angle) * radius;
      const y = flight.origin.y + Math.sin(angle) * radius * .7;
      const spawnDelay=i*flight.staggerMs;
      const style = {
        left: x - 11, top: y - 11,
        '--spawn-x': `${flight.origin.x - x}px`, '--spawn-y': `${flight.origin.y - y}px`,
        '--flight-x': `${flight.target.x - x}px`, '--flight-y': `${flight.target.y - y}px`,
        animationDelay: `${spawnDelay}ms, ${spawnDelay+flight.hoverMs}ms`,
      } as CSSProperties;
      return <span className="reward-brick" key={i} style={style}><Package size={22} fill="#b9dcf7" strokeWidth={1.8}/></span>;
    })}
  </div>;
}
