/**
 * Generazione procedurale di edifici a più piani e torri aperte a partire da poche
 * misure. Il modulo è puro (nessuna dipendenza da Three.js o DOM): produce solidi per
 * collisioni e rendering, aree calpestabili e collegamenti per la navigazione.
 */

export const FLOOR_HEIGHT = 3.2
export const WALL_THICKNESS = 0.3
export const SLAB_THICKNESS = 0.25
export const STAIR_WIDTH = 1.4
export const STAIR_STEPS = 10
export const STAIR_TREAD = 0.42
export const STAIR_RUN = STAIR_STEPS * STAIR_TREAD
const STAIR_MARGIN = 1.3
const DOOR_WIDTH = 2
const DOOR_HEIGHT = 2.5
const WINDOW_WIDTH = 1.4
const WINDOW_BOTTOM = 1
const WINDOW_TOP = 2.2
const PARAPET_HEIGHT = 1.05
const RAILING_HEIGHT = 1.05
/** Distanza delle scale dal bordo delle torri: oltre la ringhiera (0,1 m) e le colonne d'angolo (0,4 m). */
const TOWER_STAIR_INSET = 0.5

export type Side = 'north' | 'south' | 'east' | 'west'
export type StructureStyle = 'concrete' | 'brick' | 'industrial' | 'glass'

export interface BuildingDefinition {
  id: string
  name?: string
  /** `building`: muri, finestre e porte. `tower`: struttura aperta con pilastri e ringhiere. */
  kind: 'building' | 'tower'
  x: number
  z: number
  width: number
  depth: number
  /** Piani interni; sopra l'ultimo c'è sempre il tetto calpestabile. Profondità minima 8. */
  floors: number
  doors: readonly Side[]
  style: StructureStyle
}

export type StructureBoxKind = 'wall' | 'floor' | 'stair' | 'parapet' | 'railing' | 'column' | 'roof-prop'

export interface StructureBox {
  id: string
  buildingId: string
  kind: StructureBoxKind
  style: StructureStyle
  min: [number, number, number]
  max: [number, number, number]
}

export interface WindowOpening {
  buildingId: string
  /** Centro dell'apertura. */
  x: number
  y: number
  z: number
  width: number
  height: number
  axis: 'x' | 'z'
}

export interface NavArea {
  id: string
  y: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Vani scala: chi ci si trova sopra sta ancora salendo dal livello inferiore. */
  holes: { minX: number; maxX: number; minZ: number; maxZ: number }[]
}

export interface NavPoint {
  x: number
  y: number
  z: number
  area: string
}

export interface NavLink {
  id: string
  a: NavPoint
  b: NavPoint
  /** Punti intermedi da percorrere in ordine da `a` a `b` (in ordine inverso al ritorno). */
  via?: NavPoint[]
  /** Collegamenti attraverso una porta acquistabile: percorribili solo a porta aperta. */
  doorId?: string
}

export interface StructureLight {
  buildingId: string
  x: number
  y: number
  z: number
}

export interface ExpandedStructures {
  boxes: StructureBox[]
  windows: WindowOpening[]
  areas: NavArea[]
  links: NavLink[]
  lights: StructureLight[]
}

export const GROUND_AREA = 'ground'

interface Opening {
  center: number
  width: number
  bottom: number
  top: number
}

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function getBuildingHeight(definition: BuildingDefinition): number {
  return definition.floors * FLOOR_HEIGHT + (definition.kind === 'building' ? PARAPET_HEIGHT : RAILING_HEIGHT)
}

export function expandStructures(definitions: readonly BuildingDefinition[]): ExpandedStructures {
  const result: ExpandedStructures = { boxes: [], windows: [], areas: [], links: [], lights: [] }
  for (const definition of definitions) expandBuilding(definition, result)
  return result
}

function expandBuilding(definition: BuildingDefinition, out: ExpandedStructures): void {
  const { id, style } = definition
  const x0 = definition.x - definition.width / 2
  const x1 = definition.x + definition.width / 2
  const z0 = definition.z - definition.depth / 2
  const z1 = definition.z + definition.depth / 2
  const tower = definition.kind === 'tower'
  let counter = 0
  const push = (kind: StructureBoxKind, min: [number, number, number], max: [number, number, number]): void => {
    if (max[0] - min[0] < 0.01 || max[1] - min[1] < 0.01 || max[2] - min[2] < 0.01) return
    out.boxes.push({ id: `${id}-${kind}-${counter}`, buildingId: id, kind, style, min, max })
    counter += 1
  }
  const interior: Rect = tower
    ? { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }
    : { minX: x0 + WALL_THICKNESS, maxX: x1 - WALL_THICKNESS, minZ: z0 + WALL_THICKNESS, maxZ: z1 - WALL_THICKNESS }

  // Scale: una rampa per ogni passaggio di livello, alternando lato ovest ed est. Nelle torri il
  // bordo è occupato da ringhiera e colonne: la rampa ne resta staccata, altrimenti le attraversa.
  const stairBounds: Rect = tower
    ? { ...interior, minX: interior.minX + TOWER_STAIR_INSET, maxX: interior.maxX - TOWER_STAIR_INSET }
    : interior
  const stairs = Array.from({ length: definition.floors }, (_, level) => getStair(level, stairBounds))

  for (let level = 0; level <= definition.floors; level += 1) {
    const baseY = level * FLOOR_HEIGHT
    const areaId = level === 0 && tower ? GROUND_AREA : `${id}-${level}`

    // Solaio del livello (non per il piano terra), forato in corrispondenza della scala che arriva.
    if (level > 0) {
      const slab: Rect = tower ? interior : { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }
      const hole = stairs[level - 1]?.footprint
      for (const rect of subtractRect(slab, hole)) {
        push('floor', [rect.minX, baseY - SLAB_THICKNESS, rect.minZ], [rect.maxX, baseY, rect.maxZ])
      }
      const arriving = stairs[level - 1]
      if (arriving) addStairwellRailings(arriving, baseY, push)
    }

    if (level === 0 && tower) {
      // Il piano terra di una torre è parte del terreno aperto.
    } else {
      const hole = level > 0 ? stairs[level - 1]?.footprint : undefined
      out.areas.push({ id: areaId, y: baseY, ...interior, holes: hole ? [hole] : [] })
    }

    const isRoof = level === definition.floors
    if (tower) {
      if (level > 0) addPerimeter(definition, baseY, RAILING_HEIGHT, 'railing', push)
    } else if (isRoof) {
      addPerimeter(definition, baseY, PARAPET_HEIGHT, 'parapet', push)
      const props = getRoofProps(definition, interior, stairs[level - 1]?.footprint)
      for (const prop of props) push('roof-prop', [prop.minX, baseY, prop.minZ], [prop.maxX, baseY + 0.9, prop.maxZ])
    } else {
      addWalls(definition, level, baseY, out, push)
      out.lights.push({ buildingId: id, x: definition.x, y: baseY + FLOOR_HEIGHT - 0.4, z: definition.z })
    }
  }

  if (tower) {
    for (const [cx, cz] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]] as const) {
      push('column', [cx - 0.2, 0, cz - 0.2], [cx + 0.2, definition.floors * FLOOR_HEIGHT - SLAB_THICKNESS, cz + 0.2])
    }
  }

  stairs.forEach((stair, level) => {
    const baseY = level * FLOOR_HEIGHT
    const rise = FLOOR_HEIGHT / STAIR_STEPS
    for (let step = 1; step <= STAIR_STEPS; step += 1) {
      const near = stair.startZ + stair.direction * (step - 1) * STAIR_TREAD
      const far = near + stair.direction * STAIR_TREAD
      push('stair', [stair.minX, baseY, Math.min(near, far)], [stair.maxX, baseY + step * rise, Math.max(near, far)])
    }
    const bottomArea = level === 0 && tower ? GROUND_AREA : `${id}-${level}`
    const centerX = (stair.minX + stair.maxX) / 2
    const endZ = stair.startZ + stair.direction * STAIR_RUN
    const roomX = stair.againstWest ? stair.maxX + 0.5 : stair.minX - 0.5
    const exitZ = endZ + stair.direction * 1.1
    out.links.push({
      id: `${id}-stair-${level}`,
      a: { x: centerX, y: baseY, z: stair.startZ - stair.direction * 0.65, area: bottomArea },
      via: [{ x: centerX, y: baseY + FLOOR_HEIGHT, z: endZ - stair.direction * 0.25, area: `${id}-stair-${level}` }],
      b: { x: roomX, y: baseY + FLOOR_HEIGHT, z: exitZ, area: `${id}-${level + 1}` },
    })
  })

  if (!tower) {
    for (const side of definition.doors) {
      const door = getDoorPoints(definition, side)
      out.links.push({
        id: `${id}-door-${side}`,
        a: { ...door.outside, y: 0, area: GROUND_AREA },
        b: { ...door.inside, y: 0, area: `${id}-0` },
      })
    }
  }
}

interface Stair {
  againstWest: boolean
  minX: number
  maxX: number
  startZ: number
  direction: 1 | -1
  footprint: Rect
}

function getStair(level: number, interior: Rect): Stair {
  const west = level % 2 === 0
  const minX = west ? interior.minX : interior.maxX - STAIR_WIDTH
  const maxX = minX + STAIR_WIDTH
  const direction: 1 | -1 = west ? -1 : 1
  const startZ = west ? interior.maxZ - STAIR_MARGIN : interior.minZ + STAIR_MARGIN
  const endZ = startZ + direction * STAIR_RUN
  return {
    againstWest: west,
    minX,
    maxX,
    startZ,
    direction,
    footprint: { minX, maxX, minZ: Math.min(startZ, endZ), maxZ: Math.max(startZ, endZ) },
  }
}

function addStairwellRailings(stair: Stair, y: number, push: (kind: StructureBoxKind, min: [number, number, number], max: [number, number, number]) => void): void {
  const t = 0.08
  const hole = stair.footprint
  // Ringhiera sul lato lungo verso la stanza e sul lato di partenza: l'uscita resta libera.
  const roomX = stair.againstWest ? hole.maxX : hole.minX
  push('railing', [roomX - t, y, hole.minZ], [roomX + t, y + RAILING_HEIGHT, hole.maxZ])
  const startEdge = stair.direction === -1 ? hole.maxZ : hole.minZ
  push('railing', [hole.minX, y, startEdge - t], [hole.maxX, y + RAILING_HEIGHT, startEdge + t])
}

function subtractRect(rect: Rect, hole: Rect | undefined): Rect[] {
  if (!hole) return [rect]
  const parts: Rect[] = []
  if (hole.minZ > rect.minZ) parts.push({ minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: hole.minZ })
  if (hole.maxZ < rect.maxZ) parts.push({ minX: rect.minX, maxX: rect.maxX, minZ: hole.maxZ, maxZ: rect.maxZ })
  if (hole.minX > rect.minX) parts.push({ minX: rect.minX, maxX: hole.minX, minZ: hole.minZ, maxZ: hole.maxZ })
  if (hole.maxX < rect.maxX) parts.push({ minX: hole.maxX, maxX: rect.maxX, minZ: hole.minZ, maxZ: hole.maxZ })
  return parts
}

/** Parapetto (edifici) o ringhiera (torri) lungo il perimetro del livello. */
function addPerimeter(
  definition: BuildingDefinition,
  y: number,
  height: number,
  kind: 'parapet' | 'railing',
  push: (kind: StructureBoxKind, min: [number, number, number], max: [number, number, number]) => void,
): void {
  const t = kind === 'parapet' ? WALL_THICKNESS : 0.1
  const x0 = definition.x - definition.width / 2
  const x1 = definition.x + definition.width / 2
  const z0 = definition.z - definition.depth / 2
  const z1 = definition.z + definition.depth / 2
  push(kind, [x0, y, z0], [x1, y + height, z0 + t])
  push(kind, [x0, y, z1 - t], [x1, y + height, z1])
  push(kind, [x0, y, z0 + t], [x0 + t, y + height, z1 - t])
  push(kind, [x1 - t, y, z0 + t], [x1, y + height, z1 - t])
}

function getRoofProps(definition: BuildingDefinition, interior: Rect, hole: Rect | undefined): Rect[] {
  // Unità di climatizzazione come coperture sul tetto, lontane dalla scala.
  const props: Rect[] = []
  const cx = definition.x
  const candidates: Rect[] = [
    { minX: cx - 0.8, maxX: cx + 0.8, minZ: interior.minZ + 1, maxZ: interior.minZ + 2.1 },
    { minX: cx + 1.2, maxX: cx + 2.6, minZ: interior.maxZ - 2.1, maxZ: interior.maxZ - 1 },
  ]
  for (const candidate of candidates) {
    const overlapsHole = hole && candidate.maxX > hole.minX - 0.8 && candidate.minX < hole.maxX + 0.8 && candidate.maxZ > hole.minZ - 0.8 && candidate.minZ < hole.maxZ + 0.8
    const inside = candidate.minX > interior.minX + 0.6 && candidate.maxX < interior.maxX - 0.6
    if (!overlapsHole && inside) props.push(candidate)
  }
  return props
}

function sideLength(definition: BuildingDefinition, side: Side): number {
  return side === 'north' || side === 'south' ? definition.width : definition.depth
}

function getWindowOpenings(definition: BuildingDefinition, side: Side, level: number): Opening[] {
  const length = sideLength(definition, side)
  const count = Math.max(0, Math.floor((length - 2) / 3))
  const openings: Opening[] = []
  const hasDoor = level === 0 && definition.doors.includes(side)
  for (let index = 0; index < count; index += 1) {
    const center = (index - (count - 1) / 2) * (length / Math.max(count, 1))
    if (hasDoor && Math.abs(center) < DOOR_WIDTH / 2 + WINDOW_WIDTH / 2 + 0.3) continue
    openings.push({ center, width: WINDOW_WIDTH, bottom: WINDOW_BOTTOM, top: WINDOW_TOP })
  }
  if (hasDoor) openings.push({ center: 0, width: DOOR_WIDTH, bottom: 0, top: DOOR_HEIGHT })
  return openings.sort((a, b) => a.center - b.center)
}

function addWalls(
  definition: BuildingDefinition,
  level: number,
  baseY: number,
  out: ExpandedStructures,
  push: (kind: StructureBoxKind, min: [number, number, number], max: [number, number, number]) => void,
): void {
  const t = WALL_THICKNESS
  const x0 = definition.x - definition.width / 2
  const x1 = definition.x + definition.width / 2
  const z0 = definition.z - definition.depth / 2
  const z1 = definition.z + definition.depth / 2
  const top = baseY + FLOOR_HEIGHT
  const sides: { side: Side; axis: 'x' | 'z'; from: number; to: number; fixedMin: number; fixedMax: number; center: number }[] = [
    { side: 'north', axis: 'x', from: x0, to: x1, fixedMin: z0, fixedMax: z0 + t, center: definition.x },
    { side: 'south', axis: 'x', from: x0, to: x1, fixedMin: z1 - t, fixedMax: z1, center: definition.x },
    { side: 'west', axis: 'z', from: z0 + t, to: z1 - t, fixedMin: x0, fixedMax: x0 + t, center: definition.z },
    { side: 'east', axis: 'z', from: z0 + t, to: z1 - t, fixedMin: x1 - t, fixedMax: x1, center: definition.z },
  ]
  for (const wall of sides) {
    const openings = getWindowOpenings(definition, wall.side, level)
    const box = (a: number, b: number, yMin: number, yMax: number): void => {
      if (b - a < 0.02) return
      if (wall.axis === 'x') push('wall', [a, yMin, wall.fixedMin], [b, yMax, wall.fixedMax])
      else push('wall', [wall.fixedMin, yMin, a], [wall.fixedMax, yMax, b])
    }
    let cursor = wall.from
    for (const opening of openings) {
      const start = wall.center + opening.center - opening.width / 2
      const end = start + opening.width
      box(cursor, start, baseY, top)
      if (opening.bottom > 0) box(start, end, baseY, baseY + opening.bottom)
      box(start, end, baseY + opening.top, top)
      cursor = end
      if (opening.bottom > 0) {
        const fixed = (wall.fixedMin + wall.fixedMax) / 2
        out.windows.push({
          buildingId: definition.id,
          x: wall.axis === 'x' ? start + opening.width / 2 : fixed,
          y: baseY + (opening.bottom + opening.top) / 2,
          z: wall.axis === 'z' ? start + opening.width / 2 : fixed,
          width: opening.width,
          height: opening.top - opening.bottom,
          axis: wall.axis,
        })
      }
    }
    box(cursor, wall.to, baseY, top)
  }
}

export function getDoorPoints(definition: BuildingDefinition, side: Side): { outside: { x: number; z: number }; inside: { x: number; z: number }; center: { x: number; z: number } } {
  const halfW = definition.width / 2
  const halfD = definition.depth / 2
  const offset = 1.3
  switch (side) {
    case 'north': return { center: { x: definition.x, z: definition.z - halfD }, outside: { x: definition.x, z: definition.z - halfD - offset }, inside: { x: definition.x, z: definition.z - halfD + offset } }
    case 'south': return { center: { x: definition.x, z: definition.z + halfD }, outside: { x: definition.x, z: definition.z + halfD + offset }, inside: { x: definition.x, z: definition.z + halfD - offset } }
    case 'west': return { center: { x: definition.x - halfW, z: definition.z }, outside: { x: definition.x - halfW - offset, z: definition.z }, inside: { x: definition.x - halfW + offset, z: definition.z } }
    case 'east': return { center: { x: definition.x + halfW, z: definition.z }, outside: { x: definition.x + halfW + offset, z: definition.z }, inside: { x: definition.x + halfW - offset, z: definition.z } }
  }
}

export const DOOR_OPENING = { width: DOOR_WIDTH, height: DOOR_HEIGHT }
