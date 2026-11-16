import * as THREE from 'three'

export interface CollisionObstacle {
  id: string
  box: THREE.Box3
}

export function resolveCircleCollisions(
  position: THREE.Vector3,
  radius: number,
  obstacles: readonly CollisionObstacle[],
): THREE.Vector3 {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const obstacle of obstacles) {
      const { box } = obstacle
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

      const inside = position.x >= box.min.x && position.x <= box.max.x
        && position.z >= box.min.z && position.z <= box.max.z
      if (!inside) continue

      const sides = [
        { distance: position.x - box.min.x, axis: 'x' as const, value: box.min.x - radius },
        { distance: box.max.x - position.x, axis: 'x' as const, value: box.max.x + radius },
        { distance: position.z - box.min.z, axis: 'z' as const, value: box.min.z - radius },
        { distance: box.max.z - position.z, axis: 'z' as const, value: box.max.z + radius },
      ]
      const nearest = sides.reduce((a, b) => a.distance < b.distance ? a : b)
      position[nearest.axis] = nearest.value
    }
  }
  return position
}

export function steerAroundObstacles(
  position: THREE.Vector3,
  desiredDirection: THREE.Vector3,
  radius: number,
  obstacles: readonly CollisionObstacle[],
): THREE.Vector3 {
  const desired = desiredDirection.clone().setY(0).normalize()
  const probeDistance = radius + 0.85
  const isBlocked = (direction: THREE.Vector3): boolean => {
    const probe = position.clone().addScaledVector(direction, probeDistance)
    const resolved = resolveCircleCollisions(probe.clone(), radius, obstacles)
    return resolved.distanceToSquared(probe) > 0.0001
  }

  if (!isBlocked(desired)) return desired
  const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]
  for (const angle of angles) {
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const candidate = new THREE.Vector3(
      desired.x * cosine - desired.z * sine,
      0,
      desired.x * sine + desired.z * cosine,
    )
    if (!isBlocked(candidate)) return candidate
  }
  return desired.multiplyScalar(-1)
}

export function raycastObstacles(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maximumDistance: number,
  obstacles: readonly CollisionObstacle[],
): number | null {
  const ray = new THREE.Ray(origin, direction)
  let nearest: number | null = null
  for (const obstacle of obstacles) {
    const point = ray.intersectBox(obstacle.box, new THREE.Vector3())
    if (!point) continue
    const distance = origin.distanceTo(point)
    if (distance <= maximumDistance && (nearest === null || distance < nearest)) nearest = distance
  }
  return nearest
}
