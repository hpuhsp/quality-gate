// =============================================================================
// secret-scan.js — Check staged files for secrets/keys/tokens
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')

const PATTERNS = [
  // ── Cloud Provider Keys ─────────────────────────────────────────────
  { name: 'AWS Access Key',     regex: /(?:AKIA|ASIA)[A-Z0-9]{16}/, severity: 'critical' },
  { name: 'AWS Secret Key',     regex: /aws_secret_access_key\s*[:=]\s*['"][A-Za-z0-9/+=]{20,}['"]/i, severity: 'critical' },
  { name: 'Alibaba Cloud AK',   regex: /LTAI[A-Za-z0-9]{16,}/, severity: 'critical' },
  { name: 'Alibaba Cloud SK',   regex: /access_key_secret\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/i, severity: 'critical' },
  { name: 'Tencent Cloud AK',   regex: /AKID[A-Za-z0-9]{13,}/, severity: 'critical' },
  { name: 'Tencent Cloud SK',   regex: /secret_key\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/i, severity: 'critical' },
  { name: 'GCP Service Account', regex: /"type"\s*:\s*"service_account"/, severity: 'critical' },

  // ── GitHub Tokens ──────────────────────────────────────────────────
  { name: 'GitHub PAT',          regex: /gh[pousr]_[A-Za-z0-9_]{20,}/, severity: 'critical' },
  { name: 'GitHub OAuth',        regex: /github_token\s*[:=]\s*['"][A-Za-z0-9_]{20,}['"]/i, severity: 'critical' },

  // ── GitLab Tokens ──────────────────────────────────────────────────
  { name: 'GitLab PAT',          regex: /glpat-[A-Za-z0-9_-]{20,}/, severity: 'critical' },
  { name: 'GitLab CI Token',     regex: /CI_JOB_TOKEN\s*[:=]\s*['"][A-Za-z0-9_-]{10,}['"]/i, severity: 'critical' },

  // ── LLM API Keys ───────────────────────────────────────────────────
  { name: 'OpenAI API Key',      regex: /sk-(?:proj-)?[A-Za-z0-9]{32,}/, severity: 'critical' },
  { name: 'Anthropic API Key',   regex: /sk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{60,}/, severity: 'critical' },
  { name: 'DeepSeek API Key',    regex: /sk-[a-z0-9]{32,}/, severity: 'critical' },

  // ── Auth Tokens ────────────────────────────────────────────────────
  { name: 'JWT Token',           regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, severity: 'high' },
  { name: 'OAuth Bearer',        regex: /bearer\s+[A-Za-z0-9\-._~+\/]{20,}/i, severity: 'high' },
  { name: 'Generic API Key',     regex: /(?:api_?key|api_?secret|secret_?key)\s*[:=]\s*['"][A-Za-z0-9_-]{10,}['"]/i, severity: 'critical' },
  { name: 'Generic Token',       regex: /(?:auth_?token|access_?token)\s*[:=]\s*['"][A-Za-z0-9_-]{10,}['"]/i, severity: 'critical' },

  // ── Private Keys ───────────────────────────────────────────────────
  { name: 'Private Key Header',  regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, severity: 'critical' },
  { name: 'SSH Private Key',     regex: /-----BEGIN OPENSSH PRIVATE KEY-----/, severity: 'critical' },
  { name: 'PGP Private Key',     regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/, severity: 'critical' },
  { name: 'PEM Certificate',     regex: /-----BEGIN CERTIFICATE-----/, severity: 'medium' },

  // ── Database Credentials ───────────────────────────────────────────
  { name: 'Hardcoded Password',  regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, severity: 'critical' },
  { name: 'JDBC Connection',     regex: /jdbc:[a-z]+:\/\/[^/]+\/[^\s"'?]+(?:\?[^\s"']*)?.*(?:user|password)=[^&\s"']+/i, severity: 'critical' },
  { name: 'DB Connection String', regex: /(?:DATABASE_URL|DB_URL|MONGO_URI|REDIS_URL)\s*[:=]\s*['"][^'"]{10,}['"]/i, severity: 'high' },

  // ── Webhooks & Services ────────────────────────────────────────────
  { name: 'Slack Webhook',       regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]+/, severity: 'medium' },
  { name: 'Feishu Webhook',      regex: /https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]+/, severity: 'medium' },
  { name: 'DingTalk Webhook',    regex: /https:\/\/oapi\.dingtalk\.com\/robot\/send\?access_token=[A-Za-z0-9]+/, severity: 'medium' },
  { name: 'WeChat Webhook',      regex: /https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[A-Za-z0-9-]+/, severity: 'medium' },
]

// ── Binary & generated file skip list ────────────────────────────────
const SKIP_EXT = /\.(png|jpe?g|gif|ico|svg|woff2?|ttf|eot|zip|tar|gz|jar|war|class|lock|map|min\.\w+|pb|bin|exe|dll|so|dylib|wasm|mp4|mp3|pdf)$/
const SKIP_DIR = /(node_modules|\.git|\.gradle|build|dist|target|vendor)\//

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
    return out ? out.split('\n').filter(Boolean) : []
  } catch (_) { return [] }
}

function check() {
  const findings = []
  const staged = getStagedFiles()
  if (!staged.length) return { ok: true, findings: [] }

  const files = staged.filter(f => !SKIP_EXT.test(f) && !SKIP_DIR.test(f))

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comment-only lines (but still scan for private key headers)
        const trimmed = line.trim()
        if (trimmed.startsWith('//') && !trimmed.includes('BEGIN') && !trimmed.includes('PRIVATE')) continue
        if (trimmed.startsWith('#') && !trimmed.includes('BEGIN') && !trimmed.includes('PRIVATE')) continue
        if (trimmed.startsWith('*') && !trimmed.startsWith('**')) continue

        for (const p of PATTERNS) {
          if (p.regex.test(line)) {
            findings.push({ file, line: i + 1, pattern: p.name, severity: p.severity })
          }
        }
      }
      // Also check full content for multi-line patterns (private keys)
      for (const p of PATTERNS) {
        if (p.name.includes('Private Key') || p.name.includes('GCP')) {
          if (p.regex.test(content)) {
            const already = findings.some(f => f.file === file && f.pattern === p.name)
            if (!already) {
              findings.push({ file, line: 1, pattern: p.name, severity: p.severity })
            }
          }
        }
      }
    } catch (_) {}
  }

  const blocked = findings.some(f => f.severity === 'critical')
  return { ok: !blocked, findings }
}

module.exports = { check }
