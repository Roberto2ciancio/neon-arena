import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { CollisionObstacle } from './collision'
import type { MapDefinition, MapDoorDefinition } from './maps'
import { createDoorSolid, createStaticSolids, getMapStructures } from './mapGeometry'
import { createIndustrialMaterialMaps } from './textures'
import { addMapDetails } from './mapDetails'
import { addStructureMeshes, createSky, createSkyline } from './structureRendering'

export interface BuiltDoor {
  definition: MapDoorDefinition
  group: THREE.Group
  obstacle: CollisionObstacle
}

export interface BuiltMap {
  group: THREE.Group
  obstacles: CollisionObstacle[]
  doors: BuiltDoor[]
  ambient: THREE.Points
}

const CONTAINER_COLORS = [0x8c2f2a, 0x2d5f7a, 0x3f6e3a, 0xa3742a, 0x5a3d7a]

function createContainerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#d8d8d8'
    context.fillRect(0, 0, 256, 128)
    for (let x = 0; x < 256; x += 12) {
      context.fillStyle = 'rgba(0,0,0,0.22)'
      context.fillRect(x, 0, 4, 128)
      context.fillStyle = 'rgba(255,255,255,0.18)'
      context.fillRect(x + 6, 0, 2, 128)
    }
    context.fillStyle = 'rgba(0,0,0,0.25)'
    context.fillRect(0, 0, 256, 6)
    context.fillRect(0, 122, 256, 6)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function buildMap(map: MapDefinition): BuiltMap {
  const group = new THREE.Group()
  const obstacles = createStaticSolids(map)
  const doors: BuiltDoor[] = []
  const extent = map.arenaLimit + 6

  group.add(createSky())
  group.add(new THREE.HemisphereLight(0x9fb3d9, 0x161410, 2.1))
  const keyLight = new THREE.DirectionalLight(0xffe2c0, 3.2)
  keyLight.position.set(-extent * 0.45, extent * 0.9, extent * 0.55)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.left = -extent
  keyLight.shadow.camera.right = extent
  keyLight.shadow.camera.top = extent
  keyLight.shadow.camera.bottom = -extent
  keyLight.shadow.camera.near = 1
  keyLight.shadow.camera.far = extent * 3.2
  keyLight.shadow.bias = -0.0005
  keyLight.shadow.normalBias = 0.02
  group.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x6c7dff, 0.9)
  rimLight.position.set(extent * 0.6, extent * 0.4, -extent)
  group.add(rimLight)
  group.add(createSkyline(map))

  const groundMaps = createIndustrialMaterialMaps('#252e3b', '#374554', map.arenaLimit / 1.6)
  const coverMaps = createIndustrialMaterialMaps('#68737b', '#87949c', 2)
  const wallMaps = createIndustrialMaterialMaps('#48535f', '#65717c', 2)
  const groundSize = map.arenaLimit * 2 + 9
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x8996a8, map: groundMaps.map, normalMap: groundMaps.normalMap, normalScale: new THREE.Vector2(0.65, 0.65), roughnessMap: groundMaps.roughnessMap, roughness: 0.85, metalness: 0.35 }),
  )
  ground.receiveShadow = true
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  group.add(ground)
  // Pozzanghere riflettenti per spezzare l'uniformità del terreno.
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.32, depthWrite: false })
  const puddleGeometries: THREE.BufferGeometry[] = []
  for (let index = 0; index < Math.round(map.arenaLimit / 2.5); index += 1) {
    const angle = index * 2.399
    const radius = map.arenaLimit * (0.25 + ((index * 37) % 70) / 100)
    const geometry = new THREE.CircleGeometry(0.8 + (index % 4) * 0.45, 20)
    geometry.scale(1.6, 1, 1)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(Math.cos(angle) * radius, -0.045, Math.sin(angle) * radius)
    puddleGeometries.push(geometry)
  }
  const puddles = mergeGeometries(puddleGeometries, false)
  for (const geometry of puddleGeometries) geometry.dispose()
  if (puddles) {
    const mesh = new THREE.Mesh(puddles, puddleMaterial)
    mesh.receiveShadow = true
    group.add(mesh)
  }
  const grid = new THREE.GridHelper(map.arenaLimit * 2 + 1, Math.round(map.arenaLimit * 1.4), 0x376474, 0x243345)
  grid.position.y = -0.025
  grid.material.transparent = true
  grid.material.opacity = 0.12
  group.add(grid)

  const boundaryMaterial = new THREE.MeshStandardMaterial({ color: 0x8295a4, map: wallMaps.map, normalMap: wallMaps.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: wallMaps.roughnessMap, roughness: 0.75, metalness: 0.45 })
  const boundaryGlow = new THREE.MeshStandardMaterial({ color: 0x58f5e5, emissive: 0x24c9b7, emissiveIntensity: 1.4 })
  const boundary = map.arenaLimit + 1.3
  for (const side of [-1, 1]) {
    for (const vertical of [false, true]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.35 : boundary * 2, 3.4, vertical ? boundary * 2 : 0.35), boundaryMaterial)
      wall.position.set(vertical ? side * boundary : 0, 1.6, vertical ? 0 : side * boundary)
      wall.receiveShadow = true
      group.add(wall)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.4 : boundary * 2, 0.08, vertical ? boundary * 2 : 0.4), boundaryGlow)
      strip.position.set(vertical ? side * boundary : 0, 3.3, vertical ? 0 : side * boundary)
      group.add(strip)
    }
  }

  const materials = {
    cover: new THREE.MeshStandardMaterial({ color: 0x8a9aa4, map: coverMaps.map, normalMap: coverMaps.normalMap, normalScale: new THREE.Vector2(0.75, 0.75), roughnessMap: coverMaps.roughnessMap, metalness: 0.65, roughness: 0.65 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x7b8995, map: wallMaps.map, normalMap: wallMaps.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: wallMaps.roughnessMap, emissive: 0x142c35, emissiveIntensity: 0.12, roughness: 0.75, metalness: 0.4 }),
    container: new THREE.MeshStandardMaterial({ color: 0xffffff, map: createContainerTexture(), roughness: 0.62, metalness: 0.55 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x20273a, emissive: 0x49319a, emissiveIntensity: 0.55 }),
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const transform = new THREE.Object3D()
  for (const style of ['cover', 'wall', 'container'] as const) {
    const definitions = map.obstacles.filter((definition) => definition.style === style)
    if (definitions.length === 0) continue
    const instances = new THREE.InstancedMesh(boxGeometry, materials[style], definitions.length)
    instances.castShadow = true
    instances.receiveShadow = true
    definitions.forEach((definition, index) => {
      transform.position.set(definition.x, definition.height / 2, definition.z)
      transform.scale.set(definition.width, definition.height, definition.depth)
      transform.updateMatrix()
      instances.setMatrixAt(index, transform.matrix)
      if (style === 'container') instances.setColorAt(index, new THREE.Color(CONTAINER_COLORS[index % CONTAINER_COLORS.length]!))
    })
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
    group.add(instances)
  }

  // Auto e muletti: carrozzeria, abitacolo, fari.
  const carPaint = [0x7a1f2b, 0x24445e, 0xb8b2a4, 0x2c2f33]
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0e1820, metalness: 0.8, roughness: 0.1 })
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd28a, emissiveIntensity: 1.4 })
  map.obstacles.filter((definition) => definition.style === 'car').forEach((definition, index) => {
    const car = new THREE.Group()
    const alongZ = definition.depth > definition.width
    const length = alongZ ? definition.depth : definition.width
    const width = alongZ ? definition.width : definition.depth
    const paint = new THREE.MeshStandardMaterial({ color: carPaint[index % carPaint.length], metalness: 0.6, roughness: 0.35 })
    const body = new THREE.Mesh(new RoundedBoxGeometry(width, definition.height * 0.55, length, 3, 0.12), paint)
    body.position.y = definition.height * 0.38
    car.add(body)
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(width * 0.86, definition.height * 0.45, length * 0.5, 3, 0.12), glassMaterial)
    cabin.position.set(0, definition.height * 0.78, -length * 0.05)
    car.add(cabin)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), tireMaterial)
      tire.rotation.z = Math.PI / 2
      tire.position.set(sx * width * 0.48, 0.3, sz * length * 0.32)
      car.add(tire)
    }
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.05), lightMaterial)
      lamp.position.set(sx * width * 0.32, definition.height * 0.45, -length / 2 - 0.01)
      car.add(lamp)
    }
    car.position.set(definition.x, 0, definition.z)
    if (!alongZ) car.rotation.y = Math.PI / 2
    car.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    group.add(car)
  })

  for (const definition of map.obstacles) {
    if (definition.style !== 'pillar') continue
    const lod = new THREE.LOD()
    lod.position.set(definition.x, definition.height / 2, definition.z)
    const high = new THREE.Mesh(new THREE.CylinderGeometry(definition.width * 0.45, definition.width * 0.6, definition.height, 8), materials.pillar)
    const low = new THREE.Mesh(new THREE.CylinderGeometry(definition.width * 0.45, definition.width * 0.6, definition.height, 4), materials.pillar)
    high.castShadow = true
    high.receiveShadow = true
    low.castShadow = true
    lod.addLevel(high, 0)
    lod.addLevel(low, 22)
    group.add(lod)
    const light = new THREE.PointLight(0x6546ff, 22, 14)
    light.position.set(definition.x, definition.height * 0.75, definition.z)
    group.add(light)
  }

  addStructureMeshes(group, map, getMapStructures(map))

  for (const definition of map.doors) {
    const doorGroup = new THREE.Group()
    doorGroup.position.set(definition.x, 0, definition.z)
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width, definition.height, definition.depth),
      new THREE.MeshStandardMaterial({ color: 0x29313d, metalness: 0.8, roughness: 0.3 }),
    )
    panel.position.y = definition.height / 2
    panel.castShadow = true
    doorGroup.add(panel)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width + 0.04, 0.08, definition.depth + 0.04),
      new THREE.MeshStandardMaterial({ color: 0xffb657, emissive: 0xff6d21, emissiveIntensity: 1.5 }),
    )
    stripe.position.y = definition.height * 0.65
    doorGroup.add(stripe)
    const lock = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.5, definition.width + 0.06), 0.5, Math.min(0.5, definition.depth + 0.06)),
      new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xff8a2a, emissiveIntensity: 1.2 }),
    )
    lock.position.y = definition.height * 0.45
    doorGroup.add(lock)
    group.add(doorGroup)
    const obstacle = createDoorSolid(definition)
    obstacles.push(obstacle)
    doors.push({ definition, group: doorGroup, obstacle })
  }

  addMapDetails(group, map)

  const dustPositions = new Float32Array(1200)
  for (let index = 0; index < dustPositions.length; index += 3) {
    dustPositions[index] = (Math.random() - 0.5) * map.arenaLimit * 2
    dustPositions[index + 1] = 0.2 + Math.random() * 9
    dustPositions[index + 2] = (Math.random() - 0.5) * map.arenaLimit * 2
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const ambient = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x8fb5bd, size: 0.05, transparent: true, opacity: 0.3, depthWrite: false }))
  group.add(ambient)

  return { group, obstacles, doors, ambient }
}
