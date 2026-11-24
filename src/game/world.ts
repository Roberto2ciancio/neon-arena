import * as THREE from 'three'
import { raycastObstacles } from './collision'
import type { CollisionObstacle } from './collision'

/** Dislivello massimo superabile camminando (gradini, cordoli). */
export const STEP_HEIGHT = 0.45
export const GRAVITY = 18
export const STAND_HEIGHT = 1.8
export const CROUCH_HEIGHT = 1.15

export interface Body {
  /** Posizione dei piedi: `y` è l'altezza del pavimento su cui poggia il corpo. */
  position: THREE.Vector3
  velocityY: number
  grounded: boolean
}

export interface MoveResult {
  /** Velocità verticale all'atterraggio (positiva), 0 se non è atterrato in questo passo. */
  landingSpeed: number
}

/** Zona del terreno più bassa di quota 0 (sottosuolo): il pavimento implicito è a `floorY`. */
export interface TerrainPit {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  floorY: number
}

/**
 * Fosse del terreno associate alla lista dei solidi di una mappa: ogni partita (Zombie, TCT)
 * ha la sua lista, quindi niente stato globale condiviso fra mappe diverse.
 */
const terrainPits = new WeakMap<readonly CollisionObstacle[], readonly TerrainPit[]>()

export function setTerrainPits(solids: readonly CollisionObstacle[], pits: readonly TerrainPit[]): void {
  if (pits.length > 0) terrainPits.set(solids, pits)
  else terrainPits.delete(solids)
}

/** Quota del terreno nudo (senza solidi): 0, o il fondo della fossa che contiene il punto. */
export function getTerrainHeight(x: number, z: number, solids: readonly CollisionObstacle[]): number {
  const pits = terrainPits.get(solids)
  if (!pits) return 0
  for (const pit of pits) {
    if (x >= pit.minX && x <= pit.maxX && z >= pit.minZ && z <= pit.maxZ) return pit.floorY
  }
  return 0
}

/**
 * Vero se il punto è sul piano stradale (quota ~0, non su un ostacolo né in un'apertura del
 * sottosuolo): dove si possono far comparire zombie, casse e registrazioni.
 */
export function isStreetLevel(x: number, z: number, radius: number, solids: readonly CollisionObstacle[]): boolean {
  return Math.abs(getGroundHeight(x, z, 0, radius, solids)) < 0.15
}

function overlapsFootprint(box: THREE.Box3, x: number, z: number, radius: number): boolean {
  return x + radius > box.min.x && x - radius < box.max.x && z + radius > box.min.z && z - radius < box.max.z
}

/**
 * Altezza del pavimento sotto il corpo: il piano più alto la cui sommità è raggiungibile
 * dai piedi attuali con un gradino. Il terreno della mappa è a quota 0 (più in basso nelle
 * fosse del sottosuolo).
 */
export function getGroundHeight(x: number, z: number, feetY: number, radius: number, solids: readonly CollisionObstacle[]): number {
  const footprint = radius * 0.55
  let ground = getTerrainHeight(x, z, solids)
  for (const { box } of solids) {
    if (box.max.y > feetY + STEP_HEIGHT || box.max.y <= ground) continue
    if (overlapsFootprint(box, x, z, footprint)) ground = box.max.y
  }
  return ground
}

/** Quota del primo soffitto sopra i piedi, o Infinity. */
export function getCeilingHeight(x: number, z: number, feetY: number, radius: number, solids: readonly CollisionObstacle[]): number {
  const footprint = radius * 0.55
  let ceiling = Number.POSITIVE_INFINITY
  for (const { box } of solids) {
    if (box.min.y <= feetY + STEP_HEIGHT || box.min.y >= ceiling) continue
    if (overlapsFootprint(box, x, z, footprint)) ceiling = box.min.y
  }
  return ceiling
}

/** Collisione orizzontale contro i solidi che intersecano il volume verticale del corpo. */
export function resolveBodyCollisions(position: THREE.Vector3, radius: number, height: number, solids: readonly CollisionObstacle[]): THREE.Vector3 {
  const bottom = position.y + STEP_HEIGHT
  const top = position.y + height
  for (let pass = 0; pass < 2; pass += 1) {
    for (const { box } of solids) {
      if (box.max.y <= bottom || box.min.y >= top) continue
      const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x)
      const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z)
      const dx = position.x - closestX
      const dz = position.z - closestZ
      const distanceSquared = dx * dx + dz * dz
      if (distanceSquared > 0 && distanceSquared < radius * radius) {
        const distance = Math.sqrt(distanceSquared)
        position.x += (dx / distance) * (radius - distance)
        position.z += (dz / distance) * (radius - distance)
        continue
      }
      const inside = position.x >= box.min.x && position.x <= box.max.x && position.z >= box.min.z && position.z <= box.max.z
      if (!inside) continue
      const sides = [
        { distance: position.x - box.min.x, axis: 'x' as const, value: box.min.x - radius },
        { distance: box.max.x - position.x, axis: 'x' as const, value: box.max.x + radius },
        { distance: position.z - box.min.z, axis: 'z' as const, value: box.min.z - radius },
        { distance: box.max.z - position.z, axis: 'z' as const, value: box.max.z + radius },
      ]
      const nearest = sides.reduce((a, b) => (a.distance < b.distance ? a : b))
      position[nearest.axis] = nearest.value
    }
  }
  return position
}

/**
 * Bordo più alto a cui ci si aggrappa saltando, misurato dal pavimento di partenza. Copre casse
 * alte, furgoni e container delle mappe (2,2–2,6 m); resta sotto l'arrampicata degli zombie
 * (3,2 m), quindi non crea rifugi irraggiungibili.
 */
export const MANTLE_MAX_HEIGHT = 2.7
/** Quanto avanti si cerca il bordo oltre il raggio del corpo. */
const MANTLE_PROBE = 0.3

/**
 * Bordo su cui tirarsi su davanti al corpo: la sommità più alta entro `MANTLE_MAX_HEIGHT` dal
 * pavimento `groundY`, oltre un gradino normale, con spazio libero sopra almeno da accovacciati.
 * Restituisce la quota del bordo o null.
 */
export function findMantleLedge(position: THREE.Vector3, direction: THREE.Vector3, radius: number, groundY: number, solids: readonly CollisionObstacle[]): number | null {
  const length = Math.hypot(direction.x, direction.z)
  if (length < 0.001) return null
  const x = position.x + (direction.x / length) * (radius + MANTLE_PROBE)
  const z = position.z + (direction.z / length) * (radius + MANTLE_PROBE)
  const ledge = getGroundHeight(x, z, groundY + MANTLE_MAX_HEIGHT - STEP_HEIGHT, radius, solids)
  if (ledge <= groundY + STEP_HEIGHT) return null
  // Sopra il bordo deve entrare un corpo accovacciato.
  for (const { box } of solids) {
    if (box.max.y <= ledge + 0.05 || box.min.y >= ledge + CROUCH_HEIGHT) continue
    if (overlapsFootprint(box, x, z, radius)) return null
  }
  return ledge
}

/** Vero se un corpo alto `height` entra nella posizione senza toccare soffitti. */
export function hasHeadroom(position: THREE.Vector3, radius: number, height: number, solids: readonly CollisionObstacle[]): boolean {
  return getCeilingHeight(position.x, position.z, position.y, radius, solids) >= position.y + height
}

/**
 * Sposta un corpo: movimento orizzontale con collisioni, salita dei gradini, discesa
 * agganciata alle scale, gravità, soffitti e confini dell'arena.
 */
export function moveBody(
  body: Body,
  displacement: THREE.Vector3,
  delta: number,
  radius: number,
  height: number,
  solids: readonly CollisionObstacle[],
  arenaLimit: number,
): MoveResult {
  const { position } = body
  // Suddivide gli spostamenti lunghi per non attraversare muri sottili.
  const length = Math.hypot(displacement.x, displacement.z)
  const steps = Math.max(1, Math.ceil(length / (radius * 0.8)))
  for (let step = 0; step < steps; step += 1) {
    position.x += displacement.x / steps
    position.z += displacement.z / steps
    resolveBodyCollisions(position, radius, height, solids)
    if (body.grounded) {
      const ground = getGroundHeight(position.x, position.z, position.y, radius, solids)
      if (ground > position.y) position.y = ground
    }
  }
  position.x = THREE.MathUtils.clamp(position.x, -arenaLimit, arenaLimit)
  position.z = THREE.MathUtils.clamp(position.z, -arenaLimit, arenaLimit)

  const ground = getGroundHeight(position.x, position.z, position.y, radius, solids)
  if (body.grounded && body.velocityY <= 0 && position.y - ground <= STEP_HEIGHT) {
    position.y = ground
    body.velocityY = 0
    return { landingSpeed: 0 }
  }

  body.velocityY -= GRAVITY * delta
  const nextY = position.y + body.velocityY * delta
  if (body.velocityY > 0) {
    const ceiling = getCeilingHeight(position.x, position.z, position.y, radius, solids)
    if (nextY + height > ceiling) {
      position.y = Math.max(position.y, ceiling - height)
      body.velocityY = 0
      body.grounded = false
      return { landingSpeed: 0 }
    }
  }
  if (nextY <= ground) {
    const landingSpeed = body.grounded ? 0 : -body.velocityY
    position.y = ground
    body.velocityY = 0
    body.grounded = true
    return { landingSpeed }
  }
  position.y = nextY
  body.grounded = false
  return { landingSpeed: 0 }
}

/** Sterzata locale: cerca la direzione libera più vicina a quella desiderata. */
export function steerBody(
  position: THREE.Vector3,
  desiredDirection: THREE.Vector3,
  radius: number,
  height: number,
  solids: readonly CollisionObstacle[],
): THREE.Vector3 {
  const desired = desiredDirection.clone().setY(0)
  if (desired.lengthSq() === 0) return desired
  desired.normalize()
  const probeDistance = radius + 0.85
  // La sonda avanza a piccoli passi salendo i gradini: una scala non è un ostacolo.
  const isBlocked = (direction: THREE.Vector3): boolean => {
    const probe = position.clone()
    const stepCount = 4
    for (let step = 0; step < stepCount; step += 1) {
      probe.addScaledVector(direction, probeDistance / stepCount)
      resolveBodyCollisions(probe, radius, height, solids)
      const ground = getGroundHeight(probe.x, probe.z, probe.y, radius, solids)
      if (ground > probe.y || probe.y - ground <= STEP_HEIGHT) probe.y = ground
    }
    const progress = (probe.x - position.x) * direction.x + (probe.z - position.z) * direction.z
    return progress < probeDistance * 0.7
  }
  if (!isBlocked(desired)) return desired
  for (const angle of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const candidate = new THREE.Vector3(desired.x * cosine - desired.z * sine, 0, desired.x * sine + desired.z * cosine)
    if (!isBlocked(candidate)) return candidate
  }
  return desired.multiplyScalar(-1)
}

/** Oggetto lanciato che rimbalza su muri e pavimenti (granate). */
export function stepBouncingProjectile(position: THREE.Vector3, velocity: THREE.Vector3, delta: number, solids: readonly CollisionObstacle[], radius = 0.12): void {
  velocity.y -= 16 * delta
  const travel = velocity.length() * delta
  if (travel > 0) {
    const direction = velocity.clone().normalize()
    const wallDistance = raycastObstacles(position, direction, travel + radius, solids)
    if (wallDistance !== null && Math.abs(direction.y) < 0.85) {
      // Rimbalzo: inverte la componente orizzontale dominante e smorza.
      if (Math.abs(direction.x) > Math.abs(direction.z)) velocity.x *= -0.45
      else velocity.z *= -0.45
      velocity.y *= 0.7
    } else {
      position.addScaledVector(velocity, delta)
    }
  }
  const ground = getGroundHeight(position.x, position.z, position.y + 0.1, radius, solids)
  if (position.y <= ground + radius) {
    position.y = ground + radius
    velocity.y = velocity.y < -1.5 ? velocity.y * -0.38 : 0
    velocity.x *= 0.72
    velocity.z *= 0.72
  }
  const ceiling = getCeilingHeight(position.x, position.z, position.y - radius, radius, solids)
  if (position.y + radius > ceiling && velocity.y > 0) {
    position.y = ceiling - radius
    velocity.y *= -0.3
  }
}
