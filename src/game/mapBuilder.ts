import * as THREE from 'three'
import type { CollisionObstacle } from './collision'
import type { MapDefinition, MapDoorDefinition } from './maps'
import { createIndustrialMaterialMaps } from './textures'

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

export function buildMap(map: MapDefinition): BuiltMap {
  const group = new THREE.Group()
  const obstacles: CollisionObstacle[] = []
  const doors: BuiltDoor[] = []
  group.add(new THREE.HemisphereLight(0x8a9cff, 0x080910, 2.1))
  const keyLight = new THREE.DirectionalLight(0xc7dcff, 2.8)
  keyLight.position.set(-6, 16, 8)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.left = -24
  keyLight.shadow.camera.right = 24
  keyLight.shadow.camera.top = 24
  keyLight.shadow.camera.bottom = -24
  keyLight.shadow.camera.near = 1
  keyLight.shadow.camera.far = 55
  keyLight.shadow.bias = -0.0004
  group.add(keyLight)
  const rimLight = new THREE.PointLight(0x7040ff, 65, 45)
  rimLight.position.set(0, 8, -8)
  group.add(rimLight)

  const groundMaps = createIndustrialMaterialMaps('#252e3b', '#374554', 10)
  const coverMaps = createIndustrialMaterialMaps('#68737b', '#87949c', 2)
  const wallMaps = createIndustrialMaterialMaps('#48535f', '#65717c', 2)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(map.arenaLimit * 2 + 9, map.arenaLimit * 2 + 9),
    new THREE.MeshStandardMaterial({ color: 0x8996a8, map: groundMaps.map, normalMap: groundMaps.normalMap, normalScale: new THREE.Vector2(0.65, 0.65), roughnessMap: groundMaps.roughnessMap, roughness: 0.9, metalness: 0.3 }),
  )
  ground.receiveShadow = true
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  group.add(ground)
  const grid = new THREE.GridHelper(map.arenaLimit * 2 + 1, 34, 0x376474, 0x243345)
  grid.position.y = -0.025
  group.add(grid)

  const centerRing = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 5.86, 64),
    new THREE.MeshBasicMaterial({ color: 0x376474, side: THREE.DoubleSide }),
  )
  centerRing.rotation.x = -Math.PI / 2
  centerRing.position.y = -0.015
  group.add(centerRing)

  const boundaryMaterial = new THREE.MeshStandardMaterial({ color: 0x8295a4, map: wallMaps.map, normalMap: wallMaps.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: wallMaps.roughnessMap, emissive: 0x1b8885, emissiveIntensity: 0.18, roughness: 0.75, metalness: 0.45 })
  const boundary = map.arenaLimit + 1.3
  const horizontalWall = new THREE.BoxGeometry(boundary * 2, 2.2, 0.35)
  const verticalWall = new THREE.BoxGeometry(0.35, 2.2, boundary * 2)
  for (const side of [-1, 1]) {
    const horizontal = new THREE.Mesh(horizontalWall, boundaryMaterial)
    horizontal.position.set(0, 1, side * boundary)
    group.add(horizontal)
    const vertical = new THREE.Mesh(verticalWall, boundaryMaterial)
    vertical.position.set(side * boundary, 1, 0)
    group.add(vertical)
  }

  const materials = {
    cover: new THREE.MeshStandardMaterial({ color: 0x8a9aa4, map: coverMaps.map, normalMap: coverMaps.normalMap, normalScale: new THREE.Vector2(0.75, 0.75), roughnessMap: coverMaps.roughnessMap, metalness: 0.65, roughness: 0.65 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x7b8995, map: wallMaps.map, normalMap: wallMaps.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: wallMaps.roughnessMap, emissive: 0x142c35, emissiveIntensity: 0.12, roughness: 0.75, metalness: 0.4 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x20273a, emissive: 0x49319a, emissiveIntensity: 0.55 }),
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const transform = new THREE.Object3D()
  for (const style of ['cover', 'wall'] as const) {
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
    })
    instances.instanceMatrix.needsUpdate = true
    group.add(instances)
  }
  for (const definition of map.obstacles) {
    obstacles.push({
      id: definition.id,
      box: new THREE.Box3(
        new THREE.Vector3(definition.x - definition.width / 2, 0, definition.z - definition.depth / 2),
        new THREE.Vector3(definition.x + definition.width / 2, definition.height, definition.z + definition.depth / 2),
      ),
    })
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
    const light = new THREE.PointLight(0x6546ff, 18, 10)
    light.position.set(definition.x, definition.height * 0.75, definition.z)
    group.add(light)
  }

  for (const definition of map.doors) {
    const doorGroup = new THREE.Group()
    doorGroup.position.set(definition.x, 0, definition.z)
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width, definition.height, definition.depth),
      new THREE.MeshStandardMaterial({ color: 0x29313d, metalness: 0.8, roughness: 0.3 }),
    )
    panel.position.y = definition.height / 2
    doorGroup.add(panel)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(definition.width + 0.04, 0.08, definition.depth + 0.04),
      new THREE.MeshStandardMaterial({ color: 0xffb657, emissive: 0xff6d21, emissiveIntensity: 1.5 }),
    )
    stripe.position.y = definition.height * 0.65
    doorGroup.add(stripe)
    group.add(doorGroup)
    const obstacle = {
      id: definition.id,
      box: new THREE.Box3(
        new THREE.Vector3(definition.x - definition.width / 2, 0, definition.z - definition.depth / 2),
        new THREE.Vector3(definition.x + definition.width / 2, definition.height, definition.z + definition.depth / 2),
      ),
    }
    obstacles.push(obstacle)
    doors.push({ definition, group: doorGroup, obstacle })
  }

  const starPositions = new Float32Array(450)
  for (let index = 0; index < starPositions.length; index += 3) {
    starPositions[index] = (Math.random() - 0.5) * 100
    starPositions[index + 1] = Math.random() * 20 + 5
    starPositions[index + 2] = (Math.random() - 0.5) * 100
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  group.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x7184b0, size: 0.08 })))

  const dustPositions = new Float32Array(780)
  for (let index = 0; index < dustPositions.length; index += 3) {
    dustPositions[index] = (Math.random() - 0.5) * map.arenaLimit * 2
    dustPositions[index + 1] = 0.2 + Math.random() * 4.5
    dustPositions[index + 2] = (Math.random() - 0.5) * map.arenaLimit * 2
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const ambient = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x8fb5bd, size: 0.045, transparent: true, opacity: 0.28, depthWrite: false }))
  group.add(ambient)

  return { group, obstacles, doors, ambient }
}
