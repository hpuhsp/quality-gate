// =============================================================================
// secret-scan.js — Check staged files for secrets/keys/tokens
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')

const PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'critical' },
  { name: 'GitLab Token', regex: /glpat-[A-Za-z0-9_-]{20,}/, severity: 'critical' },
  { name: 'Hardcoded Password', regex: /password\s*[:=]\s*['"][^'"]{4,}['"]/, severity: 'critical' },
  { name: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/, severity: 'medium' },
  { name: 'JDBC Connection', regex: /jdbc:[a-z]+:\/\/[^/\s]+/, severity: 'high' },
]

function check() {
  const findings = []
  let staged
  try {
    staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim()
  } catch (_) {
    return { ok: true, findings: [] }
  }
  if (!staged) return { ok: true, findings: [] }

  const files = staged.split('\n').filter(f => {
    return f && !f.match(/\.(png|jpg|gif|ico|svg|woff2?|ttf|eot|zip|tar|gz|jar|lock|map)$/)
  })

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const p of PATTERNS) {
          if (p.regex.test(lines[i])) {
            findings.push({
              file,
              line: i + 1,
              pattern: p.name,
              severity: p.severity
            })
          }
        }
      }
    } catch (_) {}
  }

  const blocked = findings.some(f => f.severity === 'critical')
  return { ok: !blocked, findings }
}

module.exports = { check }
