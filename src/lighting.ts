export interface CityLighting {
  daylight: number;
  night: boolean;
  sunPhase: number;
  skyCenter: string;
  skyEdge: string;
}

/** A local-clock cycle, with approximate dawn/dusk rather than location-based astronomy. */
export function lightingAt(date: Date): CityLighting {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const sunPhase = (hour - 7) / 12 * Math.PI;
  const amount = Math.max(0, Math.min(1, (Math.sin(sunPhase) + 0.12) / 0.65));
  const daylight = amount * amount * (3 - 2 * amount);
  return {
    daylight,
    night: daylight < 0.35,
    sunPhase,
    skyCenter: mix('#273d56', '#f1f5f3', daylight),
    skyEdge: mix('#3f5876', '#dce9ee', daylight),
  };
}

function mix(from: string, to: string, amount: number) {
  const channel = (color: string, index: number) => parseInt(color.slice(index, index + 2), 16);
  return '#' + [1, 3, 5].map(i => Math.round(channel(from, i) * (1 - amount) + channel(to, i) * amount).toString(16).padStart(2, '0')).join('');
}
