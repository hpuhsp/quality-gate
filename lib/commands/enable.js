// =============================================================================
// enable.js — Activate quality-gate hooks for the current repo
// =============================================================================
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
const { CONFIG_HOME } = require('../config')

const HOOKS_DIR = path.join(CONFIG_HOME, 'hooks')
const NODE_PATH = process.execPath
const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'cli.js')

async function run() {
  // Ensure we're in a git repo
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
  } catch (_) {
    console.log('❌ Not in a git repository. Run this command inside a git repo.')
    process.exit(1)
  }

  // Create hooks directory
  fs.mkdirSync(HOOKS_DIR, { recursive: true })

  // Write hook scripts that call the CLI
  const hooks = {
    'pre-commit': `#!/bin/sh
# quality-gate pre-commit hook
# Installed by: quality-gate enable
${NODE_PATH} ${CLI_PATH} pre-commit
`,
    'pre-push': `#!/bin/sh
# quality-gate pre-push hook
# Installed by: quality-gate enable
${NODE_PATH} ${CLI_PATH} pre-push
`
  }

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = path.join(HOOKS_DIR, name)
    fs.writeFileSync(hookPath, content, { mode: 0o755 })
  }

  // Set git config to use shared hooks path
  execSync(`git config core.hooksPath ${HOOKS_DIR}`, { stdio: 'ignore' })

  // Also create config directory
  fs.mkdirSync(CONFIG_HOME, { recursive: true })

  // Write a default config if none exists
  const configPath = path.join(CONFIG_HOME, 'config.yml')
  if (!fs.existsSync(configPath)) {
    const defaultConfig = `# quality-gate configuration
# Override any setting by editing this file.
minCoverage: 60
blockOnSecrets: true
autoFormat: true
`
    fs.writeFileSync(configPath, defaultConfig)
  }

  console.log(`✅ quality-gate enabled`)
  console.log(`   Hooks: ${HOOKS_DIR}`)
  console.log(`   Config: ${CONFIG_HOME}/config.yml`)
  console.log(`   Remote config: ${process.env.QG_REMOTE_REPO || 'not set (use QG_REMOTE_REPO env var)'}`)
  console.log('')
  console.log('   Active hooks: pre-commit (secret scan + format), pre-push (test + coverage)')
}

module.exports = { run }
