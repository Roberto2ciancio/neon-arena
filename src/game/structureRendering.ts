import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MapDefinition } from './maps'
import type { ExpandedStructures, StructureBox, StructureStyle } from './structures'
import { FLOOR_HEIGHT, getBuildingHeight, getDoorPoints } from './structures'

type BoxLike = { min: readonly [number, number, number]; max: readonly [number, number, number] }

/** Box con UV in metri (una ripetizione ogni `tile` metri) per texture senza stiramenti. */
function createWorldBox(box: BoxLike, tile: number): THREE.BufferGeometry {
  const width = box.max[0] - box.min[0]
  const height = box.max[1] - box.min[1]
  const depth = box.max[2] - box.min[2]
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  // Ordine delle facce di BoxGeometry: +x, -x, +y, -y, +z, -z (4 vertici ciascuna).
  const faceSizes: [number, number][] = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]]
  for (let face = 0; face < 6; face += 1) {
    const [u, v] = faceSizes[face]!
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = face * 4 + vertex
      uv.setXY(index, uv.getX(index) * u / tile, uv.getY(index) * v / tile)
    }
  }
  geometry.translate((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2)
  return geometry
}

function mergedMesh(boxes: readonly BoxLike[], material: THREE.Material, tile: number, shadows = true): THREE.Mesh | null {
  if (boxes.length === 0) return null
  const geometries = boxes.map((box) => createWorldBox(box, tile))
  const merged = mergeGeometries(geometries, false)
  for (const geometry of geometries) geometry.dispose()
  if (!merged) return null
  const mesh = new THREE.Mesh(merged, material)
  mesh.castShadow = shadows
  mesh.receiveShadow = true
  return mesh
}

// ---------------------------------------------------------------------------
// Texture procedurali delle facciate
// ---------------------------------------------------------------------------

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function canvasTexture(draw: (context: CanvasRenderingContext2D, size: number) => void, color = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) draw(context, 256)
  const texture = new THREE.CanvasTexture(canvas)
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

function grime(context: CanvasRenderingContext2D, size: number, random: () => number, alpha: number): void {
  for (let index = 0; index < 900; index += 1) {
    context.fillStyle = `rgba(0,0,0,${random() * alpha})`
    context.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 3)
  }
  const gradient = context.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${alpha * 1.5})`)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
}

const facadeCache = new Map<StructureStyle | 'floor' | 'stair', THREE.MeshStandardMaterial>()

export function getStructureMaterial(style: StructureStyle | 'floor' | 'stair'): THREE.MeshStandardMaterial {
  const cached = facadeCache.get(style)
  if (cached) return cached
  const random = seeded(style.length * 977 + 13)
  let material: THREE.MeshStandardMaterial
  if (style === 'brick') {
    const map = canvasTexture((context, size) => {
      context.fillStyle = '#3d2622'
      context.fillRect(0, 0, size, size)
      const rows = 8
      const rowHeight = size / rows
      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 === 0 ? 0 : size / 8
        for (let column = -1; column < 4; column += 1) {
          const shade = 70 + Math.floor(random() * 40)
          context.fillStyle = `rgb(${shade + 40}, ${Math.floor(shade * 0.55)}, ${Math.floor(shade * 0.45)})`
          context.fillRect(column * (size / 4) + offset + 3, row * rowHeight + 3, size / 4 - 6, rowHeight - 6)
        }
      }
      grime(context, size, random, 0.18)
    })
    material = new THREE.MeshStandardMaterial({ color: 0xc9b7b0, map, roughness: 0.92, metalness: 0.02 })
  } else if (style === 'industrial') {
    const map = canvasTexture((context, size) => {
      context.fillStyle = '#4b5a63'
      context.fillRect(0, 0, size, size)
      for (let x = 0; x < size; x += 16) {
        const gradient = context.createLinearGradient(x, 0, x + 16, 0)
        gradient.addColorStop(0, 'rgba(255,255,255,0.10)')
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.18)')
        gradient.addColorStop(1, 'rgba(255,255,255,0.10)')
        context.fillStyle = gradient
        context.fillRect(x, 0, 16, size)
      }
      for (let index = 0; index < 14; index += 1) {
        context.fillStyle = `rgba(120, 62, 30, ${0.08 + random() * 0.12})`
        context.fillRect(random() * size, random() * size * 0.3 + size * 0.6, 4 + random() * 10, size * 0.4)
      }
      grime(context, size, random, 0.14)
    })
    material = new THREE.MeshStandardMaterial({ color: 0xb4c2c9, map, roughness: 0.6, metalness: 0.55 })
  } else if (style === 'glass') {
    const map = canvasTexture((context, size) => {
      context.fillStyle = '#16303c'
      context.fillRect(0, 0, size, size)
      const gradient = context.createLinearGradient(0, 0, size, size)
      gradient.addColorStop(0, 'rgba(120,220,255,0.18)')
      gradient.addColorStop(0.5, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(120,220,255,0.12)')
      context.fillStyle = gradient
      context.fillRect(0, 0, size, size)
      context.fillStyle = '#20272c'
      for (let x = 0; x <= size; x += size / 2) context.fillRect(x - 5, 0, 10, size)
      for (let y = 0; y <= size; y += size / 2) context.fillRect(0, y - 4, size, 8)
    })
    material = new THREE.MeshStandardMaterial({ color: 0xcfe7ef, map, roughness: 0.15, metalness: 0.75, emissive: 0x0c2632, emissiveIntensity: 0.35 })
  } else if (style === 'floor') {
    const map = canvasTexture((context, size) => {
      context.fillStyle = '#3a3f44'
      context.fillRect(0, 0, size, size)
      context.strokeStyle = 'rgba(0,0,0,0.35)'
      context.lineWidth = 3
      context.strokeRect(0, 0, size, size)
      grime(context, size, random, 0.15)
    })
    material = new THREE.MeshStandardMaterial({ color: 0xa8b0b6, map, roughness: 0.85, metalness: 0.1 })
  } else if (style === 'stair') {
    material = new THREE.MeshStandardMaterial({ color: 0x59636a, roughness: 0.55, metalness: 0.7 })
  } else {
    const map = canvasTexture((context, size) => {
      context.fillStyle = '#5d6469'
      context.fillRect(0, 0, size, size)
      context.strokeStyle = 'rgba(20,24,28,0.6)'
      context.lineWidth = 3
      context.strokeRect(1, 1, size - 2, size - 2)
      context.fillStyle = 'rgba(20,24,28,0.5)'
      for (const x of [size * 0.25, size * 0.75]) for (const y of [size * 0.25, size * 0.75]) {
        context.beginPath()
        context.arc(x, y, 4, 0, Math.PI * 2)
        context.fill()
      }
      grime(context, size, random, 0.2)
    })
    material = new THREE.MeshStandardMaterial({ color: 0xb9c1c6, map, roughness: 0.9, metalness: 0.05 })
  }
  facadeCache.set(style, material)
  return material
}

// ---------------------------------------------------------------------------
// Edifici
// ---------------------------------------------------------------------------

function createSignTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 192
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(6, 9, 16, 0.92)'
    context.fillRect(0, 0, 1024, 192)
    context.shadowColor = color
    context.shadowBlur = 28
    context.strokeStyle = color
    context.lineWidth = 7
    context.strokeRect(14, 14, 996, 164)
    context.fillStyle = '#f2fbfb'
    context.font = 'bold 104px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 512, 100)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const SIGN_COLORS = ['#58f5e5', '#ff4f87', '#ffb657', '#9a7bff']

/** Mesh di edifici e torri: muri, solai, scale, ringhiere, cornici, luci e insegne. */
export function addStructureMeshes(group: THREE.Group, map: MapDefinition, structures: ExpandedStructures): void {
  const byMaterial = new Map<THREE.Material, { boxes: StructureBox[]; tile: number; shadows: boolean }>()
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c353b, metalness: 0.85, roughness: 0.32 })
  const hazard = new THREE.MeshStandardMaterial({ color: 0xd8a43c, emissive: 0x3a2508, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.55 })
  const roofUnit = new THREE.MeshStandardMaterial({ color: 0x77828a, metalness: 0.7, roughness: 0.4 })
  const add = (material: THREE.Material, box: StructureBox, tile = 2, shadows = true): void => {
    const entry = byMaterial.get(material) ?? { boxes: [], tile, shadows }
    entry.boxes.push(box)
    byMaterial.set(material, entry)
  }
  for (const box of structures.boxes) {
    switch (box.kind) {
      case 'wall':
      case 'parapet':
        add(getStructureMaterial(box.style), box, 2.4)
        break
      case 'floor':
        add(getStructureMaterial('floor'), box, 3)
        break
      case 'stair':
        add(getStructureMaterial('stair'), box, 1)
        break
      case 'railing':
        add(box.style === 'industrial' ? hazard : metal, box, 1, false)
        break
      case 'column':
        add(metal, box, 1)
        break
      case 'roof-prop':
        add(roofUnit, box, 1)
        break
    }
  }
  for (const [material, entry] of byMaterial) {
    const mesh = mergedMesh(entry.boxes, material, entry.tile, entry.shadows)
    if (mesh) group.add(mesh)
  }

  // Cornici delle finestre e davanzali.
  const frames: BoxLike[] = []
  for (const window of structures.windows) {
    const halfW = window.width / 2
    const halfH = window.height / 2
    const t = 0.06
    const depth = 0.38
    if (window.axis === 'x') {
      frames.push({ min: [window.x - halfW, window.y - halfH - t, window.z - depth / 2], max: [window.x + halfW, window.y - halfH + 0.02, window.z + depth / 2] })
      frames.push({ min: [window.x - halfW, window.y + halfH - 0.02, window.z - depth / 2], max: [window.x + halfW, window.y + halfH + t, window.z + depth / 2] })
      frames.push({ min: [window.x - halfW - t, window.y - halfH, window.z - depth / 2], max: [window.x - halfW + 0.02, window.y + halfH, window.z + depth / 2] })
      frames.push({ min: [window.x + halfW - 0.02, window.y - halfH, window.z - depth / 2], max: [window.x + halfW + t, window.y + halfH, window.z + depth / 2] })
    } else {
      frames.push({ min: [window.x - depth / 2, window.y - halfH - t, window.z - halfW], max: [window.x + depth / 2, window.y - halfH + 0.02, window.z + halfW] })
      frames.push({ min: [window.x - depth / 2, window.y + halfH - 0.02, window.z - halfW], max: [window.x + depth / 2, window.y + halfH + t, window.z + halfW] })
      frames.push({ min: [window.x - depth / 2, window.y - halfH, window.z - halfW - t], max: [window.x + depth / 2, window.y + halfH, window.z - halfW + 0.02] })
      frames.push({ min: [window.x - depth / 2, window.y - halfH, window.z + halfW - 0.02], max: [window.x + depth / 2, window.y + halfH, window.z + halfW + t] })
    }
  }
  const frameMesh = mergedMesh(frames, metal, 1, false)
  if (frameMesh) group.add(frameMesh)

  // Pannelli luminosi sul soffitto di ogni piano e una luce reale per edificio.
  const panels: BoxLike[] = []
  const lit = new Set<string>()
  for (const light of structures.lights) {
    panels.push({ min: [light.x - 1.2, light.y + 0.12, light.z - 0.12], max: [light.x + 1.2, light.y + 0.17, light.z + 0.12] })
    if (lit.has(light.buildingId)) continue
    lit.add(light.buildingId)
    const point = new THREE.PointLight(0xffe2b8, 10, 9, 1.8)
    point.position.set(light.x, light.y - 0.2, light.z)
    group.add(point)
  }
  const panelMesh = mergedMesh(panels, new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 2.2 }), 1, false)
  if (panelMesh) group.add(panelMesh)

  // Insegne al neon sopra l'ingresso principale e strisce luminose sui tetti.
  const trims: BoxLike[] = []
  map.buildings.forEach((building, index) => {
    const height = getBuildingHeight(building)
    const x0 = building.x - building.width / 2
    const x1 = building.x + building.width / 2
    const z0 = building.z - building.depth / 2
    const z1 = building.z + building.depth / 2
    if (building.kind === 'building') {
      trims.push({ min: [x0 - 0.02, height - 0.08, z1 - 0.02], max: [x1 + 0.02, height, z1 + 0.04] })
      trims.push({ min: [x0 - 0.02, height - 0.08, z0 - 0.04], max: [x1 + 0.02, height, z0 + 0.02] })
    }
    if (!building.name || building.kind !== 'building') return
    const side = building.doors[0] ?? 'south'
    const { center } = getDoorPoints(building, side)
    const color = SIGN_COLORS[index % SIGN_COLORS.length]!
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(5.5, building.width * 0.6), 1.03),
      new THREE.MeshBasicMaterial({ map: createSignTexture(building.name, color), transparent: true }),
    )
    const offset = 0.2
    const y = Math.min(FLOOR_HEIGHT - 0.25, 2.95)
    if (side === 'south') sign.position.set(center.x, y, center.z + offset)
    if (side === 'north') { sign.position.set(center.x, y, center.z - offset); sign.rotation.y = Math.PI }
    if (side === 'east') { sign.position.set(center.x + offset, y, center.z); sign.rotation.y = Math.PI / 2 }
    if (side === 'west') { sign.position.set(center.x - offset, y, center.z); sign.rotation.y = -Math.PI / 2 }
    group.add(sign)
  })
  const trimMesh = mergedMesh(trims, new THREE.MeshStandardMaterial({ color: 0x58f5e5, emissive: 0x2ad7c8, emissiveIntensity: 1.6 }), 1, false)
  if (trimMesh) group.add(trimMesh)
}

// ---------------------------------------------------------------------------
// Cielo e skyline
// ---------------------------------------------------------------------------

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x05060d) },
      horizon: { value: new THREE.Color(0x1d2240) },
      glow: { value: new THREE.Color(0x4a2c5e) },
    },
    vertexShader: 'varying vec3 vPosition; void main() { vPosition = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vPosition;
      void main() {
        float h = clamp(vPosition.y, -0.2, 1.0);
        vec3 color = mix(horizon, top, smoothstep(0.0, 0.55, h));
        color += glow * exp(-abs(h) * 9.0) * 0.6;
        gl_FragColor = vec4(color, 1.0);
      }`,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), material)
  sky.renderOrder = -1
  return sky
}

function createWindowTexture(): THREE.CanvasTexture {
  const random = seeded(4242)
  return canvasTexture((context, size) => {
    context.fillStyle = '#05070b'
    context.fillRect(0, 0, size, size)
    const cells = 8
    const cell = size / cells
    for (let x = 0; x < cells; x += 1) {
      for (let y = 0; y < cells; y += 1) {
        if (random() > 0.32) continue
        const warm = random() > 0.4
        context.fillStyle = warm ? `rgba(255, ${190 + Math.floor(random() * 50)}, 120, ${0.5 + random() * 0.5})` : `rgba(110, 220, 255, ${0.4 + random() * 0.5})`
        context.fillRect(x * cell + cell * 0.25, y * cell + cell * 0.3, cell * 0.5, cell * 0.4)
      }
    }
  })
}

/** Grattacieli lontani oltre i confini dell'arena con finestre illuminate. */
export function createSkyline(map: MapDefinition): THREE.InstancedMesh {
  const random = seeded(map.arenaLimit * 31 + map.id.length)
  const count = 70
  const windows = createWindowTexture()
  const material = new THREE.MeshStandardMaterial({ color: 0x0b0e15, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 0.55, roughness: 0.9 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count)
  const transform = new THREE.Object3D()
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + random() * 0.05
    const distance = map.arenaLimit + 55 + random() * 60
    const width = 8 + random() * 14
    const height = 12 + random() * 38
    transform.position.set(Math.cos(angle) * distance, height / 2 - 1, Math.sin(angle) * distance)
    transform.rotation.y = -angle
    transform.scale.set(width, height, 6 + random() * 8)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

export { mergedMesh }
