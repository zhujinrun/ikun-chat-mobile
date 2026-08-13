import assert from 'node:assert/strict'
import { validateExtraHeaders } from './settingOptions'

declare const describe: (name: string, fn: () => void) => void
declare const it: (name: string, fn: () => void | Promise<void>) => void

describe('validateExtraHeaders', () => {
  it('accepts empty headers', () => {
    assert.equal(validateExtraHeaders(''), null)
    assert.equal(validateExtraHeaders('   '), null)
  })

  it('accepts a JSON object with string values', () => {
    assert.equal(validateExtraHeaders('{"X-Provider":"ikun","X-Trace":"abc"}'), null)
  })

  it('rejects invalid JSON', () => {
    assert.equal(validateExtraHeaders('{bad json}'), '额外请求头不是合法 JSON')
  })

  it('rejects non-object JSON values', () => {
    assert.equal(validateExtraHeaders('[]'), '额外请求头必须是 JSON 对象')
    assert.equal(validateExtraHeaders('null'), '额外请求头必须是 JSON 对象')
  })

  it('rejects blank header names and non-string values', () => {
    assert.equal(validateExtraHeaders('{"":"value"}'), '请求头名称不能为空')
    assert.equal(validateExtraHeaders('{"X-Retry":3}'), '请求头 X-Retry 的值必须是字符串')
  })
})
