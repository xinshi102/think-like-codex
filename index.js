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
  '配置', '搭建', '接入', '替换', '升级', '优化', '改造', '生成代码', '更新',
  'implement', 'fix', 'refactor', 'migrate', 'deploy', 'release', 'build', 'add',
  'change', 'modify', 'edit', 'create', 'delete', 'remove', 'replace', 'integrate',
  'configure', 'set up', 'setup', 'upgrade', 'optimize', 'improve', 'redesign',
  'rewrite', 'generate code', 'update',
]

const WORK_WORDS = [
  ...MUTATION_WORDS,
  '分析', '设计', '排查', '验证', '测试', '检查', '更新', '规划',
  'analyze', 'design', 'investigate', 'verify', 'test', 'plan', 'review', 'audit',
  'inspect', 'debug', 'diagnose', 'troubleshoot', 'research',
]

const STRONG_COMPLEXITY = [
  '复杂任务', '长任务', '端到端', '全面检查', '全面分析', '全面修复', '完整链路',
  '从头到尾', '分阶段', '多个文件', '多文件', '多模块', '前后端', '数据库迁移',
  'complex task', 'long task', 'long-running', 'end-to-end', 'multiple files',
  'across multiple files', 'multi-file', 'multiple modules', 'multi-module',
  'multi-step', 'full workflow', 'complete workflow', 'full-stack',
  'frontend and backend', 'database migration', 'large refactor',
]

const EXPLICIT_PLAN_MARKERS = [
  '修复计划', '实施计划', '执行计划', '制定计划', '指定计划', '先列计划', '先做计划',
  '先规划', '规划后执行', '方案并实现', '计划并执行', 'plan and implement', 'implementation plan',
  'plan first', 'first make a plan', 'create a plan', 'make a plan',
  'plan before implementation', 'plan then implement', 'plan and execute',
  'planning and execution', 'step-by-step plan',
]

const DIRECT_EXECUTION_HINTS = [
  '只回答', '简单回答', '快速回答', '简洁回答', '不要修改', '不修改文件', '只读',
  '不用计划', '不要计划', '无需计划', '不要执行', '只分析', '只检查',
  'answer only', 'just answer', 'brief answer', 'do not modify', "don't modify",
  'do not change', "don't change", 'do not edit', "don't edit", 'read only',
  'read-only', 'no plan', 'no planning', 'skip planning', 'without a plan',
  'do not execute', "don't execute", 'analysis only', 'review only', 'only inspect',
]

const ABSOLUTE_DIRECT_EXECUTION_HINTS = [
  '不用计划', '不要计划', '无需计划', '不要执行',
  'no plan', 'no planning', 'skip planning', 'without a plan',
  'do not execute', "don't execute",
]

const ENGLISH_MUTATION_PATTERNS = [
  /\bimplement(?:s|ed|ing|ation)?\b/i,
  /\bfix(?:es|ed|ing)?\b/i,
  /\brefactor(?:s|ed|ing)?\b/i,
  /\bmigrat(?:e|es|ed|ing|ion)\b/i,
  /\bdeploy(?:s|ed|ing|ment)?\b/i,
  /\breleas(?:e|es|ed|ing)\b/i,
  /\b(?:build|builds|building|built)\b/i,
  /\badd(?:s|ed|ing)?\b/i,
  /\bchang(?:e|es|ed|ing)\b/i,
  /\bmodif(?:y|ies|ied|ying|ication|ications)\b/i,
  /\bedit(?:s|ed|ing)?\b/i,
  /\bcreat(?:e|es|ed|ing|ion)\b/i,
  /\bdelet(?:e|es|ed|ing|ion)\b/i,
  /\bremov(?:e|es|ed|ing|al)\b/i,
  /\breplac(?:e|es|ed|ing|ement)\b/i,
  /\bintegrat(?:e|es|ed|ing|ion)\b/i,
  /\bconfigur(?:e|es|ed|ing|ation)\b/i,
  /\bset[ -]?up\b/i,
  /\bupgrad(?:e|es|ed|ing)\b/i,
  /\boptimi[sz](?:e|es|ed|ing|ation)\b/i,
  /\bimprov(?:e|es|ed|ing|ement)\b/i,
  /\bredesign(?:s|ed|ing)?\b/i,
  /\brewrit(?:e|es|ten|ing)\b/i,
  /\bgenerat(?:e|es|ed|ing|ion)\b/i,
  /\bupdat(?:e|es|ed|ing)\b/i,
]

const ENGLISH_ANALYSIS_PATTERNS = [
  /\banaly[sz](?:e|es|ed|ing|is)\b/i,
  /\bdesign(?:s|ed|ing)?\b/i,
  /\binvestigat(?:e|es|ed|ing|ion)\b/i,
  /\bverif(?:y|ies|ied|ying|ication)\b/i,
  /\btest(?:s|ed|ing)?\b/i,
  /\bplan(?:s|ned|ning)?\b/i,
  /\breview(?:s|ed|ing)?\b/i,
  /\baudit(?:s|ed|ing)?\b/i,
  /\binspect(?:s|ed|ing|ion)?\b/i,
  /\bdebug(?:s|ged|ging)?\b/i,
  /\bdiagnos(?:e|es|ed|ing|is)\b/i,
  /\btroubleshoot(?:s|ing)?\b/i,
  /\bresearch(?:es|ed|ing)?\b/i,
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

Match the user's language unless they request another language. For mixed-language requests, follow the dominant language or the user's latest explicit preference.

You are a reliable, disciplined, and collaborative coding agent. Reason thoroughly in private, but do not expose raw chain-of-thought. Share outcomes, key evidence, plans, progress, and decisions that belong to the user.

### How to work

- Understand the user's intended outcome, workspace rules, and existing implementation before acting. Discover facts from code, configuration, logs, or documentation instead of asking the user questions the environment can answer.
- Proactively advance safe work that is within scope. Explain the evidence and ask the user before making a choice that materially changes the goal, external state, production data, or user preference.
- Keep the user informed with short progress updates. Lead the final response with the outcome, followed by verification and remaining caveats. Never exaggerate completion or invent test results.
- Distinguish observed facts, evidence-based inferences, and unverified assumptions. Claim a root cause only after reproducing the issue or establishing direct causal evidence. If observations conflict with the user's report, perform one direct check and one discriminating comparison, then ask the user with the evidence. Do not invent unfalsifiable explanations such as intermittent or transient behavior.
- Maintain one primary hypothesis at a time. Record unrelated findings as side issues instead of pursuing them. Once you decide to ask the user, submit a plan, start implementation, or report completion, perform that action immediately instead of repeatedly reopening the decision.

### Complex tasks require a plan and goal

- Complex tasks include multi-file or multi-module changes, migrations, deployments, refactors, end-to-end features, investigate-then-fix work, and anything that clearly requires several stages.
- This plugin conservatively detects complex changes and enters DSH Plan mode. In Plan mode, perform read-only exploration and submit the complete plan through exit_plan_mode. Do not mutate the environment before approval.
- After plan approval, the first actions must create an acceptance-oriented persistent goal with create_goal and list concrete steps with todo_write. Only then may code or external state be changed. If an active goal already exists, read and continue it instead of creating another.
- Update the todo list as each step completes. Mark the goal complete only when the objective is genuinely achieved and the critical path is verified. Never claim completion because the work is difficult or a turn limit is near.
- Plan mode exists to remove unknowns that would change the design, not to produce an investigation diary. Prefer parallel reads of entry points, adjacent implementations, and constraints. Usually 4–8 information-gaining actions should be enough. State scope, key changes, acceptance criteria, and risks without presenting guesses as facts.

### Avoid unproductive loops

- Every tool call must answer a specific question. When the evidence is sufficient for a decision, stop exploring and move to implementation, verification, or reporting.
- After the same hypothesis or obstacle fails twice, summarize known facts and choose a different method that can change the decision. If the missing input is a user choice, credential, external permission, real-device feedback, or information unavailable in the environment, use ask_user_question immediately. If that tool is unavailable, ask directly and stop retrying.
- After a validation failure, perform at most one targeted comparison. If the result remains inconclusive, explain the environment limitation and hand the decision to the user. Do not repeat similar commands, refreshes, screenshots, or timing scripts to prove the same point.
- Respect boundaries such as “stop testing”, “answer only”, and “do not deploy”. Narrow scope immediately after a correction and do not keep searching for problems in behavior the user has already verified.
- When a direct check disproves the current hypothesis, continue only with a comparison that distinguishes two concrete explanations. Do not enumerate URLs, languages, user agents, timestamps, or similar projects merely for psychological certainty. Ask the user whenever one real-world observation would resolve ambiguity faster than more tool calls.

### Generate code consistently

- Read adjacent implementations and project conventions before writing. Reuse existing patterns, naming, and abstractions. Keep the diff small and focused; do not refactor unrelated code.
- Check existing workspace changes before editing and preserve work owned by the user or other collaborators. Never overwrite, revert, or delete unrelated changes without authorization.
- Produce complete, runnable code without placeholder implementations. Comments should explain reasons and constraints rather than restating syntax, and must follow the project's requested language.
- Never place credentials, tokens, or private data in source code, logs, patches, commits, or responses.
- Make verification proportional to risk. Syntax checks, a successful build, and one critical-path verification are normally enough. Treat real-browser feedback as authoritative for visual timing instead of repeatedly testing animation timing in a headless environment.
- Use this execution loop: inspect workspace state and adjacent patterns → make the smallest change → review the focused diff → run syntax or build checks → verify the critical path once → report. If verification fails, make one targeted correction. Do not add similar tests after the core acceptance criteria pass.

## 中文说明

默认使用用户所用的语言回复；用户指定其他语言时遵循其选择。中英混合请求以主要语言或用户最新的明确偏好为准。

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
      throw new TypeError(`think-like-codex: ${key} must be a positive integer / 必须是正整数`)
    }
  }
  if (resolved.planCheckpointToolAt >= resolved.planHardToolLimit) {
    throw new TypeError('think-like-codex: planCheckpointToolAt must be less than planHardToolLimit / 必须小于 planHardToolLimit')
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsPhrase(text, phrase) {
  const lower = text.toLowerCase()
  const normalizedPhrase = phrase.toLowerCase()
  if (/[^\x00-\x7f]/.test(normalizedPhrase)) return lower.includes(normalizedPhrase)
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedPhrase)}(?:$|[^a-z0-9])`, 'i').test(lower)
}

function containsAnyPhrase(text, phrases) {
  return phrases.some(phrase => containsPhrase(text, phrase))
}

function countActionKinds(text, words, englishPatterns) {
  const cjkCount = words
    .filter(word => /[^\x00-\x7f]/.test(word))
    .reduce((count, word) => count + (containsPhrase(text, word) ? 1 : 0), 0)
  return cjkCount + englishPatterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}

function hasDirectExecutionOverride(text) {
  if (containsAnyPhrase(text, ABSOLUTE_DIRECT_EXECUTION_HINTS)) return true
  if (!containsAnyPhrase(text, DIRECT_EXECUTION_HINTS)) return false

  // Treat a read-only phrase as scoped when a separate clause still requests a mutation.
  // Example: “Do not modify docs; update the implementation and tests.”
  const clauses = text.split(/[\n,，;；。.!?！？]+/).map(clause => clause.trim()).filter(Boolean)
  return !clauses.some(clause =>
    !containsAnyPhrase(clause, DIRECT_EXECUTION_HINTS) &&
    countActionKinds(clause, MUTATION_WORDS, ENGLISH_MUTATION_PATTERNS) > 0
  )
}

/**
 * 保守识别需要设计评审的复杂改动，避免把简单问答强行送入 Plan mode。
 */
export function isComplexTask(text, minimumChars = 120) {
  const normalized = text.trim()
  if (!normalized || hasDirectExecutionOverride(normalized)) {
    return false
  }

  const mutations = countActionKinds(normalized, MUTATION_WORDS, ENGLISH_MUTATION_PATTERNS)
  if (mutations === 0) return false

  const workKinds = countActionKinds(
    normalized,
    WORK_WORDS,
    [ ...ENGLISH_MUTATION_PATTERNS, ...ENGLISH_ANALYSIS_PATTERNS ],
  )
  const hasStrongMarker = containsAnyPhrase(normalized, STRONG_COMPLEXITY)
  const hasExplicitPlan = containsAnyPhrase(normalized, EXPLICIT_PLAN_MARKERS)
  const listItems = (normalized.match(/(?:^|\n)\s*(?:[-*]|\d+[.)、])/g) || []).length
  const stagedLanguage =
    /先.{0,100}(?:再|然后|随后|最后)|(?:同时|并且).{0,100}(?:验证|测试|部署|迁移|修复|更新)/s.test(normalized) ||
    /\b(?:first|start by)\b[\s\S]{0,140}\b(?:then|next|after that|finally)\b/i.test(normalized) ||
    /\b(?:then|also|and)\b[\s\S]{0,100}\b(?:verify|test|deploy|migrate|fix|update)\b/i.test(normalized)

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
      `<think_like_codex_checkpoint>\nThis turn has reached step ${step}. Converge now and choose exactly one next action: (1) evidence is sufficient—implement or submit the plan; (2) run one check that distinguishes concrete hypotheses; (3) a user choice, permission, credential, real-device observation, or external state is missing—use ask_user_question now; or (4) critical acceptance has passed—report the result. Do not enumerate similar possibilities, near-duplicate commands, or extra validation, and do not reopen the decision with “wait” or “one more thought.”\n\n当前回合已进行 ${step} 个步骤。现在必须收敛，下一步只能选择一种：①已有证据足够，立即修改或提交计划；②只做一次能区分具体假设的检查；③缺少用户选择、权限、凭据、真实设备反馈或外部状态，立即使用 ask_user_question；④关键验收已通过，立即汇报。禁止继续枚举相似可能、近似命令或额外验证，也不要在决定后用“等等/再想想”重新扩张。\n</think_like_codex_checkpoint>`,
      `Step ${step} convergence check / 第 ${step} 步止损检查`,
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
          reason: 'think-like-codex: The complex-task plan is approved. Before mutating the environment, call create_goal with an acceptance-oriented objective, then call todo_write with the execution steps. / 复杂任务的计划已经通过。修改环境前必须先调用 create_goal 建立可验收目标，再调用 todo_write 列出执行步骤。',
        }
      }
      if (!hasTodoAfterGoal(exec.agent, goal.id)) {
        return {
          kind: 'deny',
          reason: 'think-like-codex: An active goal exists, but todo_write has not been called after that goal. List the execution steps before changing code or external state. / 活动 goal 已建立，但尚未在该 goal 后调用 todo_write。请先列出执行步骤，再修改代码或外部状态。',
        }
      }
    }

    if (!currentPlan || PLAN_DECISION_TOOLS.has(exec.name)) return downstream
    if (workflow.planToolCalls >= resolved.planHardToolLimit) {
      return {
        kind: 'deny',
        reason: `think-like-codex: Plan mode has used ${workflow.planToolCalls} exploration tools and the budget is exhausted. Call exit_plan_mode with an evidence-based plan, or call ask_user_question for missing information. Do not continue broad read/grep/bash/web exploration. / Plan mode 已使用 ${workflow.planToolCalls} 个探索工具，预算已耗尽。现在只能调用 exit_plan_mode 提交证据充分的计划，或调用 ask_user_question 请求缺失信息；不要继续扩张式排查。`,
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
        `<think_like_codex_plan_budget>\nPlan mode has used ${workflow.planToolCalls}/${resolved.planHardToolLimit} exploration tools. Stop expanding the problem space. Consolidate verified facts, decision-relevant unknowns, and the smallest executable design. Prefer exit_plan_mode next; if the only gap belongs to the user, call ask_user_question. Other exploration tools will be denied at the limit.\n\nPlan mode 已使用 ${workflow.planToolCalls}/${resolved.planHardToolLimit} 个探索工具。不要再扩大问题空间：整理已确认事实、关键未知量和最小可执行方案。下一步优先调用 exit_plan_mode；若唯一缺口只能由用户提供，调用 ask_user_question。达到上限后其他探索工具会被拒绝。\n</think_like_codex_plan_budget>`,
        `Plan exploration budget / 探索预算 ${workflow.planToolCalls}/${resolved.planHardToolLimit}`,
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
          `<think_like_codex_blocker>\nThe same class of tool failure has occurred ${count} times. Do not retry with near-identical arguments. Summarize verified facts first. If one different diagnostic could change the decision, run only that check. If the blocker is a user choice, credential, permission, service that is not running, real-browser observation, or other external state, use ask_user_question now and state what was tried and exactly what is needed.\n\n已连续 ${count} 次遇到同一类工具失败。不要再用近似参数重复尝试。先总结已经确认的事实；若存在一个不同且能改变判断的诊断，只做那一次。若阻碍来自用户选择、凭据、权限、未启动的服务、真实浏览器或其他外部状态，请立即使用 ask_user_question 说明已尝试内容和具体需要。\n</think_like_codex_blocker>`,
          `${count} repeated failures / 连续 ${count} 次同类失败`,
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
