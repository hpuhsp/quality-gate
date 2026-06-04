// =============================================================================
// syntax-check.js — Multi-language syntax validation (<2s, zero API)
// =============================================================================
// Supports: Java, Kotlin, JS, TS, C#, C++, Go, Swift, Objective-C, Vue
// Strategy: native compiler if available → fast heuristics as fallback
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')

// ── File extension → language mapping ──────────────────────────────────
const EXT_MAP = {
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
  '.js': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.vue': 'vue',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
  '.go': 'go',
  '.swift': 'swift',
  '.m': 'objc', '.mm': 'objc',
}

function getStagedSourceFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
    return out ? out.split('\n').filter(f => f && EXT_MAP[require('path').extname(f)]) : []
  } catch (_) { return [] }
}

// ── Universal: bracket/brace/paren balance ──────────────────────────────
function checkBrackets(content, file) {
  const issues = []
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const stack = []

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch in pairs) {
      stack.push({ char: ch, pos: i })
    } else if (ch === '}' || ch === ']' || ch === ')') {
      const last = stack.pop()
      if (!last || pairs[last.char] !== ch) {
        issues.push(`${file}: unexpected '${ch}' — possible unmatched bracket`)
        break
      }
    }
  }
  if (stack.length > 0) {
    const unmatched = stack.map(s => `'${s.char}'`).join(', ')
    issues.push(`${file}: unmatched brackets: ${unmatched} (${stack.length} unclosed)`)
  }
  return issues
}

// ── Language-specific fast checks ──────────────────────────────────────

function checkJS_TS(file) {
  const issues = []
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe', timeout: 5000 })
  } catch (e) {
    const msg = e.stderr?.toString() || ''
    const err = msg.split('\n').filter(l => l.includes('SyntaxError')).slice(0, 1).join('')
    issues.push(`${file}: ${err || 'syntax error'}`)
  }
  return issues
}

function checkVue(file) {
  const issues = []
  try {
    const content = fs.readFileSync(file, 'utf8')
    // Extract <script> blocks and check with node --check
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/g)
    if (scriptMatch) {
      for (const block of scriptMatch) {
        const code = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
        // Wrap in module context for checking
        const tmp = require('os').tmpdir() + '/.vue-check-' + Date.now() + '.js'
        try {
          fs.writeFileSync(tmp, code)
          execSync(`node --check "${tmp}"`, { stdio: 'pipe', timeout: 5000 })
        } catch (e) {
          issues.push(`${file}: Vue script block — ${(e.stderr?.toString() || '').split('\n')[0]}`)
        } finally {
          try { fs.unlinkSync(tmp) } catch (_) {}
        }
      }
    }
    // Check template: no unmatched tags (fast heuristic)
    const tags = content.match(/<\/?([a-zA-Z][\w-]*)/g) || []
    const tagStack = []
    const selfClose = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])
    for (const tag of tags) {
      if (tag.startsWith('</')) {
        const name = tag.slice(2).toLowerCase()
        if (tagStack.length > 0 && tagStack[tagStack.length - 1] === name) {
          tagStack.pop()
        }
      } else {
        const name = tag.slice(1).toLowerCase()
        if (!selfClose.has(name)) {
          tagStack.push(name)
        }
      }
    }
    if (tagStack.length > 0) {
      issues.push(`${file}: Vue template — possibly unclosed tags: ${tagStack.join(', ')}`)
    }
  } catch (_) {}
  return issues
}

function checkJava_Kotlin_CSharp(file, lang) {
  const issues = []
  try {
    const content = fs.readFileSync(file, 'utf8')
    // Bracket balance
    issues.push(...checkBrackets(content, file))
    // Empty catch block
    const emptyCatch = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g)
    if (emptyCatch) {
      issues.push(`${file}: ${emptyCatch.length} empty catch block(s)`)}
    // Unclosed string literal (even-line heuristic)
    const lineCount = content.split('\n').length
    let inString = false, inBlock = false
    let blockDelim = ''
    for (const ch of content) {
      if (!inBlock && ch === '"' && !inString) inString = true
      else if (!inBlock && ch === '"' && inString) inString = false
      else if (!inString && ch === '`' && !inBlock) { inBlock = true; blockDelim = '`' }
      else if (inBlock && ch === '`' && blockDelim === '`') inBlock = false
    }
    if (inString) issues.push(`${file}: unclosed string literal`)
    if (inBlock) issues.push(`${file}: unclosed template/raw string`)
  } catch (_) {}
  return issues
}

function checkCpp(file) {
  const issues = []
  try {
    const content = fs.readFileSync(file, 'utf8')
    issues.push(...checkBrackets(content, file))
    // Missing semicolons before closing brace (common C++ mistake)
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const trim = lines[i].trim()
      if (trim === '}' && i > 0 && !lines[i - 1].trim().endsWith(';') && !lines[i - 1].trim().endsWith('{') && !lines[i - 1].trim().endsWith('}')) {
        const prev = lines[i - 1].trim()
        // Check if previous line is a class/struct/enum definition end
        if (/^\s*\}\s*\w+;/.test(prev)) continue // "} name;" is fine
        if (prev.length > 0 && !prev.startsWith('//') && !prev.startsWith('#') && !prev.endsWith('\\')) {
          issues.push(`${file}:${i}: possible missing semicolon before '}'`)
        }
      }
    }
    // Missing #endif / #ifdef balance
    const ifdefs = (content.match(/#ifdef|#ifndef|#if\b/g) || []).length
    const endifs = (content.match(/#endif/g) || []).length
    if (ifdefs !== endifs) {
      issues.push(`${file}: preprocessor imbalance (#if*=${ifdefs}, #endif=${endifs})`)
    }
  } catch (_) {}
  return issues
}

function checkGo(file) {
  const issues = []
  try {
    // Try gofmt if available
    try {
      execSync(`gofmt -e "${file}"`, { stdio: 'pipe', timeout: 3000 })
    } catch (e) {
      const msg = e.stderr?.toString() || ''
      const err = msg.split('\n').filter(l => l.includes(file)).slice(0, 2).join('\n')
      issues.push(`${file}: ${err || 'gofmt syntax error'}`)
    }
    if (issues.length === 0) {
      const content = fs.readFileSync(file, 'utf8')
      issues.push(...checkBrackets(content, file))
    }
  } catch (_) {
    // gofmt not available → fallback to heuristic
    try {
      const content = fs.readFileSync(file, 'utf8')
      issues.push(...checkBrackets(content, file))
    } catch (_) {}
  }
  return issues
}

function checkSwift(file) {
  const issues = []
  try {
    const content = fs.readFileSync(file, 'utf8')
    issues.push(...checkBrackets(content, file))
    // Empty catch in Swift (do-catch)
    const emptyCatch = content.match(/catch\s*\{?\s*\}?\s*$/gm)
    if (emptyCatch) {
      issues.push(`${file}: empty catch block(s)`)
    }
    // Force-unwrap warnings (pattern) — informative only
    const forceUnwrap = content.match(/\w+!/g)
    if (forceUnwrap && forceUnwrap.length > 5) {
      // Don't block, just note for informational purposes
    }
  } catch (_) {}
  return issues
}

function checkObjC(file) {
  const issues = []
  try {
    const content = fs.readFileSync(file, 'utf8')
    issues.push(...checkBrackets(content, file))
    // Missing @end
    const atImplementations = (content.match(/@implementation/g) || []).length + (content.match(/@interface\b/g) || []).length
    const atEnds = (content.match(/@end/g) || []).length
    if (atImplementations !== atEnds) {
      issues.push(`${file}: @implementation/@interface (${atImplementations}) vs @end (${atEnds}) mismatch`)
    }
  } catch (_) {}
  return issues
}

// ── Main ──────────────────────────────────────────────────────────────────
function check(detectResult) {
  const issues = []

  const stagedFiles = getStagedSourceFiles()
  if (stagedFiles.length === 0) return { ok: true, issues: [] }

  for (const file of stagedFiles) {
    const ext = require('path').extname(file)
    const lang = EXT_MAP[ext]
    if (!lang) continue

    switch (lang) {
      case 'javascript':
      case 'typescript':
        issues.push(...checkJS_TS(file))
        break
      case 'vue':
        issues.push(...checkVue(file))
        break
      case 'java':
      case 'kotlin':
      case 'csharp':
        issues.push(...checkJava_Kotlin_CSharp(file, lang))
        break
      case 'cpp':
        issues.push(...checkCpp(file))
        break
      case 'go':
        issues.push(...checkGo(file))
        break
      case 'swift':
        issues.push(...checkSwift(file))
        break
      case 'objc':
        issues.push(...checkObjC(file))
        break
    }
  }

  // Block on critical syntax errors
  const blockers = issues.filter(i =>
    i.includes('SyntaxError') ||
    i.includes('unmatched') ||
    i.includes('unclosed') ||
    i.includes('gofmt') ||
    i.includes('preprocessor') ||
    i.includes('mismatch')
  )
  const warnings = issues.filter(i => !blockers.includes(i))

  if (warnings.length) {
    warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  }

  if (stagedFiles.length > 0 && issues.length === 0) {
    // Silent on full pass
  }

  return { ok: blockers.length === 0, issues: blockers, checkedFiles: stagedFiles.length }
}

module.exports = { check }
