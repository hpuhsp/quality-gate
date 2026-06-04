#!/usr/bin/env node
// =============================================================================
// quality-gate CLI — Shift-Left Local Quality Gate
// =============================================================================
const path = require('path')
const pkg = require('../package.json')

// Resolve library relative to THIS file (not cwd)
const LIB = path.join(__dirname, '..', 'lib')
const setupCmd = require(path.join(LIB, 'commands', 'setup'))
const updateCmd = require(path.join(LIB, 'commands', 'update'))
const enable = require(path.join(LIB, 'commands', 'enable'))
const disable = require(path.join(LIB, 'commands', 'disable'))
const status = require(path.join(LIB, 'commands', 'status'))
const genTests = require(path.join(LIB, 'checkers', 'gen-tests'))
const preCommit = require(path.join(LIB, 'hooks', 'pre-commit'))
const prePush = require(path.join(LIB, 'hooks', 'pre-push'))

let cmd = process.argv[2] || 'help'
const cmdArg = process.argv[3] || null

// Standard flags
if (cmd === '--version' || cmd === '-v') {
  console.log(pkg.version)
  process.exit(0)
}
if (cmd === '--help' || cmd === '-h') {
  cmd = 'help'
}

async function main() {
  switch (cmd) {
    case 'setup':       return setupCmd.run()
    case 'update':      return updateCmd.run()
    case 'enable':      return enable.run()
    case 'disable':     return disable.run()
    case 'status':      return status.run()
    case 'tool':
      if (cmdArg === 'gen-tests') return genTests.run(process.argv[4] || null)
      console.log(`quality-gate tool — Optional tools (no API calls in gates)

  tool gen-tests [file]   AI-generate test code (needs ANTHROPIC_API_KEY)
      `)
      return
    case 'gen-tests':   // Backward compat, redirect to tool
      return genTests.run(cmdArg)
    case 'pre-commit':  return preCommit.run()
    case 'pre-push':    return prePush.run()
    default:
      console.log(`quality-gate v${pkg.version} — Shift-Left Quality Gates

  setup       First-run wizard
  update      Update to latest version
  enable      Activate 4-gate pre-commit hook
  disable     Deactivate hooks
  status      Show status and project detection
  tool        Optional tools (test generation, etc.)
  `)
  }
}

main().catch(err => {
  console.error(`quality-gate: ${err.message}`)
  process.exit(1)
})
