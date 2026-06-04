// =============================================================================
// sql-check.js — Detect SQL injection patterns in staged code (<1s)
// =============================================================================
const fs = require('fs')
const { execSync } = require('child_process')

const SQLI_PATTERNS = [
  // Raw concatenation in SQL strings (critical)
  { name: 'SQL string concat', regex: /["']\s*\+.*SELECT|SELECT.*\+/i, severity: 'critical' },
  { name: 'SQL string concat', regex: /["']\s*\+.*INSERT|INSERT.*\+/i, severity: 'critical' },
  { name: 'SQL string concat', regex: /["']\s*\+.*UPDATE|UPDATE.*\+/i, severity: 'critical' },
  { name: 'SQL string concat', regex: /["']\s*\+.*DELETE|DELETE.*\+/i, severity: 'critical' },
  { name: 'SQL string concat', regex: /["']\s*\+.*WHERE|WHERE.*\+/i, severity: 'critical' },

  // String.format / String.format with SQL (critical)
  { name: 'SQL with String.format', regex: /String\.format\s*\(\s*["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, severity: 'critical' },

  // Statement.executeQuery with string concat (critical)
  { name: 'Raw SQL execution with concat', regex: /\.execute(?:Query|Update)\s*\(\s*["'][^"']*\+\s*\+/i, severity: 'critical' },
  { name: 'Raw SQL execution with format', regex: /\.execute(?:Query|Update)\s*\(\s*(?:String\.format|format\s*\(|f["'])/i, severity: 'critical' },

  // Template literal with SQL (JS/TS — critical)
  { name: 'SQL in template literal', regex: /`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{[^}]*\}[^`]*`/i, severity: 'critical' },

  // JdbcTemplate with string concat (high)
  { name: 'JdbcTemplate string SQL', regex: /jdbcTemplate\.\w+\s*\(\s*["'][^"']*\+/i, severity: 'high' },
  { name: 'NamedParameterJdbcTemplate string SQL', regex: /namedParameterJdbcTemplate\.\w+\s*\(\s*["'][^"']*\+/i, severity: 'high' },

  // createNativeQuery with concat (high)
  { name: 'NativeQuery string concat', regex: /createNativeQuery\s*\(\s*["'][^"']*\+/i, severity: 'high' },

  // Statement (not PreparedStatement) raw — suspect but not always bad
  { name: 'Raw Statement usage', regex: /\.createStatement\s*\(\s*\)|Statement\s+stmt\s*=/, severity: 'medium' },

  // Dynamic ORDER BY / GROUP BY without whitelist (medium)
  { name: 'Dynamic ORDER BY', regex: /ORDER\s+BY\s*\+/i, severity: 'medium' },
  { name: 'Dynamic GROUP BY', regex: /GROUP\s+BY\s*\+/i, severity: 'medium' },
]

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
    return out ? out.split('\n').filter(f => f && /\.(java|kt|js|ts|py|go|php)$/.test(f)) : []
  } catch (_) {
    return []
  }
}

function check() {
  const files = getStagedFiles()
  if (files.length === 0) return { ok: true, findings: [] }

  const findings = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) continue

        for (const p of SQLI_PATTERNS) {
          if (p.regex.test(line)) {
            findings.push({
              file,
              line: i + 1,
              pattern: p.name,
              severity: p.severity,
              snippet: line.trim().slice(0, 120)
            })
          }
        }
      }
    } catch (_) {}
  }

  const blockers = findings.filter(f => f.severity === 'critical')
  const warnings = findings.filter(f => f.severity === 'high')

  if (warnings.length) {
    warnings.forEach(w => console.log(`  ⚠️  ${w.file}:${w.line} — ${w.pattern} [${w.severity}]`))
  }

  return { ok: blockers.length === 0, findings, blockers }
}

module.exports = { check }
