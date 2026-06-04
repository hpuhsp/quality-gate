// =============================================================================
// pre-commit hook — Runs on git commit. Fast (<5s), deterministic, no API calls.
// =============================================================================
// Checks (all staged files only):
//   Gate 1: Secret scan — passwords, keys, tokens (<1s)
//   Gate 2: Syntax check — mismatched braces, node --check (<2s)
//   Gate 3: SQL injection — string concat SQL, raw Statement (<1s)
//   Gate 4: Auto-format — ktlint / prettier / google-java-format
// =============================================================================
const path = require('path')
const { detect } = require('../detect')
const { loadConfig } = require('../config')
const secretScan = require(path.join(__dirname, '..', 'checkers', 'secret-scan'))
const syntaxCheck = require(path.join(__dirname, '..', 'checkers', 'syntax-check'))
const sqlCheck = require(path.join(__dirname, '..', 'checkers', 'sql-check'))
const formatCheck = require(path.join(__dirname, '..', 'checkers', 'format-check'))

async function run() {
  const root = process.cwd()
  const project = detect(root)
  const config = loadConfig()

  let hasErrors = false
  let checkCount = 0
  let passCount = 0

  // ── Gate 1: Secret scan ────────────────────────────────────────────
  const secretResult = secretScan.check()
  checkCount++
  if (!secretResult.ok) {
    console.log('\n❌ SECRET SCAN FAILED')
    secretResult.findings.filter(x => x.severity === 'critical').forEach(f =>
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    )
    console.log('  Fix: remove secrets before committing.\n')
    hasErrors = true
  } else if (secretResult.findings.length > 0) {
    console.log('⚠️  Secret scan: non-blocking patterns found')
    secretResult.findings.forEach(f =>
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    )
  }

  // ── Gate 2: Syntax check (language-agnostic, uses file extensions)
  checkCount++
  const syntaxResult = syntaxCheck.check(project)
  if (!syntaxResult.ok) {
      console.log('\n❌ SYNTAX CHECK FAILED')
      syntaxResult.issues.forEach(i => console.log(`  ${i}`))
      console.log('  Fix: correct the syntax errors before committing.\n')
      hasErrors = true
    }

  // ── Gate 3: SQL injection check ───────────────────────────────────
  const sqlResult = sqlCheck.check()
  checkCount++
  if (!sqlResult.ok) {
    console.log('\n❌ SQL INJECTION RISK')
    sqlResult.blockers.forEach(f =>
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    )
    console.log('  Fix: use PreparedStatement / parameterized queries instead of string concatenation.\n')
    hasErrors = true
  } else if (sqlResult.findings.length > 0) {
    console.log('⚠️  SQL check: review these patterns')
    sqlResult.findings.forEach(f =>
      console.log(`  ${f.file}:${f.line} — ${f.pattern} [${f.severity}]`)
    )
  }

  // ── Gate 4: Auto-format ───────────────────────────────────────────
  if (project.language !== 'unknown') {
    const formatResult = formatCheck.check(project)
    if (!formatResult.ok) {
      console.log('\n❌ FORMAT CHECK FAILED')
      formatResult.issues.forEach(i => console.log(`  ${i}`))
      console.log('  Fix: install the formatter (ktlint/prettier/google-java-format).\n')
      hasErrors = true
    }
  }

  // ── Result ────────────────────────────────────────────────────────
  passCount = checkCount - (hasErrors ? 1 : 0)

  if (hasErrors) {
    console.log(`⛔ Commit blocked (${passCount}/${checkCount} checks passed). Fix issues above.\n`)
    process.exit(1)
  }

  const tags = []
  if (project.language !== 'unknown') tags.push(project.language)
  if (secretResult.findings.length > 0) tags.push('secrets-warn')
  console.log(`✅ pre-commit passed${tags.length ? ' (' + tags.join(', ') + ')' : ''}`)
}

module.exports = { run }
