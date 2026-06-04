// =============================================================================
// config.js — Configuration loader (local + remote overlay)
// =============================================================================
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const CONFIG_HOME = path.join(os.homedir(), '.quality-gate')
const DEFAULT_CONFIG = path.join(__dirname, '..', 'default-config.yml')
const LOCAL_CONFIG = path.join(CONFIG_HOME, 'config.yml')

function parseYaml(text) {
  // Minimal YAML parser for our config format (nested keys, no arrays needed)
  const result = {}
  const lines = text.split('\n')
  let current = result
  let stack = [{ obj: result, indent: -1 }]
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = line.search(/\S/)
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const key = trimmed.substring(0, colonIdx).trim()
    let value = trimmed.substring(colonIdx + 1).trim()
    // Pop stack to correct indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    current = stack[stack.length - 1].obj
    if (value === '') {
      current[key] = {}
      current = current[key]
      stack.push({ obj: current, indent })
    } else {
      current[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return result
}

function loadConfig() {
  let config = {}

  // Load default (bundled)
  if (fs.existsSync(DEFAULT_CONFIG)) {
    config = parseYaml(fs.readFileSync(DEFAULT_CONFIG, 'utf8'))
  }

  // Overlay local config
  if (fs.existsSync(LOCAL_CONFIG)) {
    const local = parseYaml(fs.readFileSync(LOCAL_CONFIG, 'utf8'))
    config = { ...config, ...local }
  }

  // Overlay remote config (from shared git repo if configured)
  const remoteRepo = process.env.QG_REMOTE_REPO || config.remote || ''
  if (remoteRepo) {
    const remoteConfig = fetchRemoteConfig(remoteRepo, config.remoteRef || 'main')
    if (remoteConfig) {
      config = { ...config, ...remoteConfig }
    }
  }

  return config
}

function fetchRemoteConfig(repo, ref) {
  const configDir = path.join(CONFIG_HOME, 'remote-config')
  try {
    if (fs.existsSync(configDir)) {
      execSync('git pull --ff-only', { cwd: configDir, stdio: 'ignore', timeout: 10000 })
    } else {
      execSync(`git clone --depth 1 --branch ${ref} ${repo} ${configDir}`, { stdio: 'ignore', timeout: 30000 })
    }
    const configPath = path.join(configDir, 'quality-gate-config.yml')
    if (fs.existsSync(configPath)) {
      return parseYaml(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (e) {
    // Remote config is optional, fail silently
  }
  return null
}

module.exports = { loadConfig, CONFIG_HOME }
