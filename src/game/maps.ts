import { getDoorPoints, DOOR_OPENING } from './structures'
import type { BuildingDefinition, Side } from './structures'
import type { WeaponId } from './weapons'
import type { AttachmentSelection } from './attachments'

export interface MapObstacleDefinition {
  id: string
  x: number
  z: number
  width: number
  height: number
  depth: number
  style: 'cover' | 'wall' | 'pillar' | 'container' | 'car' | 'crate' | 'barrel'
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
  /** Accessori già montati sulle armi delle postazioni (variante MK II). */
  attachments?: AttachmentSelection
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

export type PurchasableWeapon = Exclude<WeaponId, 'ar-07' | 'p-12'>

export const STATION_COSTS: Record<PurchasableWeapon | 'ammo' | 'medkit', number> = {
  'smg-9': 8,
  'vx-45': 12,
  'sg-6': 10,
  'as-12': 18,
  'dmr-3': 12,
  'sr-50': 20,
  'lmg-75': 18,
  'ak-74r': 15,
  'br-3': 15,
  'r-44': 8,
  'ap-18': 9,
  ammo: 3,
  medkit: 4,
}

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

/** Configurazioni da campo: ogni arma delle postazioni arriva con accessori adatti al suo ruolo. */
export const FIELD_ATTACHMENTS: Record<PurchasableWeapon, AttachmentSelection> = {
  'smg-9': { optic: 'red-dot', underbarrel: 'laser', magazine: 'extended-mag' },
  'vx-45': { optic: 'holo', underbarrel: 'vertical-grip', magazine: 'extended-mag' },
  'sg-6': { barrel: 'long-barrel', underbarrel: 'laser', magazine: 'extended-mag' },
  'as-12': { optic: 'red-dot', underbarrel: 'vertical-grip', magazine: 'fast-mag' },
  'dmr-3': { optic: 'scope-4x', muzzle: 'compensator', underbarrel: 'vertical-grip' },
  'sr-50': { muzzle: 'compensator', barrel: 'long-barrel', magazine: 'fast-mag' },
  'lmg-75': { optic: 'holo', underbarrel: 'vertical-grip', magazine: 'fast-mag' },
  'ak-74r': { optic: 'holo', muzzle: 'compensator', underbarrel: 'vertical-grip', magazine: 'extended-mag' },
  'br-3': { optic: 'red-dot', muzzle: 'flash-hider', magazine: 'extended-mag' },
  'r-44': { optic: 'red-dot', barrel: 'long-barrel' },
  'ap-18': { optic: 'red-dot', magazine: 'extended-mag' },
}

const weapon = (id: string, weaponId: PurchasableWeapon, x: number, y: number, z: number): StationDefinition => ({
  id, kind: 'weapon', weapon: weaponId, x, y, z, cost: STATION_COSTS[weaponId], attachments: FIELD_ATTACHMENTS[weaponId],
})

/** Pila di casse a gradino: dalla bassa (1,1 m) si salta sull'alta (2,2 m) per guadagnare quota. */
function crateStack(id: string, x: number, z: number, alongX = true): MapObstacleDefinition[] {
  return [
    { id: `${id}-low`, x, z, width: 1.2, height: 1.1, depth: 1.2, style: 'crate' },
    { id: `${id}-high`, x: alongX ? x + 1.2 : x, z: alongX ? z : z + 1.2, width: 1.2, height: 2.2, depth: 1.2, style: 'crate' },
  ]
}

/** Gruppo di tre barili industriali. */
function barrels(id: string, x: number, z: number): MapObstacleDefinition[] {
  return [
    { id: `${id}-a`, x, z, width: 0.7, height: 1, depth: 0.7, style: 'barrel' },
    { id: `${id}-b`, x: x + 0.75, z: z + 0.15, width: 0.7, height: 1, depth: 0.7, style: 'barrel' },
    { id: `${id}-c`, x: x + 0.35, z: z - 0.65, width: 0.7, height: 1, depth: 0.7, style: 'barrel' },
  ]
}

function cornerPillars(distance: number, height: number): MapObstacleDefinition[] {
  return [
    { id: 'pillar-nw', x: -distance, z: -distance, width: 1, height, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: distance, z: -distance, width: 1, height, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -distance, z: distance, width: 1, height, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: distance, z: distance, width: 1, height, depth: 1, style: 'pillar' },
  ]
}

// ---------------------------------------------------------------------------
// Stazione 13: binari, biglietteria a due piani, torre di controllo e passerella.
// ---------------------------------------------------------------------------

const STATION_BUILDINGS: BuildingDefinition[] = [
  { id: 'ticket-hall', name: 'BIGLIETTERIA', kind: 'building', x: -15, z: -8, width: 10, depth: 9, floors: 2, doors: ['south', 'east'], style: 'brick' },
  { id: 'control-tower', name: 'CONTROLLO', kind: 'building', x: 16, z: -13, width: 7, depth: 8, floors: 3, doors: ['south'], style: 'concrete' },
  { id: 'luggage-depot', name: 'DEPOSITO BAGAGLI', kind: 'building', x: 15, z: 13, width: 10, depth: 8, floors: 1, doors: ['north'], style: 'industrial' },
  { id: 'footbridge', kind: 'tower', x: 0, z: -12, width: 10, depth: 7, floors: 1, doors: [], style: 'industrial' },
  { id: 'waiting-room', name: 'SALA D’ATTESA', kind: 'building', x: -24, z: 22, width: 12, depth: 9, floors: 1, doors: ['north', 'east'], style: 'glass' },
  { id: 'water-tower', kind: 'tower', x: -29, z: -3, width: 7, depth: 8, floors: 2, doors: [], style: 'industrial' },
  { id: 'maintenance-shed', name: 'MANUTENZIONE', kind: 'building', x: 29, z: -15, width: 8, depth: 9, floors: 1, doors: ['south'], style: 'industrial' },
  { id: 'signal-box', name: 'CABINA SEGNALI', kind: 'building', x: 26, z: 26, width: 8, depth: 8, floors: 2, doors: ['north'], style: 'brick' },
]

export const STATION_13: MapDefinition = {
  id: 'station-13',
  name: 'Stazione 13',
  arenaLimit: 34,
  playerSpawn: { x: 0, z: 6 },
  enemySpawnRadius: 33,
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
    { id: 'wagon-north', x: 3.3, z: -21.5, width: 3, height: 2.9, depth: 9, style: 'container' },
    { id: 'wagon-south', x: -3.3, z: 22, width: 3, height: 2.9, depth: 9, style: 'container' },
    { id: 'barricade-north', x: -9, z: -28, width: 4, height: 1.2, depth: 0.4, style: 'cover' },
    { id: 'barricade-south', x: 10, z: 28, width: 4, height: 1.2, depth: 0.4, style: 'cover' },
    { id: 'platform-bench-west', x: -13, z: 2, width: 2.6, height: 0.9, depth: 0.7, style: 'cover' },
    { id: 'kiosk-east', x: 13, z: 2, width: 2.2, height: 2.4, depth: 2.2, style: 'container' },
    ...crateStack('crates-west', -12.5, 14),
    ...crateStack('crates-east', 12, -21),
    ...crateStack('crates-south', 18, 21, false),
    ...barrels('barrels-shed', 19, -19),
    ...barrels('barrels-tower', -22, -15),
    ...barrels('barrels-yard', 28, 8),
    ...cornerPillars(32, 7),
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
    weapon('station-ak', 'ak-74r', -6, 0, 18),
    weapon('station-sr', 'sr-50', -1, 3.2, -10),
    weapon('station-yard', 'vx-45', 20, 0, 6),
    weapon('station-platform', 'ap-18', -18, 0, 2),
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
  { id: 'workshop', name: 'OFFICINA MEZZI', kind: 'building', x: -28, z: -24, width: 10, depth: 9, floors: 1, doors: ['east'], style: 'industrial' },
  { id: 'silo', kind: 'tower', x: 30, z: 28, width: 7, depth: 8, floors: 3, doors: [], style: 'industrial' },
  { id: 'loading-office', name: 'CARICO MERCI', kind: 'building', x: 29, z: -27, width: 9, depth: 8, floors: 2, doors: ['south'], style: 'concrete' },
]

export const DEPOT_06: MapDefinition = {
  id: 'depot-06',
  name: 'Deposito 06',
  arenaLimit: 38,
  playerSpawn: { x: 0, z: 22 },
  enemySpawnRadius: 37,
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
    { id: 'stack-north-west', x: -14, z: -28, width: 6, height: 5.2, depth: 2.4, style: 'container' },
    { id: 'stack-south-east', x: 24, z: 6, width: 2.4, height: 5.2, depth: 6, style: 'container' },
    { id: 'forklift-west', x: -18, z: -6, width: 1.6, height: 1.4, depth: 2.8, style: 'car' },
    { id: 'forklift-east', x: 16, z: -16, width: 1.6, height: 1.4, depth: 2.8, style: 'car' },
    { id: 'container-row-west-a', x: -24, z: 24, width: 6, height: 2.6, depth: 2.4, style: 'container' },
    { id: 'container-row-west-b', x: -24, z: 30, width: 6, height: 2.6, depth: 2.4, style: 'container' },
    { id: 'container-row-east', x: 12, z: 30, width: 6, height: 2.6, depth: 2.4, style: 'container' },
    { id: 'truck-west', x: -31, z: 0, width: 2.6, height: 2.4, depth: 6, style: 'car' },
    { id: 'truck-north', x: 22, z: -16, width: 6, height: 2.4, depth: 2.6, style: 'car' },
    { id: 'fence-north', x: -2, z: -30, width: 8, height: 1.4, depth: 0.3, style: 'wall' },
    { id: 'fence-east', x: 32, z: 6, width: 0.3, height: 1.4, depth: 8, style: 'wall' },
    ...crateStack('crates-yard', -18, 18),
    ...crateStack('crates-dock', 18, 4, false),
    ...crateStack('crates-north', -4, -26),
    ...barrels('barrels-workshop', -21, -18),
    ...barrels('barrels-silo', 24, 33),
    ...barrels('barrels-west', -32, 12),
    ...cornerPillars(36, 7),
  ],
  doors: [buildingDoor('gatehouse-door', DEPOT_BUILDINGS[3]!, 'north', 8)],
  stations: [
    weapon('station-smg', 'smg-9', -18, 0, 5),
    weapon('station-sg', 'sg-6', 5, 0, -20),
    weapon('station-dmr', 'dmr-3', 19.5, 6.4, -1),
    weapon('station-lmg', 'lmg-75', 21, 0, 19.5),
    weapon('station-ak', 'br-3', -3, 0, 8),
    weapon('station-sr', 'sr-50', 20.5, 3.2, -7.2),
    weapon('station-gate', 'vx-45', -8, 0, 26),
    weapon('station-crane', 'as-12', 6, 0, 16),
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
  { id: 'hotel', name: 'HOTEL NEON', kind: 'building', x: -34, z: -20, width: 10, depth: 14, floors: 3, doors: ['east'], style: 'glass' },
  { id: 'cinema', name: 'CINEMA', kind: 'building', x: 34, z: 20, width: 10, depth: 12, floors: 2, doors: ['north'], style: 'brick' },
  { id: 'radio-tower', kind: 'tower', x: 34, z: -34, width: 7, depth: 8, floors: 3, doors: [], style: 'industrial' },
  { id: 'school', name: 'SCUOLA', kind: 'building', x: -34, z: 30, width: 12, depth: 9, floors: 2, doors: ['north', 'east'], style: 'concrete' },
]

export const DISTRICT_ZERO: MapDefinition = {
  id: 'district-zero',
  name: 'Distretto Zero',
  arenaLimit: 44,
  playerSpawn: { x: 0, z: 30 },
  enemySpawnRadius: 43,
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
    { id: 'bus-north', x: -8, z: -34, width: 2.6, height: 2.8, depth: 9, style: 'car' },
    { id: 'bus-south', x: 8, z: 36, width: 2.6, height: 2.8, depth: 9, style: 'car' },
    { id: 'car-far-west', x: -30, z: 2.4, width: 4, height: 1.3, depth: 2, style: 'car' },
    { id: 'car-far-east', x: 30, z: -2.4, width: 4, height: 1.3, depth: 2, style: 'car' },
    { id: 'barricade-west', x: -20, z: 0, width: 0.4, height: 1.2, depth: 4, style: 'cover' },
    { id: 'barricade-east', x: 20, z: 0, width: 0.4, height: 1.2, depth: 4, style: 'cover' },
    { id: 'planter-north-west', x: -10, z: -24, width: 2.4, height: 0.9, depth: 2.4, style: 'cover' },
    { id: 'planter-south-east', x: 10, z: 26, width: 2.4, height: 0.9, depth: 2.4, style: 'cover' },
    { id: 'newsstand', x: -6.5, z: 14, width: 2, height: 2.4, depth: 1.6, style: 'container' },
    ...crateStack('crates-market', -12, 28),
    ...crateStack('crates-garage', 28, 10, false),
    ...crateStack('crates-alley', -24, -6),
    ...barrels('barrels-radio', 27, -30),
    ...barrels('barrels-hotel', -27, -32),
    ...barrels('barrels-school', -25, 38),
    ...cornerPillars(42, 8),
  ],
  doors: [buildingDoor('offices-door', DISTRICT_BUILDINGS[1]!, 'south', 10)],
  stations: [
    weapon('station-smg', 'smg-9', -16, 0, -23),
    weapon('station-sg', 'sg-6', -16, 0, 17),
    weapon('station-dmr', 'dmr-3', -15.5, 9.6, -21),
    weapon('station-lmg', 'lmg-75', 16, 6.4, 24),
    weapon('station-ak', 'ak-74r', 5.5, 0, -12),
    weapon('station-revolver', 'r-44', -5.5, 0, -9),
    weapon('station-square', 'vx-45', 12, 0, 4),
    weapon('station-avenue', 'ap-18', -12, 0, -3),
    { id: 'station-ammo', kind: 'ammo', x: 22, y: 3.2, z: -17, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: -5.5, y: 0, z: 9, cost: STATION_COSTS.medkit },
  ],
}

// ---------------------------------------------------------------------------
// Porto 09: banchine con file di container, magazzini, gru e un faro.
// ---------------------------------------------------------------------------

const PORT_BUILDINGS: BuildingDefinition[] = [
  { id: 'warehouse-west', name: 'MAGAZZINO A', kind: 'building', x: -20, z: -18, width: 14, depth: 10, floors: 1, doors: ['south', 'east'], style: 'industrial' },
  { id: 'warehouse-east', name: 'MAGAZZINO B', kind: 'building', x: 19, z: -19, width: 12, depth: 10, floors: 2, doors: ['south'], style: 'industrial' },
  { id: 'crane', kind: 'tower', x: -26, z: 12, width: 7, depth: 8, floors: 3, doors: [], style: 'industrial' },
  { id: 'harbor-office', name: 'CAPITANERIA', kind: 'building', x: 22, z: 15, width: 10, depth: 9, floors: 2, doors: ['north'], style: 'brick' },
  { id: 'lighthouse', kind: 'tower', x: 13, z: -31, width: 7, depth: 8, floors: 3, doors: [], style: 'concrete' },
]

export const PORT_09: MapDefinition = {
  id: 'port-09',
  name: 'Porto 09',
  arenaLimit: 40,
  playerSpawn: { x: 0, z: 26 },
  enemySpawnRadius: 39,
  buildings: PORT_BUILDINGS,
  obstacles: [
    { id: 'containers-west-a', x: -10, z: -3, width: 2.4, height: 2.6, depth: 6, style: 'container' },
    { id: 'containers-west-b', x: -10, z: 6, width: 2.4, height: 5.2, depth: 6, style: 'container' },
    { id: 'containers-east-a', x: 10, z: -4, width: 2.4, height: 5.2, depth: 6, style: 'container' },
    { id: 'containers-east-b', x: 10, z: 5, width: 2.4, height: 2.6, depth: 6, style: 'container' },
    { id: 'quay-container-north', x: -4, z: -28, width: 6, height: 2.6, depth: 2.4, style: 'container' },
    { id: 'quay-container-south', x: -22, z: 30, width: 6, height: 2.6, depth: 2.4, style: 'container' },
    { id: 'forklift-west', x: -16, z: -6, width: 2, height: 1.6, depth: 3, style: 'car' },
    { id: 'forklift-east', x: 26, z: -6, width: 2, height: 1.6, depth: 3, style: 'car' },
    { id: 'truck-quay', x: 30, z: 30, width: 6, height: 2.4, depth: 2.6, style: 'car' },
    { id: 'bollards-north', x: 0, z: -14, width: 5, height: 0.9, depth: 0.6, style: 'cover' },
    { id: 'bollards-west', x: -30, z: -2, width: 0.6, height: 0.9, depth: 5, style: 'cover' },
    { id: 'bollards-east', x: 32, z: 4, width: 0.6, height: 0.9, depth: 5, style: 'cover' },
    { id: 'fence-quay', x: 0, z: 14, width: 7, height: 1.3, depth: 0.3, style: 'wall' },
    { id: 'net-store', x: 4, z: -22, width: 2.4, height: 2.4, depth: 2.4, style: 'container' },
    ...crateStack('crates-quay-west', -18, 20),
    ...crateStack('crates-quay-east', 16, 28),
    ...crateStack('crates-north', -2, -20, false),
    ...barrels('barrels-crane', -20, 4),
    ...barrels('barrels-office', 28, 22),
    ...barrels('barrels-north', 24, -30),
    ...cornerPillars(38, 7),
  ],
  doors: [buildingDoor('warehouse-east-door', PORT_BUILDINGS[1]!, 'south', 10)],
  stations: [
    weapon('station-quay', 'smg-9', -6, 0, 20),
    weapon('station-containers', 'sg-6', -6, 0, 1),
    weapon('station-forklift', 'ap-18', 14, 0, 1),
    weapon('station-crane-base', 'r-44', -20, 0, 18),
    weapon('station-warehouse', 'dmr-3', -20, 0, -10),
    weapon('station-office', 'vx-45', 16, 0, 8),
    weapon('station-lighthouse', 'ak-74r', 6, 0, -30),
    weapon('station-north', 'br-3', -14, 0, -28),
    { id: 'station-ammo', kind: 'ammo', x: 4, y: 0, z: 8, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: -26, y: 0, z: -4, cost: STATION_COSTS.medkit },
  ],
}

// ---------------------------------------------------------------------------
// Laboratorio 21: complesso di ricerca con edificio principale a tre piani, dormitorio e reattore.
// ---------------------------------------------------------------------------

const LAB_BUILDINGS: BuildingDefinition[] = [
  { id: 'lab-main', name: 'LABORATORIO 21', kind: 'building', x: 0, z: -20, width: 16, depth: 12, floors: 3, doors: ['south', 'east'], style: 'glass' },
  { id: 'dorm', name: 'DORMITORIO', kind: 'building', x: -25, z: 2, width: 10, depth: 12, floors: 2, doors: ['east'], style: 'concrete' },
  { id: 'reactor', kind: 'tower', x: 25, z: -6, width: 8, depth: 8, floors: 2, doors: [], style: 'industrial' },
  { id: 'greenhouse', name: 'SERRA', kind: 'building', x: -24, z: -26, width: 10, depth: 8, floors: 1, doors: ['east'], style: 'glass' },
  { id: 'clinic', name: 'INFERMERIA', kind: 'building', x: 23, z: 22, width: 10, depth: 9, floors: 1, doors: ['north'], style: 'brick' },
]

export const LAB_21: MapDefinition = {
  id: 'lab-21',
  name: 'Laboratorio 21',
  arenaLimit: 40,
  playerSpawn: { x: 0, z: 28 },
  enemySpawnRadius: 39,
  buildings: LAB_BUILDINGS,
  obstacles: [
    { id: 'courtyard-planter-west', x: -6, z: 4, width: 3, height: 0.9, depth: 3, style: 'cover' },
    { id: 'courtyard-planter-east', x: 6, z: 4, width: 3, height: 0.9, depth: 3, style: 'cover' },
    { id: 'courtyard-fountain', x: 0, z: 10, width: 3.4, height: 1, depth: 3.4, style: 'cover' },
    { id: 'generator-west', x: -12, z: -8, width: 3, height: 2.4, depth: 2, style: 'container' },
    { id: 'generator-east', x: 14, z: -12, width: 3, height: 2.4, depth: 2, style: 'container' },
    { id: 'checkpoint-wall-west', x: -9, z: 18, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'checkpoint-wall-east', x: 9, z: 18, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'ambulance', x: 14, z: 30, width: 2.6, height: 2.4, depth: 5, style: 'car' },
    { id: 'service-van', x: -16, z: 14, width: 4.6, height: 2.2, depth: 2.2, style: 'car' },
    { id: 'barricade-north', x: -14, z: -32, width: 4, height: 1.2, depth: 0.4, style: 'cover' },
    { id: 'barricade-reactor', x: 30, z: 6, width: 0.4, height: 1.2, depth: 4, style: 'cover' },
    { id: 'supply-cage', x: 30, z: -24, width: 2.4, height: 2.4, depth: 2.4, style: 'container' },
    ...crateStack('crates-dorm', -16, -2),
    ...crateStack('crates-reactor', 16, 4, false),
    ...crateStack('crates-gate', -26, 26),
    ...barrels('barrels-lab', 10, -30),
    ...barrels('barrels-clinic', 30, 30),
    ...barrels('barrels-serra', -32, -14),
    ...cornerPillars(38, 7),
  ],
  doors: [buildingDoor('clinic-door', LAB_BUILDINGS[4]!, 'north', 10)],
  stations: [
    weapon('station-gate', 'smg-9', -4, 0, 22),
    weapon('station-courtyard', 'sg-6', 4, 0, 0),
    weapon('station-fountain', 'ap-18', -4, 0, 12),
    weapon('station-dorm', 'r-44', -16, 0, 6),
    weapon('station-reactor', 'dmr-3', 18, 0, -2),
    weapon('station-lab', 'vx-45', 12, 0, -20),
    weapon('station-serra', 'ak-74r', -14, 0, -22),
    weapon('station-clinic', 'br-3', 16, 0, 14),
    { id: 'station-ammo', kind: 'ammo', x: 8, y: 0, z: 12, cost: STATION_COSTS.ammo },
    { id: 'station-medkit', kind: 'medkit', x: -10, y: 0, z: -2, cost: STATION_COSTS.medkit },
  ],
}

export const MAPS = [STATION_13, DEPOT_06, DISTRICT_ZERO, PORT_09, LAB_21] as const
