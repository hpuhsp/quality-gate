// =============================================================================
// format-check.js — Auto-format staged files based on project type
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function getStagedFiles(pattern) {
  try {
    const out = execSync(`git diff --cached --name-only --diff-filter=ACM`, { encoding: 'utf8' }).trim()
    return out ? out.split('\n').filter(f => f.match(pattern)) : []
  } catch (_) {
    return []
  }
}

function check(detectResult) {
  const lang = detectResult.language
  const issues = []

  if (lang === 'kotlin') {
    // Check for ktlint
    if (_hasCommand('ktlint')) {
      const ktFiles = getStagedFiles(/\.kt$/)
      if (ktFiles.length > 0) {
        try {
          execSync(`ktlint --format ${ktFiles.join(' ')}`, { stdio: 'pipe', timeout: 30000 })
          // Re-stage formatted files
          for (const f of ktFiles) {
            execSync(`git add ${f}`, { stdio: 'ignore' })
          }
        } catch (e) {
          issues.push(`ktlint found errors: ${e.stderr?.toString().slice(0, 200) || 'format errors'}`)
        }
      }
    }
  } else if (lang === 'java') {
    if (_hasCommand('google-java-format')) {
      const javaFiles = getStagedFiles(/\.java$/)
      if (javaFiles.length > 0) {
        try {
          execSync(`google-java-format --replace ${javaFiles.join(' ')}`, { stdio: 'pipe', timeout: 30000 })
          for (const f of javaFiles) execSync(`git add ${f}`, { stdio: 'ignore' })
        } catch (e) {
          issues.push(`google-java-format found errors`)
        }
      }
    }
  } else if (lang === 'javascript') {
    if (_hasCommand('prettier')) {
      const jsFiles = getStagedFiles(/\.(js|ts|jsx|tsx|json|css|md|yml|yaml)$/)
      if (jsFiles.length > 0) {
        try {
          execSync(`npx prettier --write ${jsFiles.join(' ')}`, { stdio: 'pipe', timeout: 30000 })
          for (const f of jsFiles) execSync(`git add ${f}`, { stdio: 'ignore' })
        } catch (e) {
          issues.push(`prettier found formatting errors`)
        }
      }
    }
  }

  return { ok: issues.length === 0, issues }
}

function _hasCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch (_) {
    return false
  }
}

module.exports = { check }
