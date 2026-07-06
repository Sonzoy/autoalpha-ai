// One-shot state repair — run ONLY while the server is stopped:
//   node scripts/fix-state.mjs
// 1) Clears the stale risk auto-pause (phantom "-99.79% daily loss" from the
//    paper→live baseline mismatch; the engine now also self-heals this).
// 2) Sets max allocation to 10% so a $208 account sizes ~$20 orders — clear of
//    the $10 min trade floor and Binance's ~$5 minNotional, no new capital.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const file = join(root, 'server-data', 'storage.json')
copyFileSync(file, file + '.bak')

const store = JSON.parse(readFileSync(file, 'utf8'))
let touched = 0
for (const key of Object.keys(store)) {
  if (!key.startsWith('autoalpha-ws:')) continue
  const ws = JSON.parse(store[key])
  const st = ws.state ?? ws
  if (st.autoPaused) { st.autoPaused = false; st.pauseReason = ''; touched++ }
  if ((st.settings?.maxAllocationPct ?? 0) < 10) { st.settings.maxAllocationPct = 10; touched++ }
  store[key] = JSON.stringify(ws)
}
writeFileSync(file, JSON.stringify(store))
console.log(touched ? `Repaired (${touched} change(s)). Backup: storage.json.bak` : 'Nothing to repair.')
