import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'

export const name = 'think-like-codex'
export const inject = [ 'systemPrompt', 'goals', 'tools' ]

export const Config = z.object({
  autoPlan: z.boolean().default(true),
  complexityMinChars: z.number().default(120),
  stepReminderAt: z.number().default(12),
  stepReminderEvery: z.number().default(8),
  planCheckpointToolAt: z.number().default(8),
  planHardToolLimit: z.number().default(12),
  enforceGoalAfterPlan: z.boolean().default(true),
  failureReminderCount: z.number().default(2),
})

const MUTATION_WORDS = [
  '开发', '实现', '修复', '修改', '重构', '迁移', '部署', '发布', '新增', '删除',
  '配置', '搭建', '接入', '替换', '升级', '优化', '改造', '生成代码',
  'implement', 'fix', 'refactor', 'migrate', 'deploy', 'release', 'build', 'add',
]

const WORK_WORDS = [
  ...MUTATION_WORDS,
  '分析', '设计', '排查', '验证', '测试', '检查', '更新', '规划',
  'analyze', 'design', 'investigate', 'verify', 'test', 'update', 'plan',
]

const STRONG_COMPLEXITY = [
  '复杂任务', '长任务', '端到端', '全面检查', '全面分析', '全面修复', '完整链路',
  '从头到尾', '分阶段', '多个文件', '多模块', '前后端', '数据库迁移',
  'complex task', 'long-running', 'end-to-end', 'multiple files', 'multi-step',
]

const EXPLICIT_PLAN_MARKERS = [
  '修复计划', '实施计划', '执行计划', '制定计划', '指定计划', '先列计划', '先做计划',
  '先规划', '规划后执行', '方案并实现', '计划并执行', 'plan and implement', 'implementation plan',
]

const DIRECT_EXECUTION_HINTS = [
  '只回答', '简单回答', '快速回答', '简洁回答', '不要修改', '不修改文件', '只读',
  '不用计划', '不要计划', '无需计划', '不要执行', '只分析', '只检查',
  'answer only', 'do not modify', 'read only', 'no plan', 'do not execute',
]

const PLAN_DECISION_TOOLS = new Set([
  'ask_user_question', 'exit_plan_mode',
])

const WORKFLOW_TOOLS = new Set([
  'create_goal', 'get_goal', 'update_goal', 'todo_write',
])

const MUTATING_TOOLS = new Set([
  'edit', 'write', 'apply_patch', 'create_file', 'delete_file', 'move_file',
  'fs_write', 'fs_edit', 'fs_delete', 'deploy', 'release', 'wrangler',
])

const POLICY = `## Think Like Codex

你是一个可靠、克制、善于协作的编码智能体。内部完成充分推理，但不要向用户倾倒原始思维链；只给出结论、关键依据、计划、进度和需要用户决定的事项。

### 工作方式

- 先理解用户真正要达成的结果、工作区规则和现有实现，再行动。能从代码、配置、日志或文档查明的事实自己查，不把可发现的问题反问用户。
- 主动推进安全且在范围内的工作；涉及会改变目标、外部状态、生产数据或用户偏好的重要选择时，说明证据并询问用户。
- 使用简短进度消息保持协作；最终回复先说结果，再说验证和仍需注意的事项。不要夸大完成度，不要虚构验证结果。
- 区分“已观察事实 / 基于事实的推断 / 尚未验证的假设”。只有复现问题或建立直接因果证据后才能宣称“已定位根因”；当前现象与用户描述矛盾时，做一次直接验证和一次有区分度的对照即可，然后带着证据向用户确认，不得编造“间歇性”“瞬时状态”等不可证伪解释。
- 每次只维护一个主假设。发现与当前目标无关的有趣问题时记录为旁支，不要转而深挖。已经决定“询问用户 / 提交计划 / 开始修改 / 完成汇报”后立即执行该动作，不得在同一步中反复用“等等、再想想、最后再确认”推翻决定。

### 复杂任务必须先规划并建立 goal

- 复杂任务包括多文件或多模块改动、迁移、部署、重构、端到端功能、调查后修复，或明显需要多个阶段才能完成的任务。
- 本插件会对保守识别出的复杂改动自动开启 DSH Plan mode。Plan mode 中只做只读探索并通过 exit_plan_mode 提交完整计划，计划获批前不得修改环境。
- 计划获批后的第一组动作必须先调用 create_goal 创建一个可验收的持久目标，再调用 todo_write 列出具体执行步骤，然后才开始写代码或改变环境。已有活动 goal 时先读取并继续它，不重复创建。
- 每完成一个步骤就立即更新 todo；只有目标真实完成且关键路径已经验证，才把 goal 标为 complete。不要因为任务困难或接近轮次上限而虚假完成。
- Plan mode 的目标是消除会改变方案的未知量，不是写调查报告。优先并行读取入口、相邻实现和约束；通常 4–8 个有信息增益的动作就应形成方案。计划必须写清范围、关键改动、验收和风险，避免把未经证实的猜测包装成结论。

### 避免钻牛角尖

- 每次工具调用都必须回答一个明确问题。结果已经足够支持决定时停止探索，进入修改、验证或汇报。
- 同一假设或阻碍连续失败两次后，先总结已知事实并换一种有信息增益的方法。若缺少的是用户选择、凭据、外部权限、真实设备反馈或无法从环境发现的信息，立即使用 ask_user_question 主动求助；没有该工具时直接询问并停止继续试错。
- 一次验证失败后最多做一次针对性对照。仍不能确认时如实说明测试环境限制，把决定交给用户。不要用大量近似命令、刷新、截图或时序脚本反复证明同一件事。
- 尊重用户的“停止测试”“只回答”“不要部署”等边界；收到纠正后立即收缩范围，不为已经被用户实测确认的现象继续寻找问题。
- 当一次直接检查已经否定当前假设时，只有能区分两个具体解释的对照才值得继续；禁止为了获得心理确定感而枚举 URL、语言、UA、时间点或相似项目。若用户的一条真实反馈能比更多工具调用更快消除歧义，立即求助。

### 规范化生成代码

- 写代码前阅读相邻实现和项目约定，复用现有模式、命名和抽象；保持最小且聚焦的 diff，不顺手重构无关代码。
- 修改前确认工作区已有改动，保留用户和其他协作者的工作。不得擅自覆盖、回滚或删除不属于当前任务的内容。
- 代码必须完整、可运行、无占位实现；注释解释原因与约束，不复述语法，并遵循项目指定的注释语言。
- 不把凭据、令牌或隐私数据写进源码、日志、补丁、提交或回复；即使用户在对话中提供，也只按任务所需安全使用。
- 验证与风险成比例：通常做到语法检查、构建通过、关键路径一次验证即可。视觉时序以真实浏览器反馈为准，不在无头环境过度复测。
- 标准执行闭环是：确认工作区状态与相邻模式 → 做最小修改 → 查看聚焦 diff → 语法或构建检查 → 一次关键路径验证 → 汇报。验证失败时只做一次针对性修正；不要在核心验收已通过后继续增加近似测试。
`

function resolveConfig(config = {}) {
  const resolved = {
    autoPlan: config.autoPlan ?? true,
    complexityMinChars: config.complexityMinChars ?? 120,
    stepReminderAt: config.stepReminderAt ?? 12,
    stepReminderEvery: config.stepReminderEvery ?? 8,
    planCheckpointToolAt: config.planCheckpointToolAt ?? 8,
    planHardToolLimit: config.planHardToolLimit ?? 12,
    enforceGoalAfterPlan: config.enforceGoalAfterPlan ?? true,
    failureReminderCount: config.failureReminderCount ?? 2,
  }

  for (const key of [
    'complexityMinChars', 'stepReminderAt', 'stepReminderEvery',
    'planCheckpointToolAt', 'planHardToolLimit', 'failureReminderCount',
  ]) {
    if (!Number.isSafeInteger(resolved[key]) || resolved[key] < 1) {
      throw new TypeError(`think-like-codex: ${key} 必须是正整数`)
    }
  }
  if (resolved.planCheckpointToolAt >= resolved.planHardToolLimit) {
    throw new TypeError('think-like-codex: planCheckpointToolAt 必须小于 planHardToolLimit')
  }
  return resolved
}

function messageText(message) {
  return (message?.content || [])
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function countMatchedWords(text, words) {
  const lower = text.toLowerCase()
  return words.reduce((count, word) => count + (lower.includes(word.toLowerCase()) ? 1 : 0), 0)
}

/**
 * 保守识别需要设计评审的复杂改动，避免把简单问答强行送入 Plan mode。
 */
export function isComplexTask(text, minimumChars = 120) {
  const normalized = text.trim()
  if (!normalized || DIRECT_EXECUTION_HINTS.some(hint => normalized.toLowerCase().includes(hint.toLowerCase()))) {
    return false
  }

  const mutations = countMatchedWords(normalized, MUTATION_WORDS)
  if (mutations === 0) return false

  const workKinds = countMatchedWords(normalized, WORK_WORDS)
  const hasStrongMarker = STRONG_COMPLEXITY.some(marker => normalized.toLowerCase().includes(marker.toLowerCase()))
  const hasExplicitPlan = EXPLICIT_PLAN_MARKERS.some(marker => normalized.toLowerCase().includes(marker.toLowerCase()))
  const listItems = (normalized.match(/(?:^|\n)\s*(?:[-*]|\d+[.)、])/g) || []).length
  const stagedLanguage = /先.{0,80}(?:再|然后|随后|最后)|(?:同时|并且).{0,80}(?:验证|测试|部署|迁移|修复)/s.test(normalized)

  return hasStrongMarker || hasExplicitPlan ||
    (normalized.length >= minimumChars && workKinds >= 2) ||
    (listItems >= 3 && workKinds >= 2) ||
    (stagedLanguage && workKinds >= 2)
}

export function shouldRemindAtStep(step, firstStep, interval) {
  return step >= firstStep && (step - firstStep) % interval === 0
}

function notice(text, summary) {
  return createUserMessage({
    content: [ { type: 'text', text } ],
    source: {
      kind: 'plugin',
      plugin: name,
      form: 'notice',
      summary,
    },
  })
}

function appendContext(decision, context) {
  if (decision.kind === 'reject') return decision
  return {
    ...decision,
    messages: [ ...decision.messages, context ],
  }
}

function failureKey(result) {
  if (!result.isError) return undefined
  const code = result.error?.info?.code
  if (code) return `code:${code}`
  const message = result.error?.message || 'unknown tool failure'
  return `message:${message.toLowerCase().replace(/\d+/g, '#').slice(0, 180)}`
}

function loggedPlanState(agent) {
  const events = agent.session?.events || []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'plan/mode' && typeof event.data?.active === 'boolean') {
      return event.data.active
    }
  }
  return false
}

function planState(agent) {
  const planMode = agent.ctx?.get?.('planMode')
  const state = planMode?.get?.(agent)
  const scopedState = state?.pending ?? state?.active
  return {
    controller: planMode,
    // `/plan` 可以在 agent scope 建立前写入 session；服务不可见时从日志折叠恢复。
    active: typeof scopedState === 'boolean' ? scopedState : loggedPlanState(agent),
  }
}

function workflowState(states, agent) {
  let state = states.get(agent)
  if (!state) {
    state = {
      complex: false,
      planWasActive: false,
      requiresGoal: false,
      planToolCalls: 0,
      planCheckpointSent: false,
      step: 0,
      turn: 0,
    }
    states.set(agent, state)
  }
  return state
}

function isMutationTool(exec) {
  if (MUTATING_TOOLS.has(exec.name)) return true
  if (exec.name !== 'bash') return false

  const command = typeof exec.arguments?.command === 'string' ? exec.arguments.command : ''
  return /(?:^|[;&|]\s*)(?:git\s+(?:commit|push|tag|merge|rebase)|wrangler\s+(?:deploy|pages\s+deploy)|npm\s+publish|pnpm\s+publish|rm\s|mv\s|cp\s|mkdir\s|touch\s|chmod\s)|(?:^|\s)(?:>|>>)\s*[^&]/m.test(command)
}

function hasTodoAfterGoal(agent, goalId) {
  const events = agent.session?.events || []
  let goalIndex = -1
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event.type === 'goal/change' && event.data?.goal?.id === goalId && event.data?.operation === 'create') {
      goalIndex = index
    }
  }
  if (goalIndex < 0) return false
  return events.slice(goalIndex + 1).some(event => event.type === 'todo/write')
}

export function apply(ctx, config) {
  const resolved = resolveConfig(config)
  const failures = new WeakMap()
  const workflows = new WeakMap()

  ctx.systemPrompt.section({
    name: 'policy:think-like-codex',
    order: 45,
    text: POLICY,
  })

  ctx.on('agent/pre-step', async ({ agent, messages, turn, step, signal }, next) => {
    const workflow = workflowState(workflows, agent)
    workflow.turn = turn
    workflow.step = step

    const directHumanText = messages
      .filter(message => message.source?.kind === 'user')
      .map(messageText)
      .filter(Boolean)
      .join('\n')

    if (directHumanText) {
      failures.delete(agent)
      workflow.planToolCalls = 0
      workflow.planCheckpointSent = false
    }

    const currentGoal = ctx.get('goals')?.get?.(agent)
    const currentPlan = planState(agent)
    if (directHumanText && currentGoal?.phase === 'complete' && !currentPlan.active) {
      workflow.planWasActive = false
      workflow.requiresGoal = false
    }

    const complexRequest = isComplexTask(directHumanText, resolved.complexityMinChars)
    if (directHumanText && !workflow.planWasActive && !workflow.requiresGoal) {
      workflow.complex = complexRequest
    }

    if (resolved.autoPlan && step === 1 && complexRequest) {
      // PlanMode 位于 agent preset 的作用域中，必须从 agent.ctx 动态解析。
      if (currentPlan.controller && (!currentGoal || currentGoal.phase !== 'active')) {
        currentPlan.controller.set(agent, true)
        workflow.complex = true
        workflow.planWasActive = true
      }
    }

    const effectivePlan = planState(agent).active
    if (effectivePlan) workflow.planWasActive = true
    if (workflow.planWasActive && !effectivePlan && currentGoal?.phase !== 'active') {
      workflow.requiresGoal = true
    }

    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || !shouldRemindAtStep(step, resolved.stepReminderAt, resolved.stepReminderEvery)) {
      return decision
    }

    return appendContext(decision, notice(
      `<think_like_codex_checkpoint>\n当前回合已进行 ${step} 个步骤。现在必须收敛，下一步只能选择一种：①已有证据足够，立即修改或提交计划；②只做一次能区分具体假设的检查；③缺少用户选择、权限、凭据、真实设备反馈或外部状态，立即使用 ask_user_question；④关键验收已通过，立即汇报。禁止继续枚举相似可能、近似命令或额外验证，也不要在决定后用“等等/再想想”重新扩张。\n</think_like_codex_checkpoint>`,
      `第 ${step} 步止损检查`,
    ))
  }, { prepend: true })

  ctx.on('tools/pre-execute', async (exec, next) => {
    const downstream = await next()
    if (downstream.kind !== 'allow' || !exec.agent || exec.parent) return downstream

    const workflow = workflowState(workflows, exec.agent)
    const currentPlan = planState(exec.agent).active

    if (resolved.enforceGoalAfterPlan && workflow.requiresGoal && isMutationTool(exec) && !WORKFLOW_TOOLS.has(exec.name)) {
      const goal = ctx.get('goals')?.get?.(exec.agent)
      if (!goal || goal.phase !== 'active') {
        return {
          kind: 'deny',
          reason: 'think-like-codex：复杂任务的计划已经通过。修改环境前必须先调用 create_goal 建立可验收目标，再调用 todo_write 列出执行步骤。',
        }
      }
      if (!hasTodoAfterGoal(exec.agent, goal.id)) {
        return {
          kind: 'deny',
          reason: 'think-like-codex：活动 goal 已建立，但尚未在该 goal 后调用 todo_write。请先列出执行步骤，再修改代码或外部状态。',
        }
      }
    }

    if (!currentPlan || PLAN_DECISION_TOOLS.has(exec.name)) return downstream
    if (workflow.planToolCalls >= resolved.planHardToolLimit) {
      return {
        kind: 'deny',
        reason: `think-like-codex：Plan mode 已使用 ${workflow.planToolCalls} 个探索工具，预算已耗尽。现在只能调用 exit_plan_mode 提交证据充分的计划，或调用 ask_user_question 请求缺失信息；不要继续 read/grep/bash/web 等扩张式排查。`,
      }
    }
    workflow.planToolCalls += 1
    return downstream
  }, { prepend: true })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    const agent = exec.agent
    if (!agent) return downstream

    const additional = []
    const workflow = workflowState(workflows, agent)
    if (!exec.parent && !result.isError && exec.name === 'exit_plan_mode') {
      workflow.planWasActive = true
      workflow.requiresGoal = true
      workflow.planToolCalls = 0
      workflow.planCheckpointSent = false
    }

    if (
      !exec.parent &&
      planState(agent).active &&
      !workflow.planCheckpointSent &&
      workflow.planToolCalls >= resolved.planCheckpointToolAt
    ) {
      workflow.planCheckpointSent = true
      additional.push(notice(
        `<think_like_codex_plan_budget>\nPlan mode 已使用 ${workflow.planToolCalls}/${resolved.planHardToolLimit} 个探索工具。不要再扩大问题空间：整理已确认事实、关键未知量和最小可执行方案。下一步优先调用 exit_plan_mode；若唯一缺口只能由用户提供，调用 ask_user_question。达到上限后其他探索工具会被拒绝。\n</think_like_codex_plan_budget>`,
        `Plan 探索预算 ${workflow.planToolCalls}/${resolved.planHardToolLimit}`,
      ))
    }

    const key = failureKey(result)
    if (!key) {
      failures.delete(agent)
    } else {
      const previous = failures.get(agent)
      const count = previous?.key === key ? previous.count + 1 : 1
      failures.set(agent, { key, count })
      if (count === resolved.failureReminderCount) {
        additional.push(notice(
          `<think_like_codex_blocker>\n已连续 ${count} 次遇到同一类工具失败。不要再用近似参数重复尝试。先总结已经确认的事实；若存在一个不同且能改变判断的诊断，只做那一次。若阻碍来自用户选择、凭据、权限、未启动的服务、真实浏览器或其他外部状态，请立即使用 ask_user_question 说明已尝试内容和具体需要。\n</think_like_codex_blocker>`,
          `连续 ${count} 次同类失败`,
        ))
      }
    }

    if (additional.length === 0) return downstream

    if (downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: [ ...additional, ...(downstream.additionalContexts || []) ],
      }
    }
    return {
      ...downstream,
      additionalContexts: [ ...additional, ...(downstream.additionalContexts || []) ],
    }
  })
}
