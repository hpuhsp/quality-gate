// =============================================================================
// detect.js — Project type auto-detection (mirrors CI detect.sh logic)
// =============================================================================
const fs = require('fs')
const path = require('path')

function existsIn(dir, pattern, maxDepth = 3) {
  function walk(d, depth) {
    if (depth > maxDepth) return false
    try {
      const entries = fs.readdirSync(d)
      for (const e of entries) {
        if (e === '.git' || e === 'node_modules' || e === '.gradle') continue
        const full = path.join(d, e)
        if (e === pattern) return true
        try {
          if (fs.statSync(full).isDirectory() && walk(full, depth + 1)) return true
        } catch (_) {}
      }
    } catch (_) {}
    return false
  }
  return walk(dir, 0)
}

function detect(root) {
  const result = {
    language: 'unknown',
    buildTool: 'unknown',
    testFramework: 'unknown',
    hasTests: false,
    hasDockerfile: false
  }

  // Phase 1: Language detection
  if (existsIn(root, 'build.gradle.kts') || existsIn(root, '*.kt', 5)) {
    result.language = 'kotlin'
  } else if (existsIn(root, 'build.gradle') || existsIn(root, '*.java', 5)) {
    result.language = 'java'
  } else if (existsIn(root, 'package.json')) {
    result.language = 'javascript'
  } else if (existsIn(root, 'pyproject.toml') || existsIn(root, 'requirements.txt')) {
    result.language = 'python'
  }

  // Phase 2: Build tool
  if (result.language === 'kotlin' || result.language === 'java') {
    result.buildTool = fs.existsSync(path.join(root, 'gradlew')) ? 'gradle-wrapper' : 'gradle'
  } else if (result.language === 'javascript') {
    if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) result.buildTool = 'pnpm'
    else if (fs.existsSync(path.join(root, 'yarn.lock'))) result.buildTool = 'yarn'
    else result.buildTool = 'npm'
  }

  // Phase 3: Test framework
  if (result.language === 'kotlin' || result.language === 'java') {
    result.testFramework = 'JUnit5'
    result.hasTests = fs.existsSync(path.join(root, 'src', 'test'))
  } else if (result.language === 'javascript') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      const deps = { ...pkg.devDependencies, ...pkg.dependencies }
      if (deps.vitest) result.testFramework = 'Vitest'
      else if (deps.jest) result.testFramework = 'Jest'
      else if (deps.mocha) result.testFramework = 'Mocha'
    } catch (_) {}
    result.hasTests = fs.existsSync(path.join(root, 'test')) ||
                      fs.existsSync(path.join(root, '__tests__')) ||
                      fs.existsSync(path.join(root, 'src', '__tests__'))
  }

  // Phase 4: Dockerfile
  result.hasDockerfile = fs.existsSync(path.join(root, 'Dockerfile')) ||
                         fs.existsSync(path.join(root, 'docker', 'Dockerfile'))

  return result
}

module.exports = { detect, existsIn }
