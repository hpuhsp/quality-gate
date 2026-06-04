// =============================================================================
// update.js — Self-update quality-gate to the latest version
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PKG = 'github:hpuhsp/quality-gate'
const CONFIG_HOME = path.join(os.homedir(), '.quality-gate')
const LAST_CHECK = path.join(CONFIG_HOME, '.last-update-check')

function getCurrentVersion() {
  try {
    // Find the installed quality-gate package.json
    const bin = execSync('which quality-gate', { encoding: 'utf8' }).trim()
    // bin is a symlink, resolve to actual package
    const real = require('fs').realpathSync(bin)
    const pkgDir = path.dirname(path.dirname(real)) // bin/ → package root
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    return pkg.version
  } catch (_) {}
  return 'unknown'
}

async function run() {
  const current = getCurrentVersion()
  console.log(`quality-gate v${current}`)
  console.log('Checking for updates...')

  try {
    // Check npm registry for latest version
    const latest = execSync(`npm view ${PKG} version 2>/dev/null`, {
      encoding: 'utf8', timeout: 10000
    }).trim()

    if (!latest) {
      console.log('⚠️  Could not check remote version. Already at latest?')
      return
    }

    console.log(`  Installed: v${current}`)
    console.log(`  Latest:    v${latest}`)

    if (current === latest) {
      console.log('✅ Already up to date.')
      fs.mkdirSync(CONFIG_HOME, { recursive: true })
      fs.writeFileSync(LAST_CHECK, Date.now().toString())
      return
    }

    console.log(`\nUpdating v${current} → v${latest}...`)
    execSync(`npm install -g ${PKG}`, { stdio: 'inherit', timeout: 60000 })

    const updated = getCurrentVersion()
    console.log(`\n✅ Updated to v${updated}`)

    // Show what's new
    try {
      const changelog = execSync('npm view github:hpuhsp/quality-gate readme 2>/dev/null', {
        encoding: 'utf8', timeout: 5000
      }).trim()
      // Extract v1.3.0 changelog entry
      const match = changelog.match(/v[\d.]+\s+[-–].+?(?=v[\d.]|$)/)
      if (match) console.log(`\nLatest: ${match[0].slice(0, 120)}`)
    } catch (_) {}

    fs.mkdirSync(CONFIG_HOME, { recursive: true })
    fs.writeFileSync(LAST_CHECK, Date.now().toString())

  } catch (e) {
    console.log(`❌ Update failed: ${e.message}`)
    console.log('   Try: npm install -g github:hpuhsp/quality-gate')
  }
}

module.exports = { run, getCurrentVersion }
