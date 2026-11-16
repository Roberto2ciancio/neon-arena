import * as THREE from 'three'

const PBR_MATERIAL = 'pbrMaterial'
const LAMBERT_MATERIAL = 'lambertMaterial'

function createLambertMaterial(source: THREE.MeshStandardMaterial): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: source.color,
    map: source.map,
    emissive: source.emissive,
    emissiveMap: source.emissiveMap,
    emissiveIntensity: source.emissiveIntensity,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
    alphaTest: source.alphaTest,
    fog: source.fog,
  })
}

export function setLambertMaterials(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    if (enabled) {
      if (!(object.material instanceof THREE.MeshStandardMaterial)) return
      object.userData[PBR_MATERIAL] = object.material
      const lambert = object.userData[LAMBERT_MATERIAL] instanceof THREE.MeshLambertMaterial
        ? object.userData[LAMBERT_MATERIAL] as THREE.MeshLambertMaterial
        : createLambertMaterial(object.material)
      object.userData[LAMBERT_MATERIAL] = lambert
      object.material = lambert
    } else if (object.userData[PBR_MATERIAL] instanceof THREE.Material) {
      object.material = object.userData[PBR_MATERIAL]
    }
  })
}

export function disposeMaterialVariants(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = new Set<THREE.Material>()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    for (const key of [PBR_MATERIAL, LAMBERT_MATERIAL]) {
      const material = object.userData[key]
      if (material instanceof THREE.Material) materials.add(material)
    }
    for (const material of materials) material.dispose()
  })
}
