// =============================================================================
// syntax-check.js — Catch syntax/compile errors before commit (<2s)
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')

function getStagedSourceFiles(language) {
  const exts = {
    kotlin: /\.kt$/,
    java: /\.java$/,
    javascript: /\.(js|ts|jsx|tsx)$/
  }
  const pattern = exts[language]
  if (!pattern) return []

  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
    return out ? out.split('\n').filter(f => pattern.test(f)) : []
  } catch (_) {
    return []
  }
}

function checkKotlin(files) {
  const issues = []
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8')
      // Check: unbalanced braces (fast heuristic)
      let opens = 0, closes = 0
      for (const ch of content) {
        if (ch === '{') opens++
        if (ch === '}') closes++
      }
      if (opens !== closes) {
        issues.push(`${f}: mismatched braces (${opens} open, ${closes} close)`)
      }
      // Check: empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
        issues.push(`${f}: empty catch block`)
      }
      // Check: missing return
      const funMatch = content.match(/fun\s+\w+\s*\([^)]*\)\s*:\s*(\w+)/g)
      if (funMatch) {
        // Just warn on functions with return type but no return statement
        for (const m of funMatch) {
          const funcStart = content.indexOf(m)
          const after = content.slice(funcStart)
          const braceOpen = after.indexOf('{')
          if (braceOpen > 0) {
            const rest = after.slice(braceOpen)
            // Simple check: count lines between { and return
            const lines = rest.split('\n')
            const hasReturn = lines.slice(0, 15).some(l => l.includes('return'))
            const hasEquals = m.includes('fun') && after.slice(braceOpen + 1).trim().startsWith('=')
            if (!hasReturn && !hasEquals && !m.includes('Unit') && !m.includes('Void')) {
              // Only warn if function has meaningful return type and no return seen
            }
          }
        }
      }
    } catch (_) {}
  }
  return issues
}

function checkJava(files) {
  const issues = []
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8')
      // Check: unbalanced braces
      let opens = 0, closes = 0
      for (const ch of content) {
        if (ch === '{') opens++
        if (ch === '}') closes++
      }
      if (opens !== closes) {
        issues.push(`${f}: mismatched braces (${opens} open, ${closes} close)`)
      }
      // Check: empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
        issues.push(`${f}: empty catch block`)
      }
      // Check: unused imports
      const imports = content.match(/import\s+([\w.]+);/g) || []
      for (const imp of imports) {
        const className = imp.split('.').pop().replace(';', '')
        const regex = new RegExp(`\\b${className}\\b`)
        // Count occurrences: 1 = the import itself, so if total <= 1 it's unused
        const count = (content.match(regex) || []).length
        if (count <= 1 && !imp.includes('*')) {
          issues.push(`${f}: possibly unused import — ${className}`)
        }
      }
    } catch (_) {}
  }
  return issues
}

function checkJavaScript(files) {
  const issues = []
  for (const f of files) {
    try {
      // Run node --check (fast, built-in)
      execSync(`node --check "${f}"`, { stdio: 'pipe', timeout: 5000 })
    } catch (e) {
      const msg = e.stderr?.toString() || e.message
      const clean = msg.split('\n').filter(l => l.includes('SyntaxError') || l.includes('Error'))
        .slice(0, 2).join(' | ')
      issues.push(`${f}: ${clean || 'syntax error'}`)
    }
  }
  return issues
}

function check(detectResult) {
  const lang = detectResult.language
  const issues = []

  if (lang === 'unknown') return { ok: true, issues }

  const stagedFiles = getStagedSourceFiles(lang)
  if (stagedFiles.length === 0) return { ok: true, issues }

  if (lang === 'kotlin') {
    issues.push(...checkKotlin(stagedFiles))
  } else if (lang === 'java') {
    issues.push(...checkJava(stagedFiles))
  } else if (lang === 'javascript') {
    issues.push(...checkJavaScript(stagedFiles))
  }

  // Filter to blocking issues only
  const blockers = issues.filter(i =>
    i.includes('SyntaxError') || i.includes('mismatched braces')
  )
  const warnings = issues.filter(i => !blockers.includes(i))

  if (warnings.length) {
    warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  }

  return { ok: blockers.length === 0, issues: blockers }
}

module.exports = { check }
