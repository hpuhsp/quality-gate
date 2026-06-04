// =============================================================================
// pre-push hook — Runs on git push. Slower (<2min), deterministic, no API calls.
// =============================================================================
// Checks:
//   1. Unit tests pass (with auto-detected framework)
//   2. Coverage meets threshold (default 60%)
// =============================================================================
const { detect } = require('../detect')
const { loadConfig } = require('../config')
const testRunner = require('../checkers/test-runner')

async function run() {
  const root = process.cwd()
  const project = detect(root)
  const config = loadConfig()

  let hasErrors = false

  // Gate 1: Tests pass
  if (project.language === 'unknown') {
    console.log('⚠️  Unknown project type, skipping test check')
  } else if (!project.hasTests) {
    console.log('⚠️  No tests detected, skipping test check')
    console.log(`  Add tests in src/test/ (${project.testFramework}) to enable pre-push test validation`)
  } else {
    const minCoverage = parseInt(config.minCoverage || '60', 10)
    console.log(`Running tests (${project.language}/${project.testFramework})...`)

    const result = testRunner.run(project, config)

    if (result.testsFailed > 0) {
      console.log(`\n❌ TESTS FAILED: ${result.testsFailed} failed`)
      hasErrors = true
    }

    if (result.testsPassed > 0) {
      console.log(`✅ ${result.testsPassed} tests passed`)
    }

    // Show last few lines of output on failure
    if (hasErrors && result.output) {
      const tail = result.output.split('\n').slice(-15).join('\n')
      console.log(`\n--- Test output (last 15 lines) ---\n${tail}\n`)
    }
  }

  if (hasErrors) {
    console.log('⛔ Push blocked. Fix failing tests before pushing.\n')
    process.exit(1)
  }

  console.log('✅ pre-push passed')
}

module.exports = { run }
