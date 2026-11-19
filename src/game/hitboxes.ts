import * as THREE from 'three'

/**
 * Distanza lungo il raggio del primo punto in cui il raggio entra in una capsula (segmento
 * `a`–`b` con raggio `radius`), oppure null se la manca. Le capsule coprono busto e gambe
 * senza buchi fra una zona e l'altra, a differenza delle sfere.
 */
export function intersectRayCapsule(ray: THREE.Ray, a: THREE.Vector3, b: THREE.Vector3, radius: number): number | null {
  // Punti più vicini fra il raggio e il segmento (metodo dei minimi quadrati).
  const segment = b.clone().sub(a)
  const offset = ray.origin.clone().sub(a)
  const segmentLength = segment.lengthSq()
  const rayDotSegment = ray.direction.dot(segment)
  const rayDotOffset = ray.direction.dot(offset)
  const segmentDotOffset = segment.dot(offset)
  const denominator = segmentLength - rayDotSegment * rayDotSegment
  let segmentT = denominator > 1e-8 ? (segmentDotOffset - rayDotSegment * rayDotOffset) / denominator : 0
  segmentT = THREE.MathUtils.clamp(segmentT, 0, 1)
  const closestOnSegment = a.clone().addScaledVector(segment, segmentT)
  // Sfera centrata sul punto del segmento più vicino al raggio: se il raggio la tocca, colpisce la capsula.
  const point = ray.intersectSphere(new THREE.Sphere(closestOnSegment, radius), new THREE.Vector3())
  if (point) return ray.origin.distanceTo(point)
  return null
}

export type SoldierZone = 'head' | 'body' | 'legs'

/** Moltiplicatori di danno per zona dei giocatori TCT (la testa usa quello dell'arma). */
export const LEG_DAMAGE_MULTIPLIER = 0.85

/**
 * Zone colpibili di un soldato TCT a partire dai piedi: testa (sfera), busto e gambe
 * (capsule contigue). In accovacciata tutto si abbassa.
 */
export function getSoldierHitboxes(feet: THREE.Vector3, head: THREE.Vector3, crouched: boolean): { zone: SoldierZone; a: THREE.Vector3; b: THREE.Vector3; radius: number }[] {
  const scale = crouched ? 0.72 : 1
  const at = (height: number) => feet.clone().setY(feet.y + height * scale)
  return [
    { zone: 'head', a: head.clone(), b: head.clone(), radius: 0.28 },
    { zone: 'body', a: at(0.9), b: at(1.42), radius: 0.34 },
    { zone: 'legs', a: at(0.1), b: at(0.9), radius: 0.24 },
  ]
}
