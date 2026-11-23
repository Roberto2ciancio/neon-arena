import * as THREE from 'three'

/**
 * Atmosfera della Fase D senza luci in più: coni di luce finti (piani additivi) sotto le
 * lampade della mappa. Un solo InstancedMesh per mappa (una draw call), nascosto sul basso.
 */
/** Oggetti d'atmosfera (coni di luce, braci): nascosti sul preset basso. */
export const LIGHT_SHAFT_TAG = 'lightShafts'
export const EMBER_HEIGHT = 14

let shaftTexture: THREE.CanvasTexture | null = null

/** Gradiente verticale: più intenso vicino alla lampada, sfuma verso terra. */
function getShaftTexture(): THREE.CanvasTexture {
  if (shaftTexture) return shaftTexture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const context = canvas.getContext('2d')!
  const vertical = context.createLinearGradient(0, 0, 0, 128)
  vertical.addColorStop(0, 'rgba(255,255,255,0.0)')
  vertical.addColorStop(0.06, 'rgba(255,255,255,0.8)')
  vertical.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  vertical.addColorStop(1, 'rgba(255,255,255,0.0)')
  context.fillStyle = vertical
  context.fillRect(0, 0, 64, 128)
  shaftTexture = new THREE.CanvasTexture(canvas)
  shaftTexture.colorSpace = THREE.SRGBColorSpace
  return shaftTexture
}

export interface ShaftSource {
  position: THREE.Vector3
  color: THREE.Color
  /** Raggio del cono a terra. */
  radius: number
}

/** Coni sotto le luci puntiformi della mappa (posizione e colore presi dalle luci stesse). */
export function getShaftSources(group: THREE.Object3D): ShaftSource[] {
  const sources: ShaftSource[] = []
  group.updateMatrixWorld(true)
  group.traverse((object) => {
    if (!(object instanceof THREE.PointLight)) return
    const position = object.getWorldPosition(new THREE.Vector3())
    if (position.y < 1.5 || position.y > 9) return
    sources.push({ position, color: object.color.clone(), radius: Math.min(2.4, Math.max(1.1, (object.distance || 10) * 0.13)) })
  })
  return sources
}

/**
 * Braci che salgono lente nell'aria sulle mappe asciutte (con pioggia o spore no). Come il
 * meteo, si muove l'intero sistema di particelle: nessun calcolo per particella.
 */
export function createEmbers(weather: string, extent: number): THREE.Points | null {
  if (weather === 'rain' || weather === 'drizzle' || weather === 'spores') return null
  const count = 140
  const positions = new Float32Array(count * 3)
  let seed = 4242
  const random = () => {
    seed = seed * 16807 % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * extent * 1.6
    positions[index * 3 + 1] = random() * EMBER_HEIGHT * 2
    positions[index * 3 + 2] = (random() - 0.5) * extent * 1.6
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const embers = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xff9a4a, size: 0.09, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }))
  embers.userData[LIGHT_SHAFT_TAG] = true
  embers.frustumCulled = false
  return embers
}

export function animateEmbers(embers: THREE.Points | null, delta: number): void {
  if (!embers || !embers.visible) return
  embers.position.y += delta * 0.55
  if (embers.position.y > 0) embers.position.y -= EMBER_HEIGHT
  embers.position.x = Math.sin(performance.now() * 0.00025) * 1.2
}

export function addLightShafts(group: THREE.Group): THREE.InstancedMesh | null {
  const sources = getShaftSources(group)
  if (sources.length === 0) return null
  // Cono aperto alto 1 e con raggio 1 alla base: scalato per ogni lampada.
  const geometry = new THREE.CylinderGeometry(0.12, 1, 1, 20, 1, true)
  geometry.translate(0, -0.5, 0)
  const material = new THREE.MeshBasicMaterial({ map: getShaftTexture(), color: 0xffffff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })
  const mesh = new THREE.InstancedMesh(geometry, material, sources.length)
  const matrix = new THREE.Matrix4()
  sources.forEach((source, index) => {
    const height = source.position.y - 0.05
    matrix.compose(source.position.clone().setY(source.position.y - 0.1), new THREE.Quaternion(), new THREE.Vector3(source.radius, height, source.radius))
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, source.color)
  })
  mesh.userData[LIGHT_SHAFT_TAG] = true
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  group.add(mesh)
  return mesh
}
