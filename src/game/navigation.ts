import { FLOOR_HEIGHT, GROUND_AREA } from './structures'
import type { NavArea, NavLink, NavPoint } from './structures'

export interface Point3 {
  x: number
  y: number
  z: number
}

const AREA_ABOVE_TOLERANCE = 0.5
const WAYPOINT_RADIUS = 0.75

/**
 * Area calpestabile che contiene il punto: il livello più alto sotto i piedi fra quelli il
 * cui perimetro contiene il punto. Chi sta salendo una scala appartiene al piano di partenza.
 */
export function findArea(point: Point3, areas: readonly NavArea[]): string {
  let best: NavArea | null = null
  for (const area of areas) {
    if (point.x < area.minX || point.x > area.maxX || point.z < area.minZ || point.z > area.maxZ) continue
    if (area.y > point.y + AREA_ABOVE_TOLERANCE) continue
    if (area.holes.some((hole) => point.x > hole.minX && point.x < hole.maxX && point.z > hole.minZ && point.z < hole.maxZ)) continue
    if (!best || area.y > best.y) best = area
  }
  return best?.id ?? GROUND_AREA
}

/**
 * Consuma i punti di passaggio già raggiunti. Quando i primi due punti sono gli estremi di
 * una scala o di una porta, basta trovarsi nel corridoio fra i due per puntare all'uscita.
 */
export function advanceWaypoints(position: Point3, waypoints: NavPoint[]): void {
  while (waypoints.length > 0) {
    const first = waypoints[0]!
    const reached = Math.hypot(first.x - position.x, first.z - position.z) < WAYPOINT_RADIUS && Math.abs(first.y - position.y) < 1.2
    const second = waypoints[1]
    const onLink = second !== undefined && second.area !== first.area && isOnSegment(position, first, second)
    if (!reached && !onLink) return
    waypoints.shift()
  }
}

function isOnSegment(position: Point3, a: Point3, b: Point3): boolean {
  const minY = Math.min(a.y, b.y) - 0.3
  const maxY = Math.max(a.y, b.y) + 0.3
  if (position.y < minY || position.y > maxY) return false
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return false
  const t = Math.min(1, Math.max(0, ((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSquared))
  return Math.hypot(a.x + dx * t - position.x, a.z + dz * t - position.z) < WAYPOINT_RADIUS
}

interface GraphNode {
  point: NavPoint
  /** Indice del nodo raggiungibile percorrendo il collegamento (scala o porta). */
  partner: number
  /** Punti intermedi da attraversare andando da questo nodo al partner. */
  via: NavPoint[]
}

/**
 * Grafo di navigazione fra aree. I nodi sono gli estremi dei collegamenti; due nodi della
 * stessa area sono collegati in linea retta, i due estremi di un collegamento fra loro.
 */
export class NavigationGraph {
  private readonly nodes: GraphNode[] = []
  private readonly linkDoors: (string | undefined)[] = []

  constructor(
    private readonly areas: readonly NavArea[],
    links: readonly NavLink[],
  ) {
    for (const link of links) {
      const first = this.nodes.length
      const via = link.via ?? []
      this.nodes.push({ point: link.a, partner: first + 1, via }, { point: link.b, partner: first, via: [...via].reverse() })
      this.linkDoors.push(link.doorId, link.doorId)
    }
  }

  areaOf(point: Point3): string {
    return findArea(point, this.areas)
  }

  /** Vero se il punto è a metà di una rampa: conviene finirla prima di ricalcolare il percorso. */
  isOnStairs(point: Point3): boolean {
    return this.areas.some((area) => area.holes.some((hole) =>
      point.x > hole.minX && point.x < hole.maxX && point.z > hole.minZ && point.z < hole.maxZ
      && point.y > area.y - FLOOR_HEIGHT + 0.1 && point.y < area.y - 0.05))
  }

  /**
   * Prossimi punti di passaggio da `from` a `to`. Restituisce una lista vuota se i due
   * punti sono nella stessa area (inseguimento diretto) o se non esiste un percorso.
   */
  findPath(from: Point3, to: Point3, isDoorOpen: (doorId: string) => boolean = () => true): NavPoint[] {
    const startArea = this.areaOf(from)
    const goalArea = this.areaOf(to)
    if (startArea === goalArea) return []
    const count = this.nodes.length
    const distance = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
    const previous = new Array<number>(count).fill(-1)
    const done = new Array<boolean>(count).fill(false)
    const usable = (index: number): boolean => {
      const door = this.linkDoors[index]
      return door === undefined || isDoorOpen(door)
    }
    for (let index = 0; index < count; index += 1) {
      const node = this.nodes[index]!
      if (node.point.area === startArea && usable(index)) distance[index] = horizontalDistance(from, node.point)
    }
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (;;) {
      let current = -1
      for (let index = 0; index < count; index += 1) {
        if (!done[index] && distance[index]! < (current < 0 ? Number.POSITIVE_INFINITY : distance[current]!)) current = index
      }
      if (current < 0 || distance[current] === Number.POSITIVE_INFINITY) break
      done[current] = true
      const node = this.nodes[current]!
      if (node.point.area === goalArea) {
        const cost = distance[current]! + horizontalDistance(node.point, to)
        if (cost < bestCost) {
          bestCost = cost
          best = current
        }
      }
      const relax = (target: number, cost: number): void => {
        if (done[target] || !usable(target) || cost >= distance[target]!) return
        distance[target] = cost
        previous[target] = current
      }
      relax(node.partner, distance[current]! + linkLength(node, this.nodes[node.partner]!.point))
      for (let index = 0; index < count; index += 1) {
        if (index === current || this.nodes[index]!.point.area !== node.point.area) continue
        relax(index, distance[current]! + horizontalDistance(node.point, this.nodes[index]!.point))
      }
    }
    if (best < 0) return []
    const indices: number[] = []
    for (let index = best; index >= 0; index = previous[index]!) indices.unshift(index)
    const path: NavPoint[] = []
    indices.forEach((index, position) => {
      const node = this.nodes[index]!
      const before = indices[position - 1]
      if (before !== undefined && this.nodes[before]!.partner === index) path.push(...this.nodes[before]!.via)
      path.push(node.point)
    })
    return path
  }
}

function horizontalDistance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function linkLength(node: GraphNode, target: Point3): number {
  let length = 0
  let from: Point3 = node.point
  for (const point of node.via) {
    length += distance3(from, point)
    from = point
  }
  return length + distance3(from, target)
}
