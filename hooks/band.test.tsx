import { test, expect } from 'claude-code/testing'

test('progress 도구로 받은 단계를 프롬프트 위에 표시', async ($, on) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__progress-band__${e.name}` } }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__progress-band__progress',
    steps: [
        { label: '조사·설계', state: 'done' },
        { label: '구현', state: 'now' },
        { label: '커밋·PR 직전', state: 'blocked' },
    ],
  } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'progress-band', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect(await ui.find({ type: 'Text', text: /✓ 조사·설계/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● 구현/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /! 커밋·PR 직전/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/3/ })).toBeDefined()
    await ui.unmount()
  }
})
