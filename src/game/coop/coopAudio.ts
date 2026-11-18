import { getGunSoundProfile } from '../gunSounds'
import type { GunSoundProfile } from '../gunSounds'

/** Suono degli spari dei compagni: un fucile generico, attenuato dalla distanza. */
export function gunshotProfileForRemote(): GunSoundProfile {
  return getGunSoundProfile('assault', 'auto', false)
}
