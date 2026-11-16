export interface MapObstacleDefinition {
  id: string
  x: number
  z: number
  width: number
  height: number
  depth: number
  style: 'cover' | 'wall' | 'pillar'
}

export interface MapDoorDefinition {
  id: string
  x: number
  z: number
  width: number
  height: number
  depth: number
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
}

export const STATION_13: MapDefinition = {
  id: 'station-13',
  name: 'Stazione 13',
  arenaLimit: 16.5,
  playerSpawn: { x: 0, z: 6 },
  enemySpawnRadius: 15.5,
  obstacles: [
    { id: 'gate-west-wing', x: -4.5, z: 2, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'gate-east-wing', x: 4.5, z: 2, width: 6, height: 2.6, depth: 0.5, style: 'wall' },
    { id: 'ticket-booth', x: 0, z: -3, width: 4, height: 1.45, depth: 2, style: 'cover' },
    { id: 'west-cover', x: -7, z: 1, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'east-cover', x: 7, z: 5, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'south-cover', x: -6, z: 10, width: 3, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'north-cover', x: 7, z: -10, width: 3, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'west-wall', x: -11, z: -4, width: 0.6, height: 2.6, depth: 6, style: 'wall' },
    { id: 'east-wall', x: 11, z: 1, width: 0.6, height: 2.6, depth: 6, style: 'wall' },
    { id: 'pillar-nw', x: -14.5, z: -14.5, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 14.5, z: -14.5, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -14.5, z: 14.5, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 14.5, z: 14.5, width: 1, height: 6, depth: 1, style: 'pillar' },
  ],
  doors: [
    { id: 'supply-gate', x: 0, z: 2, width: 3, height: 2.4, depth: 0.4, cost: 5 },
  ],
}

export const DEPOT_06: MapDefinition = {
  id: 'depot-06',
  name: 'Deposito 06',
  arenaLimit: 18,
  playerSpawn: { x: 0, z: 13 },
  enemySpawnRadius: 17,
  obstacles: [
    { id: 'west-container-south', x: -10, z: 9, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'west-container-center', x: -10, z: 0, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'west-container-north', x: -10, z: -9, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'east-container-south', x: 10, z: 7, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'east-container-center', x: 10, z: -2, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'east-container-north', x: 10, z: -11, width: 4.5, height: 2.2, depth: 2.2, style: 'cover' },
    { id: 'west-corridor-wall', x: -5, z: 0, width: 0.6, height: 2.8, depth: 8, style: 'wall' },
    { id: 'east-corridor-wall', x: 5, z: -2, width: 0.6, height: 2.8, depth: 8, style: 'wall' },
    { id: 'center-cover-south', x: 0, z: 6, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'center-cover-center', x: 0, z: -2, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'center-cover-north', x: 0, z: -10, width: 3.4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'forklift-west', x: -15, z: 4, width: 1.6, height: 1.4, depth: 2.8, style: 'cover' },
    { id: 'forklift-east', x: 15, z: -5, width: 1.6, height: 1.4, depth: 2.8, style: 'cover' },
    { id: 'pillar-nw', x: -16, z: -16, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 16, z: -16, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -16, z: 16, width: 1, height: 6, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 16, z: 16, width: 1, height: 6, depth: 1, style: 'pillar' },
  ],
  doors: [],
}

export const DISTRICT_ZERO: MapDefinition = {
  id: 'district-zero',
  name: 'Distretto Zero',
  arenaLimit: 22,
  playerSpawn: { x: 0, z: 17 },
  enemySpawnRadius: 21,
  obstacles: [
    { id: 'nw-building-back', x: -13, z: -15, width: 8, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'nw-building-left', x: -17, z: -10, width: 0.6, height: 3.4, depth: 10, style: 'wall' },
    { id: 'nw-building-right', x: -9, z: -12, width: 0.6, height: 3.4, depth: 6, style: 'wall' },
    { id: 'nw-building-front-a', x: -15.5, z: -5, width: 3, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'nw-building-front-b', x: -10.5, z: -5, width: 3, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'ne-building-back', x: 13, z: -15, width: 8, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'ne-building-right', x: 17, z: -10, width: 0.6, height: 3.4, depth: 10, style: 'wall' },
    { id: 'ne-building-left', x: 9, z: -12, width: 0.6, height: 3.4, depth: 6, style: 'wall' },
    { id: 'ne-building-front-a', x: 10.5, z: -5, width: 3, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'ne-building-front-b', x: 15.5, z: -5, width: 3, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'sw-building-back', x: -13, z: 15, width: 8, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'sw-building-left', x: -17, z: 10, width: 0.6, height: 3.4, depth: 10, style: 'wall' },
    { id: 'sw-building-right-a', x: -9, z: 7, width: 0.6, height: 3.4, depth: 4, style: 'wall' },
    { id: 'sw-building-right-b', x: -9, z: 13, width: 0.6, height: 3.4, depth: 4, style: 'wall' },
    { id: 'se-building-back', x: 13, z: 15, width: 8, height: 3.4, depth: 0.6, style: 'wall' },
    { id: 'se-building-right', x: 17, z: 10, width: 0.6, height: 3.4, depth: 10, style: 'wall' },
    { id: 'se-building-left-a', x: 9, z: 7, width: 0.6, height: 3.4, depth: 4, style: 'wall' },
    { id: 'se-building-left-b', x: 9, z: 13, width: 0.6, height: 3.4, depth: 4, style: 'wall' },
    { id: 'west-alley-wall', x: -6, z: 0, width: 0.5, height: 2.8, depth: 7, style: 'wall' },
    { id: 'east-alley-wall', x: 6, z: 0, width: 0.5, height: 2.8, depth: 7, style: 'wall' },
    { id: 'square-cover-north', x: 0, z: -5, width: 4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'square-cover-south', x: 0, z: 5, width: 4, height: 1.1, depth: 0.8, style: 'cover' },
    { id: 'square-cover-west', x: -3.5, z: 0, width: 0.8, height: 1.1, depth: 3, style: 'cover' },
    { id: 'square-cover-east', x: 3.5, z: 0, width: 0.8, height: 1.1, depth: 3, style: 'cover' },
    { id: 'west-abandoned-car', x: -12, z: 0, width: 2, height: 1.25, depth: 3.8, style: 'cover' },
    { id: 'east-abandoned-car', x: 12, z: 1, width: 2, height: 1.25, depth: 3.8, style: 'cover' },
    { id: 'pillar-nw', x: -20, z: -20, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-ne', x: 20, z: -20, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-sw', x: -20, z: 20, width: 1, height: 7, depth: 1, style: 'pillar' },
    { id: 'pillar-se', x: 20, z: 20, width: 1, height: 7, depth: 1, style: 'pillar' },
  ],
  doors: [],
}

export const MAPS = [STATION_13, DEPOT_06, DISTRICT_ZERO] as const
