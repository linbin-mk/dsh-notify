window.__ModuleLoader__.load({
  id: '@linbin-mk/dsh-notify',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const { jsx, jsxs } = require('react/jsx-runtime')
    const React = require('react')

    const styleId = 'dsh-notify/client.css'
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(styleId)}]`) === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-notify'
      tag.dataset.pluginCss = styleId
      tag.textContent = `
        .dshNotifySection{box-sizing:border-box;max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
        .dshNotifyHeading{margin:0;font-size:18px;font-weight:600;line-height:28px}
        .dshNotifyIntro{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
        .dshNotifyCard{display:flex;align-items:center;gap:24px;padding:18px 20px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
        .dshNotifyChildCard{margin-left:24px;border-left:3px solid var(--dsw-alias-border-l2)}
        .dshNotifySubscriptions{display:flex;flex-wrap:wrap;gap:14px 20px}
        .dshNotifyCheckbox{display:inline-flex;align-items:center;gap:7px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}
        .dshNotifyCheckbox input{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
        .dshNotifyCheckbox:has(input:disabled){color:var(--dsw-alias-label-secondary);cursor:not-allowed;opacity:.6}
        .dshNotifyCopy{min-width:0;display:flex;flex:1;flex-direction:column;gap:3px}
        .dshNotifyLabel{font-size:14px;font-weight:500;line-height:22px}
        .dshNotifyDescription,.dshNotifyStatus{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
        .dshNotifySwitch{box-sizing:border-box;position:relative;width:44px;height:24px;flex:none;padding:2px;border:0;border-radius:12px;background:var(--dsw-alias-border-l3);cursor:pointer;transition:background .15s ease}
        .dshNotifySwitch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
        .dshNotifySwitch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
        .dshNotifySwitch:disabled{cursor:not-allowed;opacity:.5}
        .dshNotifyKnob{display:block;width:20px;height:20px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .15s ease}
        .dshNotifySwitch[aria-checked=true] .dshNotifyKnob{transform:translateX(20px)}
      `
      document.head.appendChild(tag)
    }

    const dictionaries = {
      zh: {
        nav: '通知',
        title: '菜单栏通知',
        intro: '管理 DeepSeek Harness 在 macOS 菜单栏中的会话活动指示器。',
        label: '显示菜单栏状态',
        description: '显示鲸鱼图标和当前进行中的会话数。',
        subscriptionLabel: '订阅事件类型',
        subscriptionDescription: '数字汇总所有已订阅且等待处理的事件，字母标识事件类型。',
        questionSubscription: 'Q · 提问',
        approvalSubscription: 'S · 审批',
        sweepLabel: '扫光强化提示',
        sweepDescription: '等待回答时，为菜单栏状态项添加扫光效果。',
        enabled: '已开启',
        disabled: '已关闭',
        loading: '正在读取设置…',
        unavailable: '当前连接无法管理此设置',
        readOnly: '设置文件为只读',
        toggle: '显示菜单栏状态',
        questionToggle: '订阅提问事件',
        approvalToggle: '订阅审批事件',
        sweepToggle: '扫光强化提示',
      },
      en: {
        nav: 'Notifications',
        title: 'Menu Bar Notifications',
        intro: 'Manage the DeepSeek Harness session activity indicator in the macOS menu bar.',
        label: 'Show menu bar status',
        description: 'Show the whale mark and the number of sessions currently in progress.',
        subscriptionLabel: 'Subscribed event types',
        subscriptionDescription: 'The number totals subscribed pending events; letters identify their types.',
        questionSubscription: 'Q · Question',
        approvalSubscription: 'S · Approval',
        sweepLabel: 'Sweeping attention effect',
        sweepDescription: 'Sweep across the menu bar item while an answer is pending.',
        enabled: 'On',
        disabled: 'Off',
        loading: 'Loading setting…',
        unavailable: 'This connection cannot manage the setting',
        readOnly: 'The settings document is read-only',
        toggle: 'Show menu bar status',
        questionToggle: 'Subscribe to question events',
        approvalToggle: 'Subscribe to approval events',
        sweepToggle: 'Sweeping attention effect',
      },
    }

    function statusText(snapshot, enabled, t) {
      if (snapshot.status === 'loading') return t('loading')
      // Memory mode keeps a remote browser's writes process-local, so it must
      // not present the form as a persisted setting.
      if (snapshot.status !== 'ready' || snapshot.mode === 'memory') return t('unavailable')
      if (!snapshot.writable) return t('readOnly')
      return enabled ? t('enabled') : t('disabled')
    }

    function ToggleCard({ label, description, status, checked, disabled, onClick, toggle, child = false }) {
      return jsxs('div', {
        className: `dshNotifyCard${child ? ' dshNotifyChildCard' : ''}`,
        children: [
          jsxs('div', {
            className: 'dshNotifyCopy',
            children: [
              jsx('div', { className: 'dshNotifyLabel', children: label }),
              jsx('p', { className: 'dshNotifyDescription', children: description }),
              jsx('p', { className: 'dshNotifyStatus', 'aria-live': 'polite', children: status }),
            ],
          }),
          jsx('button', {
            type: 'button',
            className: 'dshNotifySwitch',
            role: 'switch',
            'aria-checked': checked,
            'aria-label': toggle,
            disabled,
            onClick,
            children: jsx('span', { className: 'dshNotifyKnob', 'aria-hidden': true }),
          }),
        ],
      })
    }

    function SubscriptionCard({ t, disabled, questionMarkers, approvalMarkers, onQuestionChange, onApprovalChange }) {
      return jsxs('div', {
        className: 'dshNotifyCard',
        children: [
          jsxs('div', {
            className: 'dshNotifyCopy',
            children: [
              jsx('div', { className: 'dshNotifyLabel', children: t('subscriptionLabel') }),
              jsx('p', { className: 'dshNotifyDescription', children: t('subscriptionDescription') }),
              jsxs('div', {
                className: 'dshNotifySubscriptions',
                children: [
                  jsxs('label', {
                    className: 'dshNotifyCheckbox',
                    children: [
                      jsx('input', { type: 'checkbox', checked: questionMarkers, disabled, 'aria-label': t('questionToggle'), onChange: onQuestionChange }),
                      t('questionSubscription'),
                    ],
                  }),
                  jsxs('label', {
                    className: 'dshNotifyCheckbox',
                    children: [
                      jsx('input', { type: 'checkbox', checked: approvalMarkers, disabled, 'aria-label': t('approvalToggle'), onChange: onApprovalChange }),
                      t('approvalSubscription'),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    }

    function NotifySettingsSection({ t, useNotifySettings, setEnabled, setQuestionMarkers, setApprovalMarkers, setSweep }) {
      const snapshot = useNotifySettings(value => value)
      const enabled = snapshot.value?.enabled !== false
      const questionMarkers = snapshot.value?.questionMarkers !== false
      const approvalMarkers = snapshot.value?.approvalMarkers !== false
      const sweep = snapshot.value?.sweep !== false
      const [saving, setSaving] = React.useState(false)
      const editable = snapshot.status === 'ready' && snapshot.writable && snapshot.mode === 'host'
      const disabled = saving || !editable
      const save = update => {
        if (disabled) return
        setSaving(true)
        Promise.resolve(update()).finally(() => { setSaving(false) })
      }
      return jsxs('section', {
        className: 'dshNotifySection',
        children: [
          jsx('h2', { className: 'dshNotifyHeading', children: t('title') }),
          jsx('p', { className: 'dshNotifyIntro', children: t('intro') }),
          jsx(ToggleCard, {
            label: t('label'), description: t('description'), status: statusText(snapshot, enabled, t),
            checked: enabled, disabled, onClick: () => save(() => setEnabled(!enabled)), toggle: t('toggle'),
          }),
          jsx(SubscriptionCard, {
            t, questionMarkers, approvalMarkers, disabled: disabled || !enabled,
            onQuestionChange: () => save(() => setQuestionMarkers(!questionMarkers)),
            onApprovalChange: () => save(() => setApprovalMarkers(!approvalMarkers)),
          }),
          jsx(ToggleCard, {
            label: t('sweepLabel'), description: t('sweepDescription'), status: statusText(snapshot, sweep, t),
            checked: sweep, disabled: disabled || !enabled || (!questionMarkers && !approvalMarkers),
            onClick: () => save(() => setSweep(!sweep)), toggle: t('sweepToggle'), child: true,
          }),
        ],
      })
    }

    // Profile entry id from this package's cordis.patch.yml; the Host half's
    // Config is the form this page reads and writes.
    const ENTRY_ID = 'notify-menubar'

    const inject = ['slots', 'locale', 'connection', 'configForms']

    function apply(ctx) {
      const namespace = 'settings.dshNotify'
      const t = ctx.locale.bind(namespace)
      const form = ctx.configForms.get(ENTRY_ID)
      ctx.effect(
        () => ctx.locale.register(namespace, dictionaries),
        'dsh-notify: settings dictionaries',
      )
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'notifications',
        order: 40,
        label: () => t('nav'),
        locale: namespace,
        inject: () => ({
          hooks: { notifySettings: form },
          setEnabled: enabled => form.set('enabled', enabled),
          setQuestionMarkers: enabled => form.set('questionMarkers', enabled),
          setApprovalMarkers: enabled => form.set('approvalMarkers', enabled),
          setSweep: enabled => form.set('sweep', enabled),
        }),
      }, NotifySettingsSection))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
