import { test, expect } from 'claude-code/testing'

const setup = (on: any) => {
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'PR 리뷰', type: 'reviewer', status: 'completed' }] }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__progress-band__${e.name}` } }))
  return toasts
}

const turn = (extra: object) =>
  ({ answer: 'ok', durationMs: 4 * 60000, isAborted: false, turnId: 't', reason: 'answer', text: 'ok', ...extra }) as never

test('서브에이전트가 끝나면 이름과 걸린 시간으로 알림', async ($, on) => {
  const toasts = setup(on)
  await $.turn.complete(turn({ agentId: 'a1' }))
  expect(toasts).toEqual(['✓ PR 리뷰 완료 · 4m'])
})

test('1분 미만은 초 단위로 표시', async ($, on) => {
  const toasts = setup(on)
  await $.turn.complete(turn({ agentId: 'a1', durationMs: 1636 }))
  expect(toasts).toEqual(['✓ PR 리뷰 완료 · 2s'])
})

test('메인 세션 턴이 끝날 때는 알리지 않음', async ($, on) => {
  const toasts = setup(on)
  await $.turn.complete(turn({}))
  expect(toasts).toEqual([])
})

test('이름 조회가 실패해도 알림은 뜸', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ deny: 'gone' }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete(turn({ agentId: 'a1', durationMs: 3000 }))
  expect(toasts).toEqual(['✓ subagent 완료 · 3s'])
})

test('완료 줄을 대화 기록에도 남김', async ($, on) => {
  const logs: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', (_$: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'PR 리뷰', type: 'reviewer', status: 'completed' }] }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete(turn({ agentId: 'a1' }))
  expect(logs).toEqual(['✓ PR 리뷰 완료 · 4m'])
})
