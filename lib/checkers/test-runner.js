// =============================================================================
// test-runner.js — Run tests with language-appropriate framework
// =============================================================================
const { execSync } = require('child_process')

function run(detectResult, config) {
  const lang = detectResult.language
  const minCoverage = parseInt(config.minCoverage || '60', 10)
  const result = { ok: true, output: '', coverage: 0, testsPassed: 0, testsFailed: 0 }

  try {
    if (lang === 'kotlin' || lang === 'java') {
      const gradleCmd = detectResult.buildTool === 'gradle-wrapper' ? './gradlew' : 'gradle'
      const out = execSync(`${gradleCmd} test --no-daemon --console=plain 2>&1`, {
        encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024
      })
      result.output = out
      // Parse JUnit output
      const passedMatch = out.match(/(\d+) tests? completed/)
      const failedMatch = out.match(/(\d+) tests? failed/)
      result.testsPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0
      result.testsFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0

    } else if (lang === 'javascript') {
      const pkgMgr = detectResult.buildTool
      const testCmd = pkgMgr === 'yarn' ? 'yarn test' : pkgMgr === 'pnpm' ? 'pnpm test' : 'npm test'
      const out = execSync(`${testCmd} 2>&1 || true`, {
        encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024
      })
      result.output = out
      const passedMatch = out.match(/(\d+) passed/)
      const failedMatch = out.match(/(\d+) failed/)
      result.testsPassed = passedMatch ? parseInt(passedMatch[1], 10) : (out.includes('Tests') ? 1 : 0)
      result.testsFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0
    }

    if (result.testsFailed > 0) {
      result.ok = false
    }
  } catch (e) {
    // Tests failed (non-zero exit) — that's a check failure, not a tool failure
    if (e.stdout) result.output += e.stdout.toString()
    if (e.stderr) result.output += e.stderr.toString()
    result.ok = false
  }

  return result
}

module.exports = { run }
