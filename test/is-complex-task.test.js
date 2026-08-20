import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, isComplexTask, shouldRemindAtStep } from '../index.js'

const COMPLEX_PAIRS = [
  [
    'Please update the authentication flow, then add regression tests and verify the full end-to-end workflow.',
    '请更新认证流程，然后补充回归测试并验证完整的端到端链路。',
  ],
  [
    'Create an implementation plan before changing the API and migrating existing clients.',
    '修改 API 并迁移现有客户端之前，请先制定实施计划。',
  ],
  [
    'This is a multi-file refactor: redesign the service boundary, update callers, and test the migration.',
    '这是一个多文件重构：重新设计服务边界、更新调用方并测试迁移流程。',
  ],
  [
    '- Update the profile loader\n- Add compatibility handling\n- Test the release path',
    '- 更新 profile loader\n- 增加兼容处理\n- 测试发布链路',
  ],
]

test('recognizes equivalent complex requests in English and Chinese', () => {
  for (const pair of COMPLEX_PAIRS) {
    for (const request of pair) assert.equal(isComplexTask(request), true, request)
  }
})

test('recognizes English action morphology', () => {
  assert.equal(
    isComplexTask('We are updating multiple modules, modifying the loader, and testing the complete workflow.'),
    true,
  )
  assert.equal(
    isComplexTask('Investigate the failure, create a fix, and verify it across multiple files.'),
    true,
  )
})

test('keeps simple and explicitly read-only requests out of Plan mode', () => {
  for (const request of [
    'Fix the typo.',
    '修复这个错别字。',
    'What does this function do?',
    '这个函数是做什么的？',
    'Read only: analyze this stack trace and answer briefly.',
    '只读：分析这个错误栈并简洁回答。',
    'Update the service without a plan.',
    '更新这个服务，不要计划。',
    'Please address the question.',
  ]) {
    assert.equal(isComplexTask(request), false, request)
  }
})

test('does not treat a scoped exclusion as a global read-only override', () => {
  assert.equal(
    isComplexTask('Do not modify documentation; update the authentication middleware, add regression tests, and verify the end-to-end login flow.'),
    true,
  )
  assert.equal(
    isComplexTask('不要修改文档；请更新认证中间件、增加回归测试并验证端到端登录流程。'),
    true,
  )
})

test('injects policy guidance in both English and Chinese', () => {
  let section
  apply({
    systemPrompt: { section(value) { section = value } },
    on() {},
  }, {})

  assert.equal(section.name, 'policy:think-like-codex')
  assert.match(section.text, /Match the user's language/)
  assert.match(section.text, /默认使用用户所用的语言回复/)
  assert.match(section.text, /Complex tasks require a plan and goal/)
  assert.match(section.text, /复杂任务必须先规划并建立 goal/)
})

test('automatically enters Plan mode for complex English and Chinese user turns', async () => {
  const handlers = new Map()
  const planStates = new WeakMap()
  const planMode = {
    get(agent) { return { active: planStates.get(agent) || false } },
    set(agent, active) { planStates.set(agent, active) },
  }
  const context = {
    systemPrompt: { section() {} },
    get(key) {
      if (key === 'goals') return { get() { return undefined } }
      return undefined
    },
    on(event, handler) { handlers.set(event, handler) },
  }
  apply(context, {})

  for (const text of [
    'Please update the authentication flow, then add regression tests and verify the full end-to-end workflow.',
    '请更新认证流程，然后补充回归测试并验证完整的端到端链路。',
  ]) {
    const agent = {
      ctx: { get(key) { return key === 'planMode' ? planMode : undefined } },
      session: { events: [] },
    }
    await handlers.get('agent/pre-step')({
      agent,
      messages: [ {
        source: { kind: 'user' },
        content: [ { type: 'text', text } ],
      } ],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }, async () => ({ kind: 'allow', messages: [] }))
    assert.equal(planStates.get(agent), true, text)
  }
})

test('keeps reminder cadence deterministic', () => {
  assert.equal(shouldRemindAtStep(12, 12, 8), true)
  assert.equal(shouldRemindAtStep(20, 12, 8), true)
  assert.equal(shouldRemindAtStep(19, 12, 8), false)
})
