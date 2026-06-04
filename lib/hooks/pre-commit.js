// =============================================================================
// pre-commit hook — Runs on git commit. Fast (<5s), deterministic, no API calls.
// =============================================================================
// Checks:
//   1. Secret scan (gitleaks-like regex patterns)
//   2. Auto-format staged files (ktlint / prettier / google-java-format)
// =============================================================================
const { detect } = require('../detect')
const { loadConfig } = require('../config')
const secretScan = require('../checkers/secret-scan')
const formatCheck = require('../checkers/format-check')

async function run() {
  const root = process.cwd()
  const project = detect(root)
  const config = loadConfig()

  let hasErrors = false

  // Gate 1: Secret scan (block on critical findings)
  const secretResult = secretScan.check()
  if (!secretResult.ok) {
    console.log('\n❌ SECRET SCAN FAILED')
    for (const f of secretResult.findings.filter(x => x.severity === 'critical')) {
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    }
    console.log('  Fix: remove secrets before committing, or use git-secrets to manage them.\n')
    hasErrors = true
  } else if (secretResult.findings.length > 0) {
    console.log('⚠️  Secret scan found low-severity patterns (non-blocking)')
    for (const f of secretResult.findings) {
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    }
  }

  // Gate 2: Format check (auto-fix where possible)
  if (project.language !== 'unknown') {
    const formatResult = formatCheck.check(project)
    if (!formatResult.ok) {
      console.log('\n❌ FORMAT CHECK FAILED')
      for (const issue of formatResult.issues) {
        console.log(`  ${issue}`)
      }
      console.log('  Fix: install the formatter (ktlint/prettier/google-java-format) or fix manually.\n')
      hasErrors = true
    }
  }

  if (hasErrors) {
    console.log('⛔ Commit blocked. Fix the issues above and try again.\n')
    process.exit(1)
  }

  if (secretResult.findings.length > 0 || project.language !== 'unknown') {
    console.log(`✅ pre-commit passed (${project.language}${secretResult.findings.length > 0 ? ', secrets: ' + secretResult.findings.length + ' warnings' : ''})`)
  }
}

module.exports = { run }
