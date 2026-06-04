// =============================================================================
// gen-tests.js — AI-powered test generation using Claude API
// =============================================================================
// Requires: ANTHROPIC_API_KEY environment variable
// Optional: ANTHROPIC_MODEL (default: claude-sonnet-4-6)
// =============================================================================
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')

const API_KEY = process.env.ANTHROPIC_API_KEY || ''
const API_URL = 'api.anthropic.com'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// ── Phase 1: Collect changed source files ────────────────────────────────
function getChangedSources(targetFile) {
  let files = []
  if (targetFile) {
    files = [targetFile]
  } else {
    try {
      // Staged + unstaged changes
      const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
      const unstaged = execSync('git diff --name-only --diff-filter=ACM', { encoding: 'utf8' }).trim()
      files = [...new Set([...staged.split('\n'), ...unstaged.split('\n')])]
    } catch (_) {}
  }

  return files.filter(f => {
    return f && /\.(kt|java|js|ts|py)$/.test(f) && !/test/i.test(f)
  })
}

// ── Phase 2: Build prompt for Claude ─────────────────────────────────────
function buildPrompt(language, sourceFiles, testFramework, testDir) {
  const fileContents = sourceFiles.map(f => {
    try { return `### ${f}\n\`\`\`${language}\n${fs.readFileSync(f, 'utf8')}\n\`\`\`` }
    catch (_) { return `### ${f}\n(File not readable)` }
  }).join('\n\n')

  return `You are a senior ${language} developer. Generate comprehensive unit tests for the following source code.

## Test Framework
${testFramework}${language === 'kotlin' ? ' + MockK' : language === 'java' ? ' + Mockito' : ''}

## Test File Location
${testDir}/

## Source Code
${fileContents}

## Requirements
- Cover ALL public methods
- Include edge cases (null, empty, boundary values)
- Include exception/error cases where applicable
- Use the project's test framework conventions
- Tests must compile and run without modifications

## Output Format
Return ONLY the test file content, no explanations. Wrap in a code block with the exact filename:

\`\`\`${language} filename:TestClassName.${language === 'kotlin' ? 'kt' : language === 'java' ? 'java' : language === 'javascript' ? 'js' : 'py'}
// imports and test class here
\`\`\`

Generate the tests now.`
}

// ── Phase 3: Call Claude API ─────────────────────────────────────────────
function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })

    const req = https.request({
      hostname: API_URL,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          resolve(json.content[0].text)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Phase 4: Parse and write tests ───────────────────────────────────────
function parseAndWrite(response, testDir, language) {
  const ext = language === 'kotlin' ? 'kt' :
              language === 'java' ? 'java' :
              language === 'javascript' ? 'js' : 'py'

  // Extract filename from response
  const nameMatch = response.match(/filename:(\w+)\.\w+/)
  let testName = nameMatch ? nameMatch[1] : 'GeneratedTest'

  // Extract code block
  const codeMatch = response.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/)
  if (!codeMatch) return { written: [], raw: response }

  const code = codeMatch[1]

  // Ensure test directory exists
  const fullTestDir = path.join(process.cwd(), testDir)
  fs.mkdirSync(fullTestDir, { recursive: true })

  // Add package/import if needed
  let finalCode = code
  if (!code.includes('package ') && (language === 'kotlin' || language === 'java')) {
    // Try to infer package from source
    const srcFiles = fs.readdirSync(path.join(process.cwd(), 'src', 'main', language), { recursive: true })
      .filter(f => f.endsWith(`.${ext}`))
    if (srcFiles.length > 0) {
      const firstSrc = path.dirname(srcFiles[0]).replace(/\//g, '.')
      if (firstSrc && firstSrc !== '.') {
        finalCode = `package ${firstSrc}\n\n${code}`
      }
    }
  }

  const fileName = `${testName}.${ext}`
  const filePath = path.join(fullTestDir, fileName)

  if (fs.existsSync(filePath)) {
    // Append instead of overwrite
    fs.appendFileSync(filePath, `\n\n// === AI Generated ===\n${finalCode}`)
  } else {
    fs.writeFileSync(filePath, finalCode)
  }

  return { written: [filePath], raw: null }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function run(targetFile) {
  if (!API_KEY) {
    console.log('❌ ANTHROPIC_API_KEY not set.')
    console.log('   export ANTHROPIC_API_KEY=sk-ant-...')
    process.exit(1)
  }

  const { detect } = require('../detect')
  const project = detect(process.cwd())

  if (project.language === 'unknown') {
    console.log('❌ Unknown project type. Cannot generate tests.')
    process.exit(1)
  }

  const sources = getChangedSources(targetFile)
  if (sources.length === 0) {
    console.log('ℹ️  No changed source files found. Stage or modify some code first.')
    process.exit(0)
  }

  const testDir = project.language === 'kotlin' || project.language === 'java'
    ? `src/test/${project.language}`
    : 'test'

  console.log(`Generating tests for ${sources.length} file(s)...`)
  console.log(`  Language: ${project.language}`)
  console.log(`  Framework: ${project.testFramework}`)
  console.log(`  Test dir: ${testDir}`)
  console.log(`  Model: ${MODEL}`)
  console.log(`  Sources:`)
  sources.forEach(f => console.log(`    - ${f}`))
  console.log('')

  const prompt = buildPrompt(project.language, sources, project.testFramework, testDir)
  console.log('Calling Claude API...')

  try {
    const response = await callClaude(prompt)
    const result = parseAndWrite(response, testDir, project.language)

    if (result.written.length > 0) {
      console.log(`\n✅ Tests written:`)
      result.written.forEach(f => console.log(`   ${f}`))
      console.log('\nNext steps:')
      console.log('   git add ' + result.written.join(' '))
      console.log('   git commit -m "add AI-generated tests"')
      console.log('   git push    # pre-push will run these tests')
    } else {
      console.log('⚠️  Could not parse tests from AI response.')
      console.log('--- Raw response ---')
      console.log(result.raw?.slice(0, 2000))
    }
  } catch (e) {
    console.log(`❌ API error: ${e.message}`)
    console.log('   Check ANTHROPIC_API_KEY and network.')
    process.exit(1)
  }
}

module.exports = { run }
