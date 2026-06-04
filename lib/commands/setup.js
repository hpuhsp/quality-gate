// =============================================================================
// setup.js — Interactive first-run setup wizard
// =============================================================================
const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

const CONFIG_HOME = path.join(os.homedir(), '.quality-gate')
const CONFIG_FILE = path.join(CONFIG_HOME, 'config.yml')

function ask(rl, question, defaultValue) {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

async function run() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log(`
╔══════════════════════════════════════════╗
║   quality-gate — First Run Setup         ║
╚══════════════════════════════════════════╝

This wizard configures your quality-gate settings.
Press Enter to accept defaults.
`)

  // 1. AI API Key
  console.log('─── AI Test Generation ───')
  console.log('quality-gate can auto-generate unit tests using AI.')
  console.log('This requires an API key. Leave empty to skip.')
  const apiKey = await ask(rl, 'Anthropic API Key (sk-ant-...)')

  // 2. Test execution location
  console.log('\n─── Test Execution ───')
  console.log('Pre-push tests run unit tests before git push.')
  console.log('  ✅ yes — Catch failures locally, before CI     (slower push)')
  console.log('  ❌ no  — Let CI handle tests                   (faster push, recommended for teams)')
  const runTestsOnPush = await ask(rl, 'Run unit tests on git push? (yes/no)', 'no')

  // 3. Auto-format
  console.log('\n─── Code Formatting ───')
  const autoFormat = await ask(rl, 'Auto-format code on commit? (yes/no)', 'yes')

  // 4. Coverage threshold
  const minCoverage = await ask(rl, 'Minimum test coverage %', '60')

  // 5. Remote config
  console.log('\n─── Team Config (optional) ───')
  console.log('Share quality-gate rules across your team via a Git repo.')
  const remoteRepo = await ask(rl, 'Shared config repo URL')

  // Write config
  fs.mkdirSync(CONFIG_HOME, { recursive: true })

  const config = [
    '# quality-gate configuration',
    `# Generated: ${new Date().toISOString()}`,
    '',
    `minCoverage: ${minCoverage}`,
    `autoFormat: ${autoFormat === 'yes' || autoFormat === 'y' || autoFormat === ''}`,
    `runTestsOnPush: ${runTestsOnPush === 'yes' || runTestsOnPush === 'y'}`,
    '',
  ]
  if (apiKey) {
    config.push(`# AI API key (also set ANTHROPIC_API_KEY env var)`)
    config.push(`anthropicApiKey: "${apiKey}"`)
  }
  if (remoteRepo) {
    config.push(`remote: "${remoteRepo}"`)
    config.push('remoteRef: "main"')
  }

  fs.writeFileSync(CONFIG_FILE, config.join('\n') + '\n')

  // Set env vars for current session
  if (apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey
  }

  // Also write API key to shell profile for persistence
  if (apiKey) {
    const shellProfile = process.env.ZSH
      ? path.join(os.homedir(), '.zshrc')
      : path.join(os.homedir(), '.bash_profile')

    const exportLine = `export ANTHROPIC_API_KEY="${apiKey}"`
    try {
      const existing = fs.existsSync(shellProfile) ? fs.readFileSync(shellProfile, 'utf8') : ''
      if (!existing.includes('ANTHROPIC_API_KEY')) {
        fs.appendFileSync(shellProfile, `\n# quality-gate\n${exportLine}\n`)
        console.log(`\n✅ Added API key to ${path.basename(shellProfile)}`)
      }
    } catch (_) {}
  }

  rl.close()

  console.log(`
✅ Setup complete! Config: ${CONFIG_FILE}

Next steps:
  quality-gate enable     Activate hooks for this repo
  quality-gate status     Verify everything is working
  quality-gate gen-tests  AI-generate tests for changed code

Quick test:
  echo 'password: "test123"' > test.conf
  git add test.conf && git commit -m "test"
  # → Should be BLOCKED by secret scan
`)
}

module.exports = { run }
