/**
 * Passi del giocatore con un suono diverso per superficie: asfalto bagnato sotto la pioggia,
 * ghiaia al deposito, metallo su container e torri, legno sulle casse, piastrelle negli
 * interni, gorgoglio nelle pozze acide. Il ritmo segue la distanza percorsa (più lenti
 * accovacciati, più forti in corsa) e l'atterraggio da un salto fa un passo pesante.
 */
import type { CollisionObstacle } from './collision'
import type { MapDefinition } from './maps'

export type Surface = 'concrete' | 'wet' | 'gravel' | 'dirt' | 'metal' | 'wood' | 'tile' | 'acid'

/** Suolo all'aperto di ogni mappa, dal meteo. */
export function getMapGroundSurface(map: Pick<MapDefinition, 'theme'>): Surface {
  switch (map.theme?.weather) {
    case 'rain':
    case 'drizzle':
      return 'wet'
    case 'dust':
      return 'gravel'
    case 'spores':
      return 'dirt'
    default:
      return 'concrete'
  }
}

const OBSTACLE_SURFACES: Record<MapDefinition['obstacles'][number]['style'], Surface> = {
  cover: 'concrete',
  wall: 'concrete',
  pillar: 'concrete',
  container: 'metal',
  car: 'metal',
  crate: 'wood',
  barrel: 'metal',
}

/**
 * Superficie di un solido calpestabile, dal suo id: ostacoli della mappa per stile, strutture
 * (`<edificio>-<tipo>-<n>`) per tipo di edificio. Null = suolo all'aperto.
 */
export function createSurfaceLookup(map: Pick<MapDefinition, 'theme' | 'obstacles' | 'buildings'>): (solidId: string | null) => Surface {
  const ground = getMapGroundSurface(map)
  const obstacles = new Map(map.obstacles.map((obstacle) => [obstacle.id, OBSTACLE_SURFACES[obstacle.style]]))
  const buildings = new Map(map.buildings.map((building) => [building.id, building]))
  return (solidId) => {
    if (!solidId) return ground
    const obstacle = obstacles.get(solidId)
    if (obstacle) return obstacle
    for (const [id, building] of buildings) {
      if (!solidId.startsWith(`${id}-`)) continue
      if (building.kind === 'tower' || building.style === 'industrial') return 'metal'
      const kind = solidId.slice(id.length + 1).split('-')[0]
      if (kind === 'floor') return 'tile'
      return 'concrete'
    }
    if (solidId.startsWith('door')) return 'wood'
    return 'concrete'
  }
}

/** Id del solido sotto i piedi (il più alto entro un passo), o null se si è sul suolo. */
export function getGroundSolidId(x: number, z: number, feetY: number, radius: number, solids: readonly CollisionObstacle[]): string | null {
  if (feetY < 0.08) return null
  const footprint = radius * 0.55
  let best: CollisionObstacle | null = null
  for (const solid of solids) {
    const { box } = solid
    if (Math.abs(box.max.y - feetY) > 0.12) continue
    if (x + footprint < box.min.x || x - footprint > box.max.x || z + footprint < box.min.z || z - footprint > box.max.z) continue
    if (!best || box.max.y > best.box.max.y) best = solid
  }
  return best?.id ?? null
}

export interface StepInput {
  /** Distanza orizzontale percorsa in questo frame (metri). */
  distance: number
  grounded: boolean
  sprinting: boolean
  crouched: boolean
  sliding: boolean
  /** Velocità verticale all'atterraggio (0 se non si è atterrati in questo frame). */
  landingSpeed: number
}

export interface StepEvent {
  /** 0–1. */
  volume: number
  landing: boolean
}

export const STRIDE = { crouch: 1.15, walk: 1.75, sprint: 2.35 } as const
const STEP_VOLUME = { crouch: 0.3, walk: 0.62, sprint: 0.9 } as const

/** Conta i passi dalla distanza percorsa a terra. */
export class StepTracker {
  private travelled = 0

  update(input: StepInput): StepEvent | null {
    if (input.landingSpeed > 3.5) {
      this.travelled = 0
      return { volume: Math.min(1, 0.45 + (input.landingSpeed - 3.5) * 0.08), landing: true }
    }
    // In aria e in scivolata non ci sono passi.
    if (!input.grounded || input.sliding) return null
    const gait = input.crouched ? 'crouch' : input.sprinting ? 'sprint' : 'walk'
    this.travelled += input.distance
    if (this.travelled < STRIDE[gait]) return null
    this.travelled = 0
    return { volume: STEP_VOLUME[gait], landing: false }
  }

  reset(): void {
    this.travelled = 0
  }
}
