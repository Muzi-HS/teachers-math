import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

const context = { exports: {}, require: createRequire(import.meta.url) }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/sms-compose.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context)
const { parentPhone, unreadStudentIds, smsComposeUrl } = context.exports

test('student and parent recipients use separate numbers; notices always target parents', () => {
  const student = { phone: '010-1111-2222', parent_phone: '010-3333-4444' }
  assert.equal(context.exports.recipientPhone(student, 'student'), '01011112222')
  assert.equal(context.exports.recipientPhone(student, 'parent'), '01033334444')
  assert.equal(context.exports.recipientPhone(student, 'student', true), '01033334444')
  assert.equal(context.exports.recipientPhone({ ...student, phone: null }, 'student'), null)
  assert.equal(context.exports.recipientPhone({ ...student, parent_phone: null }, 'student', true), null)
})

test('normalizes parent mobile numbers and rejects missing or malformed numbers', () => {
  assert.equal(parentPhone('010-1234-5678'), '01012345678')
  assert.equal(parentPhone('+82 10 1234 5678'), '01012345678')
  for (const phone of [null, '', '02-1234-5678', '010123', '01012345678?body=bad']) assert.equal(parentPhone(phone), null)
})
test('unread recipients exclude read students, non-targets, and students outside the directory', () => {
  assert.deepEqual(Array.from(unreadStudentIds([1,2,3], [2,3,99], [3])), [2])
  assert.deepEqual(Array.from(unreadStudentIds([1,2,3], [], [2])), [1,3])
  assert.deepEqual(Array.from(unreadStudentIds([1,2], [99], [])), [])
  assert.deepEqual(Array.from(unreadStudentIds([1,2], [], [1,2])), [])
})
test('compose links deduplicate recipients and preserve Korean and special characters', () => {
  const message = '공지 확인 부탁드립니다.\nA&B? #1'
  const phones = ['010-1234-5678', '01012345678', '01022223333']
  assert.equal(smsComposeUrl(phones, message, false), `sms:01012345678;01022223333?body=${encodeURIComponent(message)}`)
  assert.equal(smsComposeUrl(phones, message, true), `sms://open?addresses=01012345678,01022223333&body=${encodeURIComponent(message)}`)
  assert.equal(smsComposeUrl(['010-1234-5678', '01012345678'], message, true), `sms:01012345678&body=${encodeURIComponent(message)}`)
  assert.equal(smsComposeUrl(['01012345678'], message, false), `sms:01012345678?body=${encodeURIComponent(message)}`)
  assert.throws(() => smsComposeUrl([], message, false))
  assert.throws(() => smsComposeUrl(phones, '  ', false))
})
