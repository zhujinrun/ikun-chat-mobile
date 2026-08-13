#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const tests = []
const suiteStack = []

const storage = new Map()
const asyncStorage = {
  getItem: async (key) => storage.get(key) ?? null,
  setItem: async (key, value) => {
    storage.set(key, value)
  },
  removeItem: async (key) => {
    storage.delete(key)
  },
  multiGet: async (keys) => keys.map((key) => [key, storage.get(key) ?? null]),
  multiSet: async (entries) => {
    for (const [key, value] of entries) storage.set(key, value)
  },
  multiRemove: async (keys) => {
    for (const key of keys) storage.delete(key)
  },
  clear: async () => {
    storage.clear()
  },
}

global.__mockAsyncStorage = {
  storage,
  reset: () => storage.clear(),
}

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'src', request.slice(2)),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') {
    return { __esModule: true, default: asyncStorage, ...asyncStorage }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const compileTypeScript = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
  })
  module._compile(result.outputText, filename)
}

require.extensions['.ts'] = compileTypeScript
require.extensions['.tsx'] = compileTypeScript

global.describe = (name, fn) => {
  suiteStack.push({ name, beforeEach: [], afterEach: [] })
  try {
    fn()
  } finally {
    suiteStack.pop()
  }
}

global.beforeEach = (fn) => {
  const suite = suiteStack[suiteStack.length - 1]
  if (!suite) throw new Error('beforeEach must be called inside describe')
  suite.beforeEach.push(fn)
}

global.afterEach = (fn) => {
  const suite = suiteStack[suiteStack.length - 1]
  if (!suite) throw new Error('afterEach must be called inside describe')
  suite.afterEach.push(fn)
}

global.it = global.test = (name, fn) => {
  tests.push({
    name: [...suiteStack.map((suite) => suite.name), name].join(' > '),
    beforeEach: suiteStack.flatMap((suite) => suite.beforeEach),
    afterEach: suiteStack.flatMap((suite) => suite.afterEach).reverse(),
    fn,
  })
}

const findTests = (dir) => {
  if (!fs.existsSync(dir)) return []
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...findTests(fullPath))
    } else if (/\.(test|spec)\.tsx?$/.test(entry.name)) {
      result.push(fullPath)
    }
  }
  return result
}

const run = async () => {
  const files = findTests(path.join(projectRoot, 'src')).sort()
  if (!files.length) {
    console.log('No test files found.')
    return
  }

  for (const file of files) require(file)

  let failed = 0
  for (const item of tests) {
    try {
      for (const setup of item.beforeEach) await setup()
      await item.fn()
      console.log(`PASS ${item.name}`)
    } catch (err) {
      failed += 1
      console.error(`FAIL ${item.name}`)
      console.error(err)
    } finally {
      for (const cleanup of item.afterEach) await cleanup()
    }
  }

  console.log(`\n${tests.length - failed}/${tests.length} tests passed`)
  if (failed) process.exitCode = 1
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
