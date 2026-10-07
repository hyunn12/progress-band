import { test, expect, mock } from 'claude-code/testing'

const STEPS = [
  { label: '설계', state: 'done' },
  { label: '구현', state: 'done' },
  { label: '테스트', state: 'now' },
  { label: '리뷰', state: 'left' },
  { label: '배포', state: 'left' },
]

const setup = async ($: any, on: any) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: `mcp__progress-band__${e.name}` } }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const call = (steps: unknown) => $.tool.call({ tool: 'mcp__progress-band__progress', steps } as never)
  const mount = (surface: 'terminal' | 'desktop', bodyColumns: number) =>
    $.ui.mount({ plugin: 'progress-band', surface, component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns } as never })
  return { clock, toasts, call, mount }
}

test('넓은 창에서는 모든 단계와 진행 중 단계의 경과 분을 표시', async ($, on) => {
  const { clock, call, mount } = await setup($, on)
  await call(STEPS)
  await clock.advance(5 * 60000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount(surface, 200)
    expect(await ui.find({ type: 'Text', text: /✓ 설계/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● 테스트 · 5m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ 배포/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/5/ })).toBeDefined()
    await ui.unmount()
  }
})

test('좁은 창에서는 완료 단계를 개수로 접고 다음 단계 하나만 표시', async ($, on) => {
  const { call, mount } = await setup($, on)
  await call(STEPS)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount(surface, 30)
    expect(await ui.find({ type: 'Text', text: /✓×2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● 테스트/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ 리뷰/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ 설계/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /배포/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('단계가 새로 막히면 한 번만 알림', async ($, on) => {
  const { toasts, call } = await setup($, on)
  await call(STEPS)
  const blocked = STEPS.map(s => (s.label === '테스트' ? { ...s, state: 'blocked' } : s))
  await call(blocked)
  await call(blocked)
  expect(toasts).toEqual(['! 테스트'])
})

test('진행 중 단계가 바뀌면 경과 시간을 새로 셈', async ($, on) => {
  const { clock, call, mount } = await setup($, on)
  await call(STEPS)
  await clock.advance(10 * 60000)
  await call(STEPS.map(s => (s.label === '테스트' ? { ...s, state: 'done' } : s.label === '리뷰' ? { ...s, state: 'now' } : s)))
  await clock.advance(2 * 60000)
  const ui = await mount('terminal', 200)
  expect(await ui.find({ type: 'Text', text: /● 리뷰 · 2m/ })).toBeDefined()
  await ui.unmount()
})
