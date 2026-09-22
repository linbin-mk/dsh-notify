import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { promisify } from 'node:util'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import {
  MenuBarIndicator,
  launchMenuBarHelper,
  observePendingInteractions,
  observeRunningAgents,
  webClientOrigin,
} from '../index.js'

const execFileAsync = promisify(execFile)

function fakeContext(agents) {
  const listeners = new Map()
  return {
    agents: { list: () => agents },
    on(name, listener) {
      listeners.set(name, listener)
      return () => listeners.delete(name)
    },
    emit(name, payload) {
      listeners.get(name)?.(payload)
    },
    listeners,
  }
}

test('tracks initial and live running-agent counts without duplicates', () => {
  const first = { status: 'running' }
  const second = { status: 'idle' }
  const ctx = fakeContext([first, second])
  const counts = []
  const dispose = observeRunningAgents(ctx, count => counts.push(count))

  ctx.emit('agent/status', { agent: second, status: 'running' })
  ctx.emit('agent/status', { agent: second, status: 'running' })
  ctx.emit('agent/status', { agent: first, status: 'idle' })
  ctx.emit('agent/disposed', { agent: second })

  assert.deepEqual(counts, [1, 2, 1, 0])
  dispose()
  assert.equal(ctx.listeners.size, 0)
})

test('the indicator closes and restores the helper around settings changes', async () => {
  const events = []
  const launch = (_logger, origin) => {
    events.push(['url', origin])
    return {
      setCount: count => events.push(['count', count]),
      setMarkers: markers => events.push(['markers', markers]),
      setSweepEnabled: enabled => events.push(['sweep', enabled]),
      close: async () => { events.push(['close']) },
    }
  }
  const indicator = new MenuBarIndicator({ warn() {} }, true, 'http://127.0.0.1:3080', launch)
  indicator.setCount(3)
  indicator.setMarkerCounts({ Q: 1, S: 0 })
  await indicator.setEnabled(false)
  indicator.setCount(4)
  indicator.setMarkerCounts({ Q: 2, S: 0 })
  await indicator.setEnabled(true)
  await indicator.dispose()

  assert.deepEqual(events, [
    ['url', 'http://127.0.0.1:3080'],
    ['count', 0],
    ['markers', ''],
    ['sweep', false],
    ['count', 3],
    ['markers', ''],
    ['sweep', false],
    ['count', 1],
    ['markers', 'Q'],
    ['sweep', true],
    ['close'],
    ['url', 'http://127.0.0.1:3080'],
    ['count', 2],
    ['markers', 'QQ'],
    ['sweep', true],
    ['close'],
  ])
})

test('filters subscribed markers while retaining the total for active types', () => {
  const events = []
  const indicator = new MenuBarIndicator({ warn() {} }, true, 'http://127.0.0.1:3080', () => ({
    setCount: count => events.push(['count', count]),
    setMarkers: markers => events.push(['markers', markers]),
    setSweepEnabled: enabled => events.push(['sweep', enabled]),
    close: async () => {},
  }))

  indicator.setMarkerCounts({ Q: 2, S: 1 })
  indicator.setQuestionMarkers(false)
  indicator.setSweepEnabled(false)
  indicator.setQuestionMarkers(true)

  assert.deepEqual(events, [
    ['count', 0], ['markers', ''], ['sweep', false],
    ['count', 3], ['markers', 'QQS'], ['sweep', true],
    ['count', 1], ['markers', 'S'], ['sweep', true],
    ['count', 1], ['markers', 'S'], ['sweep', false],
    ['count', 3], ['markers', 'QQS'], ['sweep', false],
  ])
})

test('counts pending questions and approvals without taking over either answerer', async () => {
  const ctx = fakeContext([])
  const states = []
  const stop = observePendingInteractions(ctx, active => states.push(active))
  const question = Promise.withResolvers()
  const approval = Promise.withResolvers()
  const questionRequest = ctx.listeners.get('user-questions/request')(
    { questions: [{ id: 'mode', question: 'Choose a mode' }] },
    () => question.promise,
  )
  const approvalRequest = ctx.listeners.get('approval/request')(
    { toolName: 'dangerous_tool' },
    () => approval.promise,
  )

  assert.deepEqual(states, [{ Q: 1, S: 0 }, { Q: 1, S: 1 }])
  question.resolve({ answers: [{ id: 'mode', selected: ['fast'] }] })
  await questionRequest
  assert.deepEqual(states, [{ Q: 1, S: 0 }, { Q: 1, S: 1 }, { Q: 0, S: 1 }])
  approval.resolve('allowed-once')
  await approvalRequest
  assert.deepEqual(states, [{ Q: 1, S: 0 }, { Q: 1, S: 1 }, { Q: 0, S: 1 }, { Q: 0, S: 0 }])
  stop()
})

test('the helper receives the active Harness Web origin before count updates', async () => {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = 0
  child.signalCode = null
  const messages = []
  child.stdin.setEncoding('utf8')
  child.stdin.on('data', chunk => {
    for (const line of chunk.split('\n')) if (line !== '') messages.push(JSON.parse(line))
  })

  const helper = launchMenuBarHelper({ warn() {} }, 'http://127.0.0.1:3080', () => child)
  helper.setCount(2)
  helper.setMarkers('QS')
  helper.setSweepEnabled(false)
  await helper.close()

  assert.deepEqual(messages, [
    { type: 'url', url: 'http://127.0.0.1:3080' },
    { type: 'count', count: 2 },
    { type: 'markers', markers: 'QS' },
    { type: 'sweep', sweep: false },
    { type: 'quit' },
  ])
})

test('builds the origin for the active loopback Web server', () => {
  assert.equal(webClientOrigin({ webServer: { port: 3080 } }), 'http://127.0.0.1:3080')
})

test('the client bundle registers localized event subscription checkboxes and a sweep switch', async () => {
  let registration
  const localeRows = []
  const writes = []
  const scope = {
    getSnapshot: () => ({
      status: 'ready', value: { enabled: true, questionMarkers: true, approvalMarkers: true, sweep: true }, writable: true,
      base: { enabled: true, questionMarkers: true, approvalMarkers: true, sweep: true }, user: undefined, revision: 0, mode: 'host',
    }),
    subscribe: () => () => {},
    set: async (field, value) => { writes.push([field, value]) },
  }
  const clientPath = fileURLToPath(new URL('../client.js', import.meta.url))
  const source = await readFile(clientPath, 'utf8')
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  let bundle
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: value => { bundle = value } } },
    Promise,
  })
  vm.runInContext(source, context)
  // Harness keys the client module table by entry name, which is the package
  // name; a stale id here only surfaces in the browser, at boot time.
  assert.equal(bundle.id, manifest.name)

  const jsx = (type, props) => ({ type, props })
  const plugin = bundle.factory(specifier => {
    if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (specifier === 'react') return { useState: initial => [initial, () => {}] }
    throw new Error(`unexpected module request: ${specifier}`)
  })
  const ctx = {
    locale: {
      bind: () => key => key,
      register: (namespace, dictionaries) => {
        localeRows.push([namespace, dictionaries])
        return () => {}
      },
    },
    settingsScope: { bind: () => scope },
    effect: setup => setup(),
    slots: {
      inject: (_name, setup) => setup(),
      register: (options, component) => {
        registration = { options, component }
        return () => {}
      },
    },
  }
  plugin.apply(ctx)

  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'connection', 'settingsScope'])
  assert.equal(registration.options.id, 'notifications')
  assert.equal(registration.options.label(), 'nav')
  assert.equal(localeRows[0][0], 'settings.dshNotify')
  assert.equal(localeRows[0][1].zh.title, '菜单栏通知')

  const injected = registration.options.inject()
  const tree = registration.component({
    t: key => key,
    useNotifySettings: selector => selector(scope.getSnapshot()),
    ...injected,
  })
  const cards = tree.props.children
    .filter(node => typeof node.type === 'function')
    .map(node => node.type(node.props))
  const toggles = [cards[0].props.children[1], cards[2].props.children[1]]
  const subscriptions = cards[1].props.children[0].props.children[2].props.children
  const checkboxes = subscriptions.map(subscription => subscription.props.children[0])
  assert.equal(checkboxes.length, 2)
  assert.deepEqual(Array.from(checkboxes, checkbox => checkbox.props.checked), [true, true])
  assert.deepEqual(Array.from(toggles, toggle => toggle.props['aria-checked']), [true, true])
  assert.equal(cards[2].props.className, 'dshNotifyCard dshNotifyChildCard')
  toggles[0].props.onClick()
  checkboxes[0].props.onChange()
  checkboxes[1].props.onChange()
  toggles[1].props.onClick()
  await Promise.resolve()
  assert.deepEqual(writes, [
    ['enabled', false],
    ['questionMarkers', false],
    ['approvalMarkers', false],
    ['sweep', false],
  ])
})

test('the universal native helper loads the whale and hides a zero count', async () => {
  const helper = fileURLToPath(new URL('../native/dsh-notify-menubar', import.meta.url))
  const { stdout } = await execFileAsync(helper, ['--probe'])
  assert.deepEqual(JSON.parse(stdout), {
    activeTitle: '2',
    markerCommand: 'markers',
    markerTitle: '2-QSS',
    markerWireValue: 'QS',
    sweepWireValue: false,
    chromeFocusScriptValid: true,
    iconLoaded: true,
    protocol: 1,
    zeroTitle: '',
  })
})
