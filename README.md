# think-like-codex

Codex 风格的 DeepSeek Harness（DSH）行为策略 Profile Bundle。它基于实际 session 中暴露出的长回合、过度验证、缺少 goal 和遇阻后持续试错问题，提供以下行为：

- 注入 Codex 风格的协作、代码生成、验证和安全规范；
- 识别复杂改动和明确要求“修复计划”的短请求，并自动切换到 DSH Plan mode；
- Plan mode 第 8 个探索工具时要求收敛，第 12 个达到硬上限后只允许提交计划或向用户求助；
- 计划获批后用工具执行闸门确保先创建 goal 和 todo，再修改代码或外部状态；
- 连续两次同类工具失败时提醒停止重复并主动向用户求助；
- 单回合从第 12 步起周期性注入更明确的决策检查；
- 强制区分事实、推断和假设，无法复现时最多做一次对照，然后请求用户提供真实场景。

## 配置

```yaml
- id: think-like-codex
  name: think-like-codex
  config:
    autoPlan: true
    complexityMinChars: 120
    stepReminderAt: 12
    stepReminderEvery: 8
    planCheckpointToolAt: 8
    planHardToolLimit: 12
    enforceGoalAfterPlan: true
    failureReminderCount: 2
```

简单问答、明确要求只读或不要修改的任务不会自动进入 Plan mode。用户仍可通过明确说“不要计划”覆盖自动识别。探索预算按每次用户直接补充重置，避免用户改变方向后没有必要的调查空间。

插件复用 DSH 自带的 `planMode`、`create_goal`、`todo_write`、`ask_user_question` 和 `repeat-tool-reminder`，不注册重复工具，也不直接修改会话文件。

## 安装

```bash
dsh plugin --profile web add -w think-like-codex
dsh --profile web
```

这是一个 Profile Bundle，安装后会通过包内的 `cordis.patch.yml` 自动挂载。要在其他 profile 使用，请把 `web` 替换为对应 profile 名称。宿主端代码更新后需要重启该 profile。

## 卸载

```bash
dsh plugin --profile web remove think-like-codex
```

## License

MIT
