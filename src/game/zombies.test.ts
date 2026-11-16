import { describe, expect, it } from 'vitest'
import { FINAL_WAVE, getEliteChance, getWaveSpawnCount, getZombieStats, SPEED_SCALE_CAP, WAVE_BREAK_SECONDS } from './zombies'

describe('progressione zombie', () => {
  it('prevede 15 ondate e un intervallo reale fra esse', () => {
    expect(FINAL_WAVE).toBe(15)
    expect(WAVE_BREAK_SECONDS).toBe(8)
    expect(getWaveSpawnCount(1)).toBe(12)
    expect(getWaveSpawnCount(15)).toBe(71)
  })

  it('distingue gli archetipi per HP, velocità e danno', () => {
    const walker = getZombieStats('walker', 1)
    const runner = getZombieStats('runner', 1)
    const armored = getZombieStats('armored', 1)

    expect(runner.speed).toBeGreaterThan(walker.speed * 2)
    expect(runner.health).toBeLessThan(walker.health)
    expect(armored.health).toBeGreaterThan(walker.health * 2)
    expect(armored.damage).toBeGreaterThan(walker.damage)
  })

  it('aumenta HP e danno con le ondate', () => {
    const early = getZombieStats('walker', 1)
    const late = getZombieStats('walker', 15)

    expect(late.health).toBeGreaterThan(early.health * 2.5)
    expect(late.damage).toBeGreaterThan(early.damage)
  })

  it('limita la velocità massima per mantenere i nemici colpibili', () => {
    const capped = getZombieStats('runner', 30)
    const beyond = getZombieStats('runner', 100)

    expect(beyond.speed).toBe(capped.speed)
    expect(getZombieStats('runner', FINAL_WAVE).speed).toBeLessThanOrEqual(getZombieStats('runner', 1).speed * SPEED_SCALE_CAP)
    expect(beyond.speed).toBe(getZombieStats('runner', 1).speed * SPEED_SCALE_CAP)
  })

  it('include i tre specialisti con ruoli statistici distinti', () => {
    const crawler = getZombieStats('crawler', 6)
    const spitter = getZombieStats('spitter', 6)
    const screamer = getZombieStats('screamer', 8)

    expect(crawler.speed).toBeGreaterThan(getZombieStats('walker', 6).speed)
    expect(spitter.health).toBeGreaterThan(crawler.health)
    expect(screamer.score).toBeGreaterThan(spitter.score)
    expect(screamer.xp).toBeGreaterThan(spitter.xp)
  })

  it('rinforza il Bruto nelle apparizioni successive', () => {
    expect(getZombieStats('brute', 10).health).toBeGreaterThan(getZombieStats('brute', 5).health)
  })
})

describe('difficoltà crescente', () => {
  it('la vita cresce in modo esponenziale: a metà run serve un arsenale migliore', () => {
    const first = getZombieStats('walker', 1).health
    expect(getZombieStats('walker', 8).health).toBeGreaterThan(first * 2.5)
    expect(getZombieStats('walker', 15).health).toBeGreaterThan(first * 7)
  })

  it('introduce élite più resistenti e redditizie dalla quinta ondata', () => {
    expect(getEliteChance(4)).toBe(0)
    expect(getEliteChance(5)).toBeGreaterThan(0)
    expect(getEliteChance(30)).toBe(0.45)
    const normal = getZombieStats('runner', 9)
    const elite = getZombieStats('runner', 9, true)
    expect(elite.health).toBeCloseTo(normal.health * 1.6)
    expect(elite.score).toBe(normal.score * 2)
  })
})
