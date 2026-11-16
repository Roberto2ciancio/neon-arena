import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'chrome', headless: false })

async function measure(page, label, milliseconds = 8000) {
  const result = await page.evaluate(async (duration) => {
    const deltas = await new Promise((resolve) => {
      const values = []
      let previous = 0
      const start = performance.now()
      const frame = (now) => {
        if (previous > 0) values.push(now - previous)
        previous = now
        if (now - start >= duration) resolve(values)
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    const sorted = [...deltas].sort((a, b) => a - b)
    const slowestCount = Math.max(1, Math.ceil(deltas.length * 0.01))
    const slowest = sorted.slice(-slowestCount)
    const total = deltas.reduce((sum, value) => sum + value, 0)
    return {
      frames: deltas.length,
      averageFps: Math.round((deltas.length * 1000 / total) * 10) / 10,
      onePercentLow: Math.round((slowest.length * 1000 / slowest.reduce((sum, value) => sum + value, 0)) * 10) / 10,
      framesOver50ms: deltas.filter((value) => value > 50).length,
      maxFrameMs: Math.round(Math.max(...deltas)),
    }
  }, milliseconds)
  const performanceText = await page.locator('#performance-stats').textContent()
  console.log(JSON.stringify({ label, ...result, performanceText }))
}

for (const quality of ['high']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript((value) => localStorage.setItem('neon-arena:graphics:v1', value), quality)
  await page.goto('https://roberto2ciancio.github.io/neon-arena/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-state') === 'playing')
  await page.waitForTimeout(1500)
  await measure(page, `pubblico-wave1-${quality}`)
  await page.close()
}

for (const quality of ['high']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript((value) => localStorage.setItem('neon-arena:graphics:v1', value), quality)
  await page.goto('http://127.0.0.1:5175', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-map="district-zero"]').click()
  await page.getByRole('button', { name: 'INIZIA RUN' }).click()
  await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-state') === 'playing')
  await page.evaluate(() => {
    const game = window.__neonArena.game
    game.clearEntities()
    game.activePowerUps.set('barrier', 999)
    game.wave = 9
    game.nextWave()
    game.debugPlace(0, 0, 12, 0, 0)
  })
  const caps = { low: 18, medium: 24, high: 30 }
  await page.waitForFunction((cap) => window.__neonArena.game.enemies.length >= cap, caps[quality], { timeout: 45000 })
  await measure(page, `locale-wave10-${quality}`, 10000)
  console.log(JSON.stringify({ label: `dettaglio-${quality}`, state: await page.evaluate(() => ({ wave: window.__neonArena.game.wave, enemies: window.__neonArena.game.enemies.length, queued: window.__neonArena.game.spawnQueue, quality: window.__neonArena.game.graphicsQuality, notice: document.querySelector('#quality-notice')?.textContent })) }))
  await page.close()
}

await browser.close()
