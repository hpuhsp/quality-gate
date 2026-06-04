// =============================================================================
// disable.js — Deactivate quality-gate hooks for the current repo
// =============================================================================
const { execSync } = require('child_process')

async function run() {
  try {
    execSync('git config --unset core.hooksPath', { stdio: 'ignore' })
    console.log('✅ quality-gate disabled for this repo')
  } catch (_) {
    // hooksPath was not set — already disabled
    console.log('ℹ️  quality-gate is not enabled for this repo')
  }
}
module.exports = { run }
