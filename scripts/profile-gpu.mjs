import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'chrome', headless: false })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => localStorage.setItem('neon-arena:graphics:v1', 'high'))
await page.goto('http://127.0.0.1:5175', { waitUntil: 'domcontentloaded' })
await page.locator('[data-map="district-zero"]').click()
const session = await page.context().newCDPSession(page)
await session.send('Performance.enable')
await session.send('Tracing.start', {
  transferMode: 'ReturnAsStream',
  traceConfig: {
    includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-v8.gc', 'gpu'],
  },
})

async function mark(name) {
  await page.evaluate((value) => performance.mark(value), name)
  console.log(name, await page.locator('#performance-stats').textContent())
}

await mark('start-run')
await page.getByRole('button', { name: 'INIZIA RUN' }).click()
await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-state') === 'playing')
await page.waitForTimeout(3000)

await mark('wave-10-start')
await page.evaluate(() => {
  const game = window.__neonArena.game
  game.clearEntities()
  game.activePowerUps.set('barrier', 999)
  game.wave = 9
  game.nextWave()
  game.debugPlace(0, 0, 12, 0, 0)
})
await page.waitForTimeout(5000)

await mark('bloater-death')
await page.evaluate(() => {
  const game = window.__neonArena.game
  game.spawnEnemy('bloater')
  const enemy = game.enemies.at(-1)
  enemy.spawnTimer = 0
  enemy.health = 0
  game.killDestroyedEnemies()
})
await page.waitForTimeout(2000)

await mark('grenade')
await page.evaluate(() => window.__neonArena.game.useEquipment('lethal'))
await page.waitForTimeout(2500)

await mark('brute-spawn')
await page.evaluate(() => window.__neonArena.game.spawnEnemy('brute'))
await page.waitForTimeout(2000)

await mark('building-enter')
await page.evaluate(() => {
  const game = window.__neonArena.game
  const building = game.map.buildings[0]
  game.debugPlace(building.x, 0, building.z, 0, 0)
})
await page.waitForTimeout(2000)

await mark('trace-end')
await session.send('Tracing.end')
const completion = await new Promise((resolve) => session.on('Tracing.tracingComplete', resolve))
let traceText = ''
while (true) {
  const chunk = await session.send('IO.read', { handle: completion.stream })
  traceText += chunk.data
  if (chunk.eof) break
}
await session.send('IO.close', { handle: completion.stream })
writeFileSync('trace-gpu.json', traceText)
const metrics = await session.send('Performance.getMetrics')
console.log('metrics', JSON.stringify(metrics.metrics.filter((entry) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'LayoutCount', 'RecalcStyleCount'].includes(entry.name))))
await browser.close()

const trace = JSON.parse(traceText)
const events = Array.isArray(trace) ? trace : trace.traceEvents
const complete = events.filter((event) => event.ph === 'X' && Number.isFinite(event.dur))
const markers = events.filter((event) => ['start-run', 'wave-10-start', 'bloater-death', 'grenade', 'brute-spawn', 'building-enter', 'trace-end'].includes(event.name)).sort((a, b) => a.ts - b.ts)
const scenario = (ts) => markers.filter((marker) => marker.ts <= ts).at(-1)?.name ?? 'startup'
const describe = (event) => ({ name: event.name, scenario: scenario(event.ts), ms: Math.round(event.dur / 100) / 10 })
const longest = [...complete].sort((a, b) => b.dur - a.dur).slice(0, 20).map(describe)
const gc = complete.filter((event) => event.name === 'MinorGC' || event.name === 'MajorGC')
const gpu = complete.filter((event) => /GetProgramiv|WaitForCmd|WebGL/.test(event.name))
console.log('longest', JSON.stringify(longest))
console.log('gc', JSON.stringify({ count: gc.length, totalMs: Math.round(gc.reduce((sum, event) => sum + event.dur, 0) / 100) / 10, longest: gc.sort((a, b) => b.dur - a.dur).slice(0, 10).map(describe) }))
console.log('gpu', JSON.stringify({ totalMs: Math.round(gpu.reduce((sum, event) => sum + event.dur, 0) / 100) / 10, longest: gpu.sort((a, b) => b.dur - a.dur).slice(0, 10).map(describe) }))
