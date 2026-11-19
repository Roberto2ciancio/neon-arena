import type * as THREE from 'three'
import { WEATHER_HEIGHT } from './mapBuilder'

/** Muove il meteo in blocco: la pioggia cade, polvere e spore scendono piano e ondeggiano. */
export function animateWeather(weather: THREE.Points | null, delta: number): void {
  if (!weather) return
  const kind = weather.userData.weather as string
  const speed = kind === 'rain' ? 16 : kind === 'drizzle' ? 9 : 0.6
  weather.position.y -= speed * delta
  if (weather.position.y < -WEATHER_HEIGHT / 2) weather.position.y += WEATHER_HEIGHT / 2
  if (kind === 'dust' || kind === 'spores') weather.position.x = Math.sin(performance.now() * 0.0002) * 1.5
}
