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
  Config,
  ENTRY_ID,
  MenuBarIndicator,
  apply,
  launchMenuBarHelper,
  observePendingInteractions,
  observeRunningAgents,
  publishLiveConfig,
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

/** Config references a test can re-point, mirroring volatile Cordis fields. */
function liveConfig(values) {
  return Object.fromEntries(
    ['enabled', 'questionMarkers', 'approvalMarkers', 'sweep'].map(field => [field, { get: () => values[field] }]),
  )
}

/** Host context recording what `apply` registers, without launching a helper. */
function fakeHostContext(agents = []) {
  const listeners = new Map()
  const disposers = []
  const injections = []
  const policies = []
  const ctx = {
    agents: { list: () => agents },
    webServer: { port: 3080 },
    logger: { warn() {} },
    fiber: { name: 'dsh-notify' },
    on(name, listener) {
      listeners.set(name, listener)
      return () => listeners.delete(name)
    },
    effect(setup) {
      disposers.push(setup())
      return () => {}
    },
    inject(dependencies, callback) {
      injections.push(dependencies)
      callback({
        effect(setup) {
          disposers.push(setup())
          return () => {}
        },
        settings: {
          configure(policy, owner) {
            policies.push([policy, owner])
            return () => {}
          },
        },
      })
    },
  }
  return { ctx, listeners, disposers, injections, policies }
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

test('the Host Config exposes every field as a live reference defaulting to true', () => {
  const parsed = Config({})
  assert.deepEqual(Object.keys(parsed).sort(), ['approvalMarkers', 'enabled', 'questionMarkers', 'sweep'])
  for (const [field, reference] of Object.entries(parsed)) {
    assert.equal(typeof reference.get, 'function', `${field} is a volatile reference`)
    assert.equal(reference.get(), true, `${field} defaults to true`)
  }
})

test('the live Config references drive the running indicator without a remount', async () => {
  const events = []
  const values = { enabled: true, questionMarkers: true, approvalMarkers: true, sweep: true }
  const config = liveConfig(values)
  const indicator = new MenuBarIndicator({ warn() {} }, config.enabled.get(), 'http://127.0.0.1:3080', () => ({
    setCount: count => events.push(['count', count]),
    setMarkers: markers => events.push(['markers', markers]),
    setSweepEnabled: enabled => events.push(['sweep', enabled]),
    close: async () => { events.push(['close']) },
  }), {
    questionMarkers: config.questionMarkers.get(),
    approvalMarkers: config.approvalMarkers.get(),
    sweep: config.sweep.get(),
  })

  indicator.setMarkerCounts({ Q: 2, S: 1 })
  values.questionMarkers = false
  values.sweep = false
  values.enabled = false
  publishLiveConfig(indicator, config)
  await indicator.tail

  assert.deepEqual(events, [
    ['count', 0], ['markers', ''], ['sweep', false],
    ['count', 3], ['markers', 'QQS'], ['sweep', true],
    ['count', 1], ['markers', 'S'], ['sweep', true],
    ['count', 1], ['markers', 'S'], ['sweep', true],
    ['count', 1], ['markers', 'S'], ['sweep', false],
    ['close'],
  ])
  await indicator.dispose()
})

test('apply follows loader volatile updates and suppresses the generated settings page', async () => {
  const values = { enabled: false, questionMarkers: true, approvalMarkers: true, sweep: true }
  const { ctx, listeners, disposers, injections, policies } = fakeHostContext()
  apply(ctx, liveConfig(values))

  assert.deepEqual(injections, [['settings']])
  assert.deepEqual(policies, [[{ auto: false }, ctx.fiber]])
  assert.equal(typeof listeners.get('loader/volatile-update'), 'function')
  assert.equal(typeof listeners.get('agent/status'), 'function')
  assert.equal(typeof listeners.get('user-questions/request'), 'function')

  values.questionMarkers = false
  values.sweep = false
  listeners.get('loader/volatile-update')([['questionMarkers'], ['sweep']])

  await Promise.all(disposers.map(dispose => dispose()))
  assert.equal(listeners.size, 0)
})

/** Materialize the browser half's registered bundle with a minimal React shim. */
async function loadClientBundle() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  let bundle
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: value => { bundle = value } } },
    Promise,
  })
  vm.runInContext(source, context)
  const jsx = (type, props) => ({ type, props })
  const plugin = bundle.factory(specifier => {
    if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (specifier === 'react') return { useState: initial => [initial, () => {}] }
    throw new Error(`unexpected module request: ${specifier}`)
  })
  return { bundle, plugin, source }
}

/** Browser context recording locale rows, the requested config form, and the slot registration. */
function fakeClientContext(form) {
  const captured = { registration: undefined, entryId: undefined, localeRows: [] }
  const ctx = {
    locale: {
      bind: () => key => key,
      register: (namespace, dictionaries) => {
        captured.localeRows.push([namespace, dictionaries])
        return () => {}
      },
    },
    configForms: {
      get: entryId => {
        captured.entryId = entryId
        return form
      },
    },
    effect: setup => setup(),
    slots: {
      inject: (_name, setup) => setup(),
      register: (options, component) => {
        captured.registration = { options, component }
        return () => {}
      },
    },
  }
  return { ctx, captured }
}

/** Render the registered Settings section through its injected face. */
function renderNotifySection(captured, snapshot) {
  const injected = captured.registration.options.inject()
  const tree = captured.registration.component({
    t: key => key,
    useNotifySettings: selector => selector(snapshot),
    ...injected,
  })
  const cards = tree.props.children
    .filter(node => typeof node.type === 'function')
    .map(node => node.type(node.props))
  return {
    injected,
    cards,
    toggles: [cards[0].props.children[1], cards[2].props.children[1]],
    checkboxes: cards[1].props.children[0].props.children[2].props.children
      .map(subscription => subscription.props.children[0]),
  }
}

test('the browser half addresses the entry id declared by the bundle patch', async () => {
  const patch = await readFile(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  assert.match(patch, new RegExp(`^\\s*(?:-\\s*)?id: ${ENTRY_ID}$`, 'm'))
  const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  assert.ok(source.includes(`'${ENTRY_ID}'`), 'the client bundle names the same settings entry id')
})

test('the client bundle registers localized event subscription checkboxes and a sweep switch', async () => {
  const writes = []
  const form = {
    getSnapshot: () => ({
      status: 'ready', value: { enabled: true, questionMarkers: true, approvalMarkers: true, sweep: true }, writable: true,
      base: { enabled: true, questionMarkers: true, approvalMarkers: true, sweep: true }, user: undefined, revision: 0, mode: 'host',
    }),
    subscribe: () => () => {},
    set: async (field, value) => { writes.push([field, value]); return true },
  }
  const { bundle, plugin } = await loadClientBundle()
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  // Harness keys the client module table by entry name, which is the package
  // name; a stale id here only surfaces in the browser, at boot time.
  assert.equal(bundle.id, manifest.name)

  const { ctx, captured } = fakeClientContext(form)
  plugin.apply(ctx)

  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'connection', 'configForms'])
  assert.equal(captured.entryId, ENTRY_ID)
  assert.equal(captured.registration.options.id, 'notifications')
  assert.equal(captured.registration.options.label(), 'nav')
  assert.equal(captured.localeRows[0][0], 'settings.dshNotify')
  assert.equal(captured.localeRows[0][1].zh.title, '菜单栏通知')

  const { injected, cards, toggles, checkboxes } = renderNotifySection(captured, form.getSnapshot())
  assert.equal(injected.hooks.notifySettings, form)
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

test('the settings page disables every control while the form is unavailable or process-local', async () => {
  const writes = []
  const form = {
    getSnapshot: () => ({
      status: 'unavailable', value: undefined, base: undefined, user: undefined,
      revision: undefined, writable: false, mode: 'memory',
    }),
    subscribe: () => () => {},
    set: async (field, value) => { writes.push([field, value]); return false },
  }
  const { plugin } = await loadClientBundle()
  const { ctx, captured } = fakeClientContext(form)
  plugin.apply(ctx)

  const { cards, toggles, checkboxes } = renderNotifySection(captured, form.getSnapshot())
  assert.equal(cards[0].props.children[0].props.children[2].props.children, 'unavailable')
  assert.deepEqual(Array.from(toggles, toggle => toggle.props.disabled), [true, true])
  assert.deepEqual(Array.from(checkboxes, checkbox => checkbox.props.disabled), [true, true])
  toggles[0].props.onClick()
  checkboxes[0].props.onChange()
  checkboxes[1].props.onChange()
  toggles[1].props.onClick()
  await Promise.resolve()
  assert.deepEqual(writes, [])
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
