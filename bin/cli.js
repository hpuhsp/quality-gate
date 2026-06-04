#!/usr/bin/env node
// =============================================================================
// quality-gate CLI — Shift-Left Local Quality Gate
// =============================================================================
// Usage:
//   quality-gate enable              Activate hooks for current repo
//   quality-gate disable             Deactivate hooks
//   quality-gate status              Show hook status + config
//   quality-gate pre-commit          Internal: called by hook
//   quality-gate gen-tests [file]     AI generate tests for changed code
//   quality-gate pre-commit          Internal: called by hook
//   quality-gate pre-push            Internal: called by hook
// =============================================================================
const path = require('path')

// Resolve library relative to THIS file (not cwd)
const LIB = path.join(__dirname, '..', 'lib')
const setupCmd = require(path.join(LIB, 'commands', 'setup'))
const enable = require(path.join(LIB, 'commands', 'enable'))
const disable = require(path.join(LIB, 'commands', 'disable'))
const status = require(path.join(LIB, 'commands', 'status'))
const genTests = require(path.join(LIB, 'checkers', 'gen-tests'))
const preCommit = require(path.join(LIB, 'hooks', 'pre-commit'))
const prePush = require(path.join(LIB, 'hooks', 'pre-push'))

const cmd = process.argv[2] || 'help'
const cmdArg = process.argv[3] || null

async function main() {
  switch (cmd) {
    case 'setup':       return setupCmd.run()
    case 'enable':      return enable.run()
    case 'disable':     return disable.run()
    case 'status':      return status.run()
    case 'gen-tests':   return genTests.run(cmdArg)
    case 'pre-commit':  return preCommit.run()
    case 'pre-push':    return prePush.run()
    default:
      console.log(`quality-gate v1.2.0 — Shift-Left Quality Gates

  setup       First-run wizard: API key, test preferences, team config
  enable      Activate hooks for current repo
  disable     Deactivate hooks
  status      Show hook status and active config
  gen-tests   AI-generate unit tests for changed code

  Project: zero files added. Install once, use everywhere.
      `)
  }
}

main().catch(err => {
  console.error(`quality-gate: ${err.message}`)
  process.exit(1)
})
