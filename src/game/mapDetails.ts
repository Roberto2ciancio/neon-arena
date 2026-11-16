import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { MapDefinition } from './maps'

interface InstanceTransform {
  position: [number, number, number]
  scale: [number, number, number]
  rotation?: [number, number, number]
}

function addInstances(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: InstanceTransform[]): void {
  if (transforms.length === 0) return
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length)
  const transform = new THREE.Object3D()
  transforms.forEach((entry, index) => {
    transform.position.set(...entry.position)
    transform.scale.set(...entry.scale)
    transform.rotation.set(...(entry.rotation ?? [0, 0, 0]))
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
}

function addStructuralFrames(group: THREE.Group, map: MapDefinition): void {
  const metal = new THREE.MeshStandardMaterial({ color: 0x252d32, metalness: 0.85, roughness: 0.34 })
  const box = new THREE.BoxGeometry(1, 1, 1)
  const covers: InstanceTransform[] = []
  const caps: InstanceTransform[] = []
  for (const obstacle of map.obstacles) {
    if (obstacle.style === 'cover') {
      for (const xSide of [-1, 1]) {
        for (const zSide of [-1, 1]) {
          covers.push({
            position: [obstacle.x + xSide * (obstacle.width / 2 - 0.05), obstacle.height / 2, obstacle.z + zSide * (obstacle.depth / 2 - 0.05)],
            scale: [0.09, obstacle.height + 0.08, 0.09],
          })
        }
      }
      for (const y of [0.08, obstacle.height - 0.08]) {
        for (const side of [-1, 1]) {
          covers.push({ position: [obstacle.x, y, obstacle.z + side * obstacle.depth / 2], scale: [obstacle.width, 0.08, 0.08] })
          covers.push({ position: [obstacle.x + side * obstacle.width / 2, y, obstacle.z], scale: [0.08, 0.08, obstacle.depth] })
        }
      }
    }
    if (obstacle.style === 'wall') caps.push({ position: [obstacle.x, obstacle.height + 0.035, obstacle.z], scale: [obstacle.width + 0.1, 0.07, obstacle.depth + 0.1] })
  }
  addInstances(group, box, metal, covers)
  addInstances(group, box, metal, caps)
}

function addStation(group: THREE.Group, map: MapDefinition): void {
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x71777a, metalness: 0.95, roughness: 0.24 })
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x292421, roughness: 0.92 })
  const rails: InstanceTransform[] = []
  const sleepers: InstanceTransform[] = []
  for (const track of [-3.3, 3.3]) {
    for (const side of [-0.55, 0.55]) rails.push({ position: [track + side, 0.015, 0], scale: [0.075, 0.09, map.arenaLimit * 2] })
    for (let z = -map.arenaLimit; z <= map.arenaLimit; z += 1.15) sleepers.push({ position: [track, -0.015, z], scale: [1.75, 0.06, 0.22] })
  }
  addInstances(group, new THREE.BoxGeometry(1, 1, 1), railMaterial, rails)
  addInstances(group, new THREE.BoxGeometry(1, 1, 1), sleeperMaterial, sleepers)
}

function addDepot(group: THREE.Group, map: MapDefinition): void {
  const paint = new THREE.MeshStandardMaterial({ color: 0xd5a94d, roughness: 0.8, emissive: 0x3a2708, emissiveIntensity: 0.15 })
  const lines: InstanceTransform[] = []
  for (const x of [-5.8, 5.8]) {
    for (let z = -map.arenaLimit + 1; z < map.arenaLimit - 1; z += 2.4) lines.push({ position: [x, -0.02, z], scale: [0.12, 0.025, 1.25] })
  }
  addInstances(group, new THREE.BoxGeometry(1, 1, 1), paint, lines)
  const pipes: InstanceTransform[] = []
  for (const y of [2.4, 2.7]) pipes.push({ position: [0, y, -map.arenaLimit - 0.95], scale: [1, map.arenaLimit * 1.6, 1], rotation: [0, 0, Math.PI / 2] })
  addInstances(group, new THREE.CylinderGeometry(0.09, 0.09, 1, 12), new THREE.MeshStandardMaterial({ color: 0x4b5559, metalness: 0.82, roughness: 0.38 }), pipes)
}

function addDistrict(group: THREE.Group, map: MapDefinition): void {
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x171b1e, roughness: 0.98 })
  for (const vertical of [true, false]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(map.arenaLimit * 2, 9), asphalt)
    road.rotation.x = -Math.PI / 2
    road.rotation.z = vertical ? 0 : Math.PI / 2
    road.position.y = -0.045
    road.receiveShadow = true
    group.add(road)
  }
  const concrete = new THREE.MeshStandardMaterial({ color: 0x555b5c, roughness: 0.93 })
  const sidewalks: InstanceTransform[] = []
  for (const side of [-1, 1]) {
    sidewalks.push({ position: [side * 5.1, 0, 0], scale: [1.1, 0.1, map.arenaLimit * 2] })
    sidewalks.push({ position: [0, 0, side * 5.1], scale: [map.arenaLimit * 2, 0.1, 1.1] })
  }
  addInstances(group, new THREE.BoxGeometry(1, 1, 1), concrete, sidewalks)

  const poles: InstanceTransform[] = []
  const lamps: InstanceTransform[] = []
  const lampSpots: [number, number][] = [[-6, -8], [6, -8], [-6, 8], [6, 8]]
  for (const distance of [16, 26, 36]) lampSpots.push([-5.6, -distance], [5.6, distance], [-distance, 5.6], [distance, -5.6])
  lampSpots.forEach(([x, z], index) => {
    poles.push({ position: [x, 2.1, z], scale: [1, 4.2, 1] })
    lamps.push({ position: [x, 4.25, z], scale: [0.5, 0.16, 0.5] })
    if (index >= 4) return
    const light = new THREE.PointLight(0xffd5a0, 26, 14)
    light.position.set(x, 4.1, z)
    group.add(light)
  })
  // Strisce pedonali all'incrocio.
  const stripes: InstanceTransform[] = []
  for (const side of [-1, 1]) {
    for (let offset = -3.5; offset <= 3.5; offset += 1) {
      stripes.push({ position: [offset, -0.035, side * 6.2], scale: [0.5, 0.02, 1.6] })
      stripes.push({ position: [side * 6.2, -0.035, offset], scale: [1.6, 0.02, 0.5] })
    }
  }
  addInstances(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd9d9d0, roughness: 0.8 }), stripes)
  addInstances(group, new THREE.CylinderGeometry(0.07, 0.1, 1, 10), new THREE.MeshStandardMaterial({ color: 0x242b2d, metalness: 0.8, roughness: 0.42 }), poles)
  addInstances(group, new RoundedBoxGeometry(1, 1, 1, 2, 0.08), new THREE.MeshStandardMaterial({ color: 0xffd9a8, emissive: 0xffb85d, emissiveIntensity: 2 }), lamps)
}

function addSign(group: THREE.Group, map: MapDefinition): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#111820'
  context.fillRect(0, 0, 1024, 256)
  context.strokeStyle = '#58f5e5'
  context.lineWidth = 8
  context.strokeRect(12, 12, 1000, 232)
  context.fillStyle = '#dce9e8'
  context.font = 'bold 92px sans-serif'
  context.textAlign = 'center'
  context.fillText(map.name.toUpperCase(), 512, 125)
  context.fillStyle = '#58f5e5'
  context.font = '32px sans-serif'
  context.fillText('AUTHORIZED PERSONNEL // SECTOR ACTIVE', 512, 190)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const z = -map.arenaLimit - 0.95
  const backing = new THREE.Mesh(new RoundedBoxGeometry(6.4, 1.65, 0.15, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a2228, metalness: 0.75, roughness: 0.35 }))
  backing.position.set(0, 2.8, z)
  group.add(backing)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 1.45), new THREE.MeshBasicMaterial({ map: texture }))
  sign.position.set(0, 2.8, z + 0.081)
  group.add(sign)
}

export function addMapDetails(group: THREE.Group, map: MapDefinition): void {
  addStructuralFrames(group, map)
  addSign(group, map)
  if (map.id === 'station-13') addStation(group, map)
  else if (map.id === 'depot-06') addDepot(group, map)
  else if (map.id === 'district-zero') addDistrict(group, map)
}
