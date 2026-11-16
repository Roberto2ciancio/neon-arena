import { getDoorPoints, DOOR_OPENING } from './structures'
import type { BuildingDefinition, Side } from './structures'
import type { WeaponId } from './weapons'

export interface MapObstacleDefinition {
  id: string
  x: number
  z: number
  width: number
  height: number
  depth: number
  style: 'cover' | 'wall' | 'pillar' | 'container' | 'car'
}

export interface MapDoorDefinition {
  id: string
  x: number
  z: number
  width: number
  height: number
  depth: number
  cost: number
  /** Porta montata nell'ingresso di un edificio: blocca il relativo collegamento di navigazione. */
  building?: { id: string; side: Side }
}

export type StationKind = 'weapon' | 'ammo' | 'medkit'

/** Postazione acquistabile con i frammenti nella modalità zombie. */
export interface StationDefinition {
  id: string
  kind: StationKind
  weapon?: WeaponId
  x: number
  /** Quota del pavimento su cui poggia la postazione. */
  y: number
  z: number
  cost: number
}

export interface MapDefinition {
  id: string
  name: string
  arenaLimit: number
  playerSpawn: { x: number; z: number }
  enemySpawnRadius: number
  obstacles: readonly MapObstacleDefinition[]
  doors: readonly MapDoorDefinition[]
  buildings: readonly BuildingDefinition[]
  stations: readonly StationDefinition[]
}

export const STATION_COSTS = {
  'smg-9': 6,
  'sg-6': 8,
  'dmr-3': 10,
  'lmg-75': 14,
  ammo: 3,
  medkit: 4,
} as const

function buildingDoor(id: string, building: BuildingDefinition, side: Side, cost: number): MapDoorDefinition {
  const { center } = getDoorPoints(building, side)
  const alongX = side === 'north' || side === 'south'
  return {
    id,
    x: center.x,
    z: center.z,
    width: alongX ? DOOR_OPENING.width : 0.36,
    depth: alongX ? 0.36 : DOOR_OPENING.width,
    height: DOOR_OPENING.height,
    cost,
    building: { id: building.id, side },
  }
}

const weapon = (id: string, weaponId: Exclude<WeaponId, 'ar-07' | 'p-12'>, x: number, y: number, z: number): StationDefinition => ({
  id, kind: 'weapon', weapon: weaponId, x, y, z, cost: STATION_COSTS[weaponId],
})

// ---------------------------------------------------------------------------
// Stazione 13: binari, biglietteria a due piani, torre di controllo e passerella.
// ---------------------------------------------------------------------------

const STATION_BUILDINGS: BuildingDefinition[] = [
  { id: 'ticket-hall', name: 'BIGLIETTERIA', kind: 'building', x: -15, z: -8, width: 10, depth: 9, floors: 2, doors: ['south', 'east'], style: 'brick' },
  { id: 'control-tower', name: 'CONTROLLO', kind: 'building', x: 16, z: -13, width: 7, depth: 8, floors: 3, doors: ['south'], style: 'concrete' },
  { id: 'luggage-depot', name: 'DEPOSITO BAGAGLI', kind: 'building', x: 15, z: 13, width: 10, depth: 8, floors: 1, doors: ['north'], style: 'industrial' },
  { id: 'footbridge', kind: 'tower', x: 0, z: -12, width: 10, depth: 7, floors: 1, doors: [], style: 'industrial' },
]

export const STATION_13: MapDefinition = {
  id: 'station-13',
  name: 'Stazione 13',
  arenaLimit: 26,
  playerSpawn: { x: 0, z: 6 },
  enemySpawnRadius: 25,
  buildings: STATION_BUILDINGS,
  obstacles: [
    { id: 'gate-west-wing', x: -4.5, z: 2, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'gate-east-wing', x: 4.5, z: 2, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'ticket-booth', x: 0, z: -3.5, width: 4, height: 1.45, depth: 2, style: 'cover' },
    { id: 'west-cover', x: -8, z: 6, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'east-cover', x: 8, z: 8, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'south-cover', x: -6, z: 15, width: 3, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'south-east-cover', x: 5, z: 20, width: 3, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'platform-cover-west', x: -8, z: -20, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'platform-cover-east', x: 8, z: -21, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'freight-car-west', x: -21, z: 10, width: 3, height: 2.7, depth: 9, style: 'container' },
    { id: 'freight-car-east', x: 23, z: -1, width: 3, height: 2.7, depth: 8, style: 'container' },
    { id: 'barrier-west', x: -10, z: 2, width: 0.6, height: 1.2, depth: 5, style: 'wall' },
    { id: 'barrier-east', x: 10, z: -4, width: 0.6, height: 1.2, depth: 5, style: 'wall' },
    { id: 'pillar-nw', x: -24, z: -24, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 24, z: -24, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -24, z: 24, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 24, z: 24, width: 1, height: 7, depth: 1, style: 'pillar' },
  ],
  doors: [
    { id: 'supply-gate', x: 0, z: 2, width: 3, height: 2.4, depth: 0.4, cost: 5 },
    buildingDoor('luggage-door', STATION_BUILDINGS[2]!, 'north', 8),
  ],
  stations: [
    weapon('station-smg', 'smg-9', -14, 0, -11.2),
    weapon('station-sg', 'sg-6', -6, 0, 2.9),
    weapon('station-dmr', 'dmr-3', 18.4, 9.6, -13.2),
    weapon('station-lmg', 'lmg-75', 17.5, 0, 15.5),
    { id: 'station-ammo', kind: 'ammo', x: 2, y: 3.2, z: -12, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: -13, y: 3.2, z: -6, cost: STATION_COSTS.medkit },
  ],
}

// ---------------------------------------------------------------------------
// Deposito 06: container su tre corsie, magazzino, uffici e gru.
// ---------------------------------------------------------------------------

const DEPOT_BUILDINGS: BuildingDefinition[] = [
  { id: 'warehouse', name: 'MAGAZZINO', kind: 'building', x: 0, z: -17, width: 16, depth: 10, floors: 1, doors: ['south'], style: 'industrial' },
  { id: 'office-block', name: 'UFFICI', kind: 'building', x: -21, z: 8, width: 9, depth: 9, floors: 2, doors: ['east', 'south'], style: 'concrete' },
  { id: 'crane-tower', kind: 'tower', x: 21, z: -4, width: 6, depth: 8, floors: 2, doors: [], style: 'industrial' },
  { id: 'gatehouse', name: 'GUARDIOLA', kind: 'building', x: 20, z: 18, width: 8, depth: 8, floors: 1, doors: ['north'], style: 'brick' },
]

export const DEPOT_06: MapDefinition = {
  id: 'depot-06',
  name: 'Deposito 06',
  arenaLimit: 30,
  playerSpawn: { x: 0, z: 22 },
  enemySpawnRadius: 29,
  buildings: DEPOT_BUILDINGS,
  obstacles: [
    { id: 'west-container-south', x: -12, z: 14, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'west-container-center', x: -12, z: 2, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'west-container-north', x: -12, z: -6, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'east-container-south', x: 12, z: 10, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'east-container-center', x: 12, z: 0, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'east-container-north', x: 12, z: -10, width: 4.5, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'west-corridor-wall', x: -6, z: 4, width: 0.6, height: 2.8, depth: 8, style: 'wall' },
    { id: 'east-corridor-wall', x: 6, z: -2, width: 0.6, height: 2.8, depth: 8, style: 'wall' },
    { id: 'center-cover-south', x: 0, z: 12, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'center-cover-center', x: 0, z: 2, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'center-cover-north', x: 0, z: -6, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'stack-north-west', x: -24, z: -22, width: 6, height: 5.2, depth: 2.4, style: 'container' },
    { id: 'stack-south-east', x: 24, z: 6, width: 2.4, height: 5.2, depth: 6, style: 'container' },
    { id: 'forklift-west', x: -18, z: -6, width: 1.6, height: 1.4, depth: 2.8, style: 'car' },
    { id: 'forklift-east', x: 16, z: -16, width: 1.6, height: 1.4, depth: 2.8, style: 'car' },
    { id: 'pillar-nw', x: -28, z: -28, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 28, z: -28, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -28, z: 28, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 28, z: 28, width: 1, height: 7, depth: 1, style: 'pillar' },
  ],
  doors: [buildingDoor('gatehouse-door', DEPOT_BUILDINGS[3]!, 'north', 8)],
  stations: [
    weapon('station-smg', 'smg-9', -18, 0, 5),
    weapon('station-sg', 'sg-6', 5, 0, -20),
    weapon('station-dmr', 'dmr-3', 19.5, 6.4, -1),
    weapon('station-lmg', 'lmg-75', 21, 0, 19.5),
    { id: 'station-ammo', kind: 'ammo', x: 3, y: 0, z: -3, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: 4, y: 3.2, z: -17, cost: STATION_COSTS.medkit },
  ],
}

// ---------------------------------------------------------------------------
// Distretto Zero: incrocio urbano con palazzi a più piani e un parcheggio multipiano.
// ---------------------------------------------------------------------------

const DISTRICT_BUILDINGS: BuildingDefinition[] = [
  { id: 'apartments', name: 'RESIDENZE', kind: 'building', x: -20, z: -20, width: 12, depth: 10, floors: 3, doors: ['south', 'east'], style: 'brick' },
  { id: 'offices', name: 'UFFICI ZERO', kind: 'building', x: 20, z: -20, width: 11, depth: 10, floors: 2, doors: ['south', 'east'], style: 'glass' },
  { id: 'market', name: 'MERCATO', kind: 'building', x: -20, z: 20, width: 12, depth: 9, floors: 1, doors: ['north', 'east'], style: 'concrete' },
  { id: 'garage', kind: 'tower', x: 20, z: 20, width: 12, depth: 10, floors: 2, doors: [], style: 'concrete' },
]

export const DISTRICT_ZERO: MapDefinition = {
  id: 'district-zero',
  name: 'Distretto Zero',
  arenaLimit: 36,
  playerSpawn: { x: 0, z: 30 },
  enemySpawnRadius: 35,
  buildings: DISTRICT_BUILDINGS,
  obstacles: [
    { id: 'west-alley-wall', x: -9, z: -8, width: 0.5, height: 2.8, depth: 7, style: 'wall' },
    { id: 'east-alley-wall', x: 9, z: 8, width: 0.5, height: 2.8, depth: 7, style: 'wall' },
    { id: 'square-cover-north', x: 0, z: -7, width: 4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'square-cover-south', x: 0, z: 7, width: 4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'square-cover-west', x: -7, z: 0, width: 0.8, height: 1.1, depth: 4, style: 'cover' },
    { id: 'square-cover-east', x: 7, z: 0, width: 0.8, height: 1.1, depth: 4, style: 'cover' },
    { id: 'car-north-west', x: -2.4, z: -16, width: 2, height: 1.3, depth: 4, style: 'car' },
    { id: 'car-north-east', x: 2.6, z: -26, width: 2, height: 1.3, depth: 4, style: 'car' },
    { id: 'car-west', x: -16, z: 2.4, width: 4, height: 1.3, depth: 2, style: 'car' },
    { id: 'car-east', x: 15, z: -2.4, width: 4, height: 1.3, depth: 2, style: 'car' },
    { id: 'car-south', x: 2.4, z: 16, width: 2, height: 1.3, depth: 4, style: 'car' },
    { id: 'bus-stop', x: -27, z: -5.6, width: 5, height: 2.4, depth: 0.4, style: 'wall' },
    { id: 'kiosk', x: 6.5, z: 6.5, width: 2.2, height: 2.6, depth: 2.2, style: 'container' },
    { id: 'pillar-nw', x: -34, z: -34, width: 1, height: 8, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 34, z: -34, width: 1, height: 8, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -34, z: 34, width: 1, height: 8, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 34, z: 34, width: 1, height: 8, depth: 1, style: 'pillar' },
  ],
  doors: [buildingDoor('offices-door', DISTRICT_BUILDINGS[1]!, 'south', 10)],
  stations: [
    weapon('station-smg', 'smg-9', -16, 0, -23),
    weapon('station-sg', 'sg-6', -16, 0, 17),
    weapon('station-dmr', 'dmr-3', -15.5, 9.6, -21),
    weapon('station-lmg', 'lmg-75', 16, 6.4, 24),
    { id: 'station-ammo', kind: 'ammo', x: 22, y: 3.2, z: -17, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: -5.5, y: 0, z: 9, cost: STATION_COSTS.medkit },
  ],
}

export const MAPS = [STATION_13, DEPOT_06, DISTRICT_ZERO] as const
