// =============================================================================
// status.js — Show hook status, project detection, and active config
// =============================================================================
const { execSync } = require('child_process')
const { detect } = require('../detect')
const { loadConfig, CONFIG_HOME } = require('../config')
const path = require('path')
const fs = require('fs')

async function run() {
  const root = process.cwd()
  const project = detect(root)
  const config = loadConfig()

  // Git hook status
  let hooksPath = 'not set'
  try {
    hooksPath = execSync('git config core.hooksPath', { encoding: 'utf8' }).trim()
  } catch (_) {}

  const hooksDir = path.join(CONFIG_HOME, 'hooks')
  const preCommitOk = fs.existsSync(path.join(hooksDir, 'pre-commit'))
  const prePushOk = fs.existsSync(path.join(hooksDir, 'pre-push'))

  console.log('quality-gate status')
  console.log('──────────────────')
  console.log(`  Enabled:     ${hooksPath === hooksDir ? '✅ YES' : '❌ NO'}`)
  console.log(`  Hooks path:  ${hooksPath}`)
  console.log(`  pre-commit:  ${preCommitOk ? '✅ installed' : '❌ missing'}`)
  console.log(`  pre-push:    ${prePushOk ? '✅ installed' : '❌ missing'}`)
  console.log('')
  console.log(`  Project:     ${project.language}`)
  console.log(`  Build tool:  ${project.buildTool}`)
  console.log(`  Test FW:     ${project.testFramework}`)
  console.log(`  Has tests:   ${project.hasTests ? '✅ yes' : '❌ no'}`)
  console.log('')
  console.log(`  Config:      ${CONFIG_HOME}/config.yml`)
  console.log(`  Min Coverage: ${config.minCoverage || '60'}%`)
  console.log(`  Auto Format:  ${config.autoFormat !== 'false' ? '✅ on' : 'off'}`)
}

module.exports = { run }
