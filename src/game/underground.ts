/**
 * Livello sotterraneo (es. un mezzanino della metropolitana) sotto la strada. Il terreno resta
 * a quota 0 ovunque tranne nelle "fosse" del sottosuolo, dove il pavimento implicito scende a
 * `-depth`; sopra la fossa una soletta calpestabile fa da strada, forata dove partono le scale.
 * Il risultato usa gli stessi pezzi degli edifici (muri, solai, scale, ringhiere, colonne,
 * luci), quindi rendering, collisioni e navigazione degli zombie funzionano senza casi speciali.
 */
import { GROUND_AREA } from './structures'
import type { NavArea, NavLink, Side, StructureBox, StructureLight } from './structures'
import type { TerrainPit } from './world'

export interface UndergroundEntrance {
  /** Centro del bordo alto della scala, al livello della strada. */
  x: number
  z: number
  /** Verso in cui si scende (sud = +z, est = +x). */
  direction: Side
}

export interface UndergroundProp {
  x: number
  z: number
  width: number
  depth: number
  height: number
}

export interface UndergroundDefinition {
  id: string
  name: string
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Profondità del pavimento sotto la strada. */
  depth: number
  entrances: readonly UndergroundEntrance[]
  /** Coperture basse (panchine, tornelli, chioschi). */
  props?: readonly UndergroundProp[]
}

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface ExpandedUnderground {
  boxes: StructureBox[]
  areas: NavArea[]
  links: NavLink[]
  lights: StructureLight[]
  pits: TerrainPit[]
  /** Aperture nella soletta stradale (vani scala): il terreno visibile va forato qui. */
  openings: Rect[]
}

/** Sommità della soletta: poco sotto il disegno del terreno (-0,06), per non sovrapporsi. */
export const UNDERGROUND_SLAB_TOP = -0.1
export const UNDERGROUND_SLAB_BOTTOM = -0.4
export const UNDERGROUND_STAIR_WIDTH = 2.4
const WALL = 0.3
const TREAD = 0.42
const MAX_RISE = 0.38
const RAILING = 0.08
const RAILING_HEIGHT = 1.05
const COLUMN_SPACING = 7
const COLUMN_SIZE = 0.5

export function getUndergroundStairSteps(depth: number): number {
  return Math.ceil((depth + UNDERGROUND_SLAB_TOP) / MAX_RISE)
}

const DIRECTIONS: Record<Side, { along: 'x' | 'z'; sign: 1 | -1 }> = {
  north: { along: 'z', sign: -1 },
  south: { along: 'z', sign: 1 },
  east: { along: 'x', sign: 1 },
  west: { along: 'x', sign: -1 },
}

/**
 * Rettangolo in coordinate della scala: `u` lungo la discesa (0 = bordo alto), `v` di traverso
 * (0 = asse della scala).
 */
function stairRect(entrance: UndergroundEntrance, u0: number, u1: number, v0: number, v1: number): Rect {
  const { along, sign } = DIRECTIONS[entrance.direction]
  const start = along === 'x' ? entrance.x : entrance.z
  const across = along === 'x' ? entrance.z : entrance.x
  const a0 = sign > 0 ? start + u0 : start - u1
  const a1 = sign > 0 ? start + u1 : start - u0
  return along === 'x'
    ? { minX: a0, maxX: a1, minZ: across + v0, maxZ: across + v1 }
    : { minX: across + v0, maxX: across + v1, minZ: a0, maxZ: a1 }
}

function stairPoint(entrance: UndergroundEntrance, u: number): { x: number; z: number } {
  const { along, sign } = DIRECTIONS[entrance.direction]
  return along === 'x' ? { x: entrance.x + sign * u, z: entrance.z } : { x: entrance.x, z: entrance.z + sign * u }
}

/** Sottrae più fori da un rettangolo (pezzi rettangolari che non si sovrappongono). */
export function subtractRects(rect: Rect, holes: readonly Rect[]): Rect[] {
  let parts: Rect[] = [rect]
  for (const hole of holes) {
    const next: Rect[] = []
    for (const part of parts) {
      if (hole.maxX <= part.minX || hole.minX >= part.maxX || hole.maxZ <= part.minZ || hole.minZ >= part.maxZ) {
        next.push(part)
        continue
      }
      const minX = Math.max(part.minX, hole.minX)
      const maxX = Math.min(part.maxX, hole.maxX)
      const minZ = Math.max(part.minZ, hole.minZ)
      const maxZ = Math.min(part.maxZ, hole.maxZ)
      if (minZ > part.minZ) next.push({ ...part, maxZ: minZ })
      if (maxZ < part.maxZ) next.push({ ...part, minZ: maxZ })
      if (minX > part.minX) next.push({ minX: part.minX, maxX: minX, minZ, maxZ })
      if (maxX < part.maxX) next.push({ minX: maxX, maxX: part.maxX, minZ, maxZ })
    }
    parts = next
  }
  return parts
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.minX < b.maxX + margin && b.minX < a.maxX + margin && a.minZ < b.maxZ + margin && b.minZ < a.maxZ + margin
}

export function expandUnderground(definitions: readonly UndergroundDefinition[]): ExpandedUnderground {
  const out: ExpandedUnderground = { boxes: [], areas: [], links: [], lights: [], pits: [], openings: [] }
  for (const definition of definitions) expandOne(definition, out)
  return out
}

function expandOne(definition: UndergroundDefinition, out: ExpandedUnderground): void {
  const { id, depth } = definition
  const floorY = -depth
  const rect: Rect = { minX: definition.minX, maxX: definition.maxX, minZ: definition.minZ, maxZ: definition.maxZ }
  const interior: Rect = { minX: rect.minX + WALL, maxX: rect.maxX - WALL, minZ: rect.minZ + WALL, maxZ: rect.maxZ - WALL }
  let counter = 0
  const push = (kind: StructureBox['kind'], area: Rect, minY: number, maxY: number): void => {
    if (area.maxX - area.minX < 0.01 || area.maxZ - area.minZ < 0.01 || maxY - minY < 0.01) return
    out.boxes.push({ id: `${id}-${kind}-${counter}`, buildingId: id, kind, style: 'concrete', min: [area.minX, minY, area.minZ], max: [area.maxX, maxY, area.maxZ] })
    counter += 1
  }

  const steps = getUndergroundStairSteps(depth)
  const rise = (depth + UNDERGROUND_SLAB_TOP) / steps
  const run = (steps - 1) * TREAD
  const halfWidth = UNDERGROUND_STAIR_WIDTH / 2
  const openings = definition.entrances.map((entrance) => stairRect(entrance, 0, run, -halfWidth, halfWidth))
  out.openings.push(...openings)

  // Strada sopra il sottosuolo, forata dove scendono le scale.
  for (const part of subtractRects(rect, openings)) push('floor', part, UNDERGROUND_SLAB_BOTTOM, UNDERGROUND_SLAB_TOP)
  // Pavimento (solo da vedere: la quota la dà la fossa) e muri perimetrali sotto la soletta.
  push('floor', rect, floorY - 0.2, floorY)
  push('wall', { ...rect, maxZ: rect.minZ + WALL }, floorY, UNDERGROUND_SLAB_BOTTOM)
  push('wall', { ...rect, minZ: rect.maxZ - WALL }, floorY, UNDERGROUND_SLAB_BOTTOM)
  push('wall', { ...rect, minZ: rect.minZ + WALL, maxZ: rect.maxZ - WALL, maxX: rect.minX + WALL }, floorY, UNDERGROUND_SLAB_BOTTOM)
  push('wall', { ...rect, minZ: rect.minZ + WALL, maxZ: rect.maxZ - WALL, minX: rect.maxX - WALL }, floorY, UNDERGROUND_SLAB_BOTTOM)

  definition.entrances.forEach((entrance, index) => {
    // Gradini: il primo è un'alzata sotto la strada, l'ultimo un'alzata sopra il pavimento.
    for (let step = 0; step < steps - 1; step += 1) {
      push('stair', stairRect(entrance, step * TREAD, (step + 1) * TREAD, -halfWidth, halfWidth), floorY, UNDERGROUND_SLAB_TOP - (step + 1) * rise)
    }
    // Ringhiere ai lati e in fondo al vano, al livello della strada: si entra solo dall'alto.
    push('railing', stairRect(entrance, 0, run, -halfWidth - RAILING, -halfWidth + RAILING), UNDERGROUND_SLAB_TOP, RAILING_HEIGHT)
    push('railing', stairRect(entrance, 0, run, halfWidth - RAILING, halfWidth + RAILING), UNDERGROUND_SLAB_TOP, RAILING_HEIGHT)
    push('railing', stairRect(entrance, run - RAILING, run + RAILING, -halfWidth, halfWidth), UNDERGROUND_SLAB_TOP, RAILING_HEIGHT)
    const top = stairPoint(entrance, -0.9)
    const middle = stairPoint(entrance, run / 2)
    const bottom = stairPoint(entrance, run + 1.1)
    out.links.push({
      id: `${id}-entrance-${index}`,
      a: { ...top, y: 0, area: GROUND_AREA },
      via: [{ ...middle, y: floorY / 2, area: `${id}-stair-${index}` }],
      b: { ...bottom, y: floorY, area: `${id}-0` },
    })
  })

  // Colonne a griglia, lontane dalle scale.
  const columns: Rect[] = []
  for (let x = interior.minX + COLUMN_SPACING / 2; x < interior.maxX - 1; x += COLUMN_SPACING) {
    for (let z = interior.minZ + COLUMN_SPACING / 2; z < interior.maxZ - 1; z += COLUMN_SPACING) {
      const column = { minX: x - COLUMN_SIZE / 2, maxX: x + COLUMN_SIZE / 2, minZ: z - COLUMN_SIZE / 2, maxZ: z + COLUMN_SIZE / 2 }
      if (openings.some((opening) => overlaps(opening, column, 1.6))) continue
      columns.push(column)
      push('column', column, floorY, UNDERGROUND_SLAB_BOTTOM)
    }
  }
  for (const prop of definition.props ?? []) {
    push('roof-prop', { minX: prop.x - prop.width / 2, maxX: prop.x + prop.width / 2, minZ: prop.z - prop.depth / 2, maxZ: prop.z + prop.depth / 2 }, floorY, floorY + prop.height)
  }

  // Pannelli sul soffitto lungo l'asse lungo; due luci reali agli estremi.
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ
  const length = alongX ? interior.maxX - interior.minX : interior.maxZ - interior.minZ
  const count = Math.max(2, Math.round(length / 6))
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count
    const x = alongX ? interior.minX + t * (interior.maxX - interior.minX) : (interior.minX + interior.maxX) / 2
    const z = alongX ? (interior.minZ + interior.maxZ) / 2 : interior.minZ + t * (interior.maxZ - interior.minZ)
    const light = index === 0 ? `${id}-light-a` : index === count - 1 ? `${id}-light-b` : `${id}-light-a`
    out.lights.push({ buildingId: light, x, y: UNDERGROUND_SLAB_BOTTOM - 0.18, z })
  }

  out.areas.push({ id: `${id}-0`, y: floorY, ...interior, holes: [], maxY: -0.6 })
  out.pits.push({ ...rect, floorY })
}
