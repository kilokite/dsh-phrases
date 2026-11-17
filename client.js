/**
 * Browser half of the common-phrases bundle.
 *
 * Registers three seats:
 *   conversation.input.overlay  - the fuzzy phrase picker above the composer
 *   conversation.input.left     - a small trigger button in the composer tool row
 *   settings.section            - the phrase manager page
 *
 * Data lives in the Host half's JSON file, reached over the same-origin
 * endpoint `/dsh-phrases/api`. The composer is a shell-owned Lexical editor;
 * this module never touches its DOM directly. It reads the draft through
 * `useInput`, reads the live caret through `InputActions.captureInsertion()`,
 * and replaces the trigger token through `InputActions.insertText`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-phrases',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React

    const NS = 'phrases'
    const API = '/dsh-phrases/api'
    const HEADERS = { 'x-dsh-phrases': '1' }
    const MAX_QUERY = 40
    const MAX_RESULTS = 40

    /** Dictionaries: zh is the key-set source of truth, en is complete against it. */
    const DICT = {
      zh: {
        'settings.title': '常用短语',
        'settings.description':
          '在输入框中键入触发符号，用短语文字或简码模糊搜索，回车即可插入完整文本。短语只保存在本机。',
        'settings.triggers': '触发符号',
        'settings.triggerHint':
          '可以配置多个，任意一个都能触发；每个 1–8 个字符，不能是 / 或 @（已被指令与引用占用）。',
        'settings.addTrigger': '添加触发符号',
        'settings.removeTrigger': '删除这个触发符号',
        'settings.phrases': '短语列表',
        'settings.phraseCount': '共 {count} 条',
        'settings.empty': '还没有短语，点击下方按钮添加一条。',
        'settings.add': '添加短语',
        'settings.save': '保存修改',
        'settings.saving': '正在保存…',
        'settings.revert': '撤销修改',
        'settings.reload': '重新加载',
        'settings.saved': '已保存',
        'settings.saveFailed': '保存失败：{message}',
        'settings.loadFailed': '读取短语失败：{message}',
        'settings.triggerInvalid':
          '每个触发符号必须是 1–8 个非空白字符，不能是 / 或 @，也不能重复。',
        'settings.bodyRequired': '第 {n} 条短语的内容不能为空。',
        'settings.alias': '简码',
        'settings.aliasPlaceholder': '简码，如 wt',
        'settings.label': '名称',
        'settings.labelPlaceholder': '名称（可选）',
        'settings.body': '短语内容',
        'settings.bodyPlaceholder': '输入要插入的完整文本',
        'settings.remove': '删除这条短语',
        'settings.moveUp': '上移',
        'settings.moveDown': '下移',
        'menu.title': '常用短语',
        'menu.hint': '↑↓ 选择 · Enter 插入 · Esc 关闭',
        'menu.empty': '没有匹配的短语',
        'menu.noPhrases': '还没有短语，请到「设置 → 常用短语」添加。',
        'menu.edit': '编辑短语',
        'editor.title': '编辑常用短语',
        'editor.close': '关闭',
        'menu.loading': '正在加载短语…',
        'menu.alias': '简码',
        'trigger.title': '常用短语（输入 {triggers} 触发）',
      },
      en: {
        'settings.title': 'Common phrases',
        'settings.description':
          'Type the trigger symbol in the composer, fuzzy-search by phrase text or shortcode, and press Enter to insert the whole text. Phrases stay on this machine.',
        'settings.triggers': 'Trigger symbols',
        'settings.triggerHint':
          'Add as many as you like; any of them opens the menu. Each is 1–8 characters; "/" and "@" are reserved by commands and references.',
        'settings.addTrigger': 'Add trigger symbol',
        'settings.removeTrigger': 'Remove this trigger symbol',
        'settings.phrases': 'Phrases',
        'settings.phraseCount': '{count} total',
        'settings.empty': 'No phrases yet. Add one below.',
        'settings.add': 'Add phrase',
        'settings.save': 'Save changes',
        'settings.saving': 'Saving…',
        'settings.revert': 'Revert',
        'settings.reload': 'Reload',
        'settings.saved': 'Saved',
        'settings.saveFailed': 'Save failed: {message}',
        'settings.loadFailed': 'Could not load phrases: {message}',
        'settings.triggerInvalid':
          'Each trigger must be 1–8 non-space characters, cannot be / or @, and must be unique.',
        'settings.bodyRequired': 'Phrase {n} has no text.',
        'settings.alias': 'Shortcode',
        'settings.aliasPlaceholder': 'Shortcode, e.g. wt',
        'settings.label': 'Name',
        'settings.labelPlaceholder': 'Name (optional)',
        'settings.body': 'Phrase text',
        'settings.bodyPlaceholder': 'The full text to insert',
        'settings.remove': 'Remove this phrase',
        'settings.moveUp': 'Move up',
        'settings.moveDown': 'Move down',
        'menu.title': 'Common phrases',
        'menu.hint': '↑↓ select · Enter insert · Esc close',
        'menu.empty': 'No matching phrase',
        'menu.noPhrases': 'No phrases yet. Add some in Settings → Common phrases.',
        'menu.edit': 'Edit phrases',
        'editor.title': 'Edit common phrases',
        'editor.close': 'Close',
        'menu.loading': 'Loading phrases…',
        'menu.alias': 'Shortcode',
        'trigger.title': 'Common phrases (type {triggers})',
      },
    }

    /** Starter phrases served when the Host file does not exist yet. */
    const DEFAULT_PHRASES = [
      {
        id: 'p-pure-question',
        alias: 'wt',
        label: '纯提问',
        body: '本次是纯提问，不要修改。',
      },
      {
        id: 'p-plan-first',
        alias: 'fa',
        label: '先方案',
        body: '请先给出方案和影响面，等我确认后再改代码。',
      },
      {
        id: 'p-minimal-change',
        alias: 'zx',
        label: '最小修改',
        body: '请只做最小必要修改，不要顺手重构无关代码。',
      },
      {
        id: 'p-keep-style',
        alias: 'fg',
        label: '保持风格',
        body: '保持现有代码风格和命名，不要引入新依赖。',
      },
      {
        id: 'p-explain-changes',
        alias: 'sm',
        label: '改完说明',
        body: '修改完成后请说明改了哪些文件、为什么这样改。',
      },
      {
        id: 'p-repro-first',
        alias: 'fy',
        label: '先复现',
        body: '请先复现问题并给出根因，再动手修复。',
      },
    ]

    /* ------------------------------------------------------------------ */
    /* i18n                                                                */
    /* ------------------------------------------------------------------ */

    /** Build a translator over the registered namespace, with a local fallback. */
    function makeTranslator(locale) {
      let bound = null
      if (locale) {
        try {
          bound = locale.bind(NS)
        } catch {
          bound = null
        }
      }
      const language = () => {
        try {
          const id = locale?.getSnapshot?.()?.id
          return typeof id === 'string' && id.toLowerCase().startsWith('en') ? 'en' : 'zh'
        } catch {
          return 'zh'
        }
      }
      return (key, params) => {
        let value
        if (bound) {
          try {
            value = bound(key, params)
          } catch {
            value = undefined
          }
        }
        if (typeof value !== 'string' || value === key) {
          value = DICT[language()][key] ?? DICT.en[key] ?? key
        }
        if (params) {
          value = value.replace(/\{(\w+)\}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
          )
        }
        return value
      }
    }

    /* ------------------------------------------------------------------ */
    /* Data store                                                          */
    /* ------------------------------------------------------------------ */

    /** Minimal observable snapshot store, independent of shipped Client packages. */
    function createStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        set(next) {
          const value = typeof next === 'function' ? next(snapshot) : next
          if (value === snapshot) return
          snapshot = value
          for (const listener of Array.from(listeners)) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
    }

    const store = createStore({
      status: 'loading',
      triggers: ['#'],
      phrases: [],
      error: null,
      revision: 0,
    })

    /** Default trigger symbols. */
    const DEFAULT_TRIGGERS = ['#']

    /** Direct editor dialog state, reachable from the phrase panel. */
    const editorStore = createStore({ open: false, sessionId: null })

    function openEditor(sessionId) {
      editorStore.set({ open: true, sessionId: sessionId ?? null })
    }

    function closeEditor() {
      editorStore.set((state) => ({ ...state, open: false }))
    }

    let loadInFlight = null

    /** Fresh copy of the defaults. */
    function defaultPhrases() {
      return DEFAULT_PHRASES.map((phrase) => ({ ...phrase }))
    }

    /** Generate a stable-enough local id without touching crypto APIs. */
    function makeId() {
      return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }

    /** Normalize a trigger field that may be the new array or the old single string. */
    function cleanTriggers(raw) {
      const list = Array.isArray(raw?.triggers)
        ? raw.triggers
        : typeof raw?.trigger === 'string'
          ? [raw.trigger]
          : []
      const result = []
      for (const item of list) {
        if (typeof item !== 'string') continue
        const value = item.trim().slice(0, 8)
        if (value === '' || result.includes(value) || result.length >= 8) continue
        result.push(value)
      }
      return result.length > 0 ? result : DEFAULT_TRIGGERS.slice()
    }

    /** Normalize one API payload for the UI. */
    function cleanData(raw) {
      const triggers = cleanTriggers(raw)
      const list = Array.isArray(raw?.phrases) ? raw.phrases : []
      const phrases = []
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue
        const body = typeof item.body === 'string' ? item.body : ''
        if (body.trim() === '') continue
        phrases.push({
          id: typeof item.id === 'string' && item.id !== '' ? item.id : makeId(),
          body,
          alias: typeof item.alias === 'string' ? item.alias.trim() : '',
          label: typeof item.label === 'string' ? item.label.trim() : '',
        })
      }
      return { triggers, phrases }
    }

    /** Load the phrase file through the same-origin Host endpoint. */
    function loadStore(force) {
      if (loadInFlight) return loadInFlight
      const current = store.getSnapshot()
      if (!force && current.status === 'ready') return Promise.resolve(current)
      if (force) store.set((state) => ({ ...state, status: 'loading', error: null }))
      loadInFlight = (async () => {
        try {
          if (typeof fetch !== 'function') throw new Error('fetch is unavailable')
          const response = await fetch(API, { headers: HEADERS, cache: 'no-store' })
          const payload = await response.json().catch(() => null)
          if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.error || `HTTP ${String(response.status)}`)
          }
          const data = cleanData(payload.data)
          store.set((state) => ({
            status: 'ready',
            triggers: data.triggers,
            phrases: data.phrases,
            error: null,
            revision: state.revision + 1,
          }))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          store.set((state) => ({
            status: 'error',
            triggers: state.triggers,
            phrases: state.phrases.length > 0 ? state.phrases : defaultPhrases(),
            error: message,
            revision: state.revision + 1,
          }))
        } finally {
          loadInFlight = null
        }
      })()
      return loadInFlight
    }

    /** Persist the whole phrase document; resolves to {ok, error?}. */
    async function saveStore(data) {
      try {
        if (typeof fetch !== 'function') throw new Error('fetch is unavailable')
        const response = await fetch(API, {
          method: 'PUT',
          headers: { ...HEADERS, 'content-type': 'application/json' },
          body: JSON.stringify({
            // `trigger` keeps a pre-multi-trigger Host instance writable during
            // a live upgrade; current Hosts read `triggers` first.
            trigger: data.triggers[0] ?? '#',
            triggers: data.triggers,
            phrases: data.phrases.map((phrase) => ({
              id: phrase.id,
              body: phrase.body,
              alias: phrase.alias,
              label: phrase.label,
            })),
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error || `HTTP ${String(response.status)}`)
        }
        const saved = cleanData(payload.data)
        store.set((state) => ({
          status: 'ready',
          triggers: saved.triggers,
          phrases: saved.phrases,
          error: null,
          revision: state.revision + 1,
        }))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }

    /* ------------------------------------------------------------------ */
    /* Fuzzy matching                                                      */
    /* ------------------------------------------------------------------ */

    function lower(value) {
      return typeof value === 'string' ? value.toLowerCase() : ''
    }

    /**
     * Greedy subsequence match with a gap penalty.
     * @returns {{gaps: number} | null}
     */
    function subsequence(haystack, needle) {
      if (needle === '') return { gaps: 0 }
      let at = 0
      let gaps = 0
      let last = -1
      for (const char of needle) {
        const found = haystack.indexOf(char, at)
        if (found < 0) return null
        if (last >= 0) gaps += found - last - 1
        last = found
        at = found + 1
      }
      return { gaps }
    }

    /** Score one query term against one phrase; null means "no match". */
    function scoreTerm(phrase, term) {
      const alias = lower(phrase.alias)
      const label = lower(phrase.label)
      const body = lower(phrase.body)
      if (alias !== '' && alias === term) return 1200
      if (alias !== '' && alias.startsWith(term)) return 1000 - alias.length
      if (alias !== '') {
        const match = subsequence(alias, term)
        if (match !== null) return 860 - Math.min(match.gaps, 80) - alias.length * 0.5
      }
      if (label !== '' && label === term) return 820
      if (label !== '' && label.startsWith(term)) return 780 - Math.min(label.length, 60) * 0.2
      if (label !== '' && label.includes(term)) return 720 - Math.min(label.length, 120) * 0.1
      const at = body.indexOf(term)
      if (at >= 0) return 640 - Math.min(at, 120) * 0.4 - Math.min(body.length, 600) * 0.02
      const match = subsequence(body, term)
      if (match !== null) return 420 - Math.min(match.gaps, 160)
      return null
    }

    /** Rank phrases for one query (empty query keeps source order). */
    function searchPhrases(phrases, query) {
      const normalized = query.trim().toLowerCase()
      if (normalized === '') return phrases.slice(0, MAX_RESULTS)
      const terms = normalized.split(/\s+/u).filter(Boolean)
      const scored = []
      for (const phrase of phrases) {
        let score = 0
        let matched = true
        for (const term of terms) {
          const value = scoreTerm(phrase, term)
          if (value === null) {
            matched = false
            break
          }
          score += value
        }
        if (matched) scored.push({ phrase, score })
      }
      scored.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return left.phrase.body.length - right.phrase.body.length
      })
      return scored.slice(0, MAX_RESULTS).map((entry) => entry.phrase)
    }

    /* ------------------------------------------------------------------ */
    /* Trigger detection                                                   */
    /* ------------------------------------------------------------------ */

    const WORD_CHAR = /[\p{L}\p{N}_]/u

    /** Rebuild the editor's detect text from the clipboard draft and its chips. */
    function detectTextOf(draft, occurrences) {
      if (!Array.isArray(occurrences) || occurrences.length === 0) return draft
      let out = ''
      let at = 0
      for (const occurrence of occurrences) {
        const offset = Number(occurrence?.offset)
        const length = Number(occurrence?.length)
        if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < at) continue
        out += draft.slice(at, offset) + '\uFFFC'
        at = offset + length
      }
      return out + draft.slice(at)
    }

    /**
     * Find the nearest live trigger token under the caret in detect coordinates.
     * The longest trigger wins a same-position tie (so "##" beats "#").
     * @returns {{start: number, end: number, query: string, trigger: string} | null}
     */
    function findToken(text, caret, triggers) {
      if (!Number.isFinite(caret)) return null
      const list = Array.isArray(triggers)
        ? triggers
        : typeof triggers === 'string'
          ? [triggers]
          : []
      let best = null
      for (const trigger of list) {
        if (typeof trigger !== 'string' || trigger === '') continue
        if (caret < trigger.length) continue
        const start = text.lastIndexOf(trigger, caret - trigger.length)
        if (start < 0) continue
        const end = start + trigger.length
        if (end > caret) continue
        const query = text.slice(end, caret)
        if (query.length > MAX_QUERY) continue
        if (/[\s\uFFFC]/u.test(query)) continue
        if (!/^[\p{L}\p{N}_\-·]*$/u.test(query)) continue
        const before = start > 0 ? text.charAt(start - 1) : ''
        if (before !== '' && WORD_CHAR.test(before)) continue
        if (start >= trigger.length && text.slice(start - trigger.length, start) === trigger) continue
        const token = { start, end: caret, query, trigger }
        if (
          best === null ||
          token.start > best.start ||
          (token.start === best.start && token.trigger.length > best.trigger.length)
        ) {
          best = token
        }
      }
      return best
    }

    /** Read the live editor selection through the public InputActions face. */
    function readSpan(inputActions) {
      try {
        const span = inputActions?.captureInsertion?.()
        if (
          !span ||
          !Number.isFinite(span.start) ||
          !Number.isFinite(span.end) ||
          !Number.isFinite(span.draftRev)
        ) {
          return null
        }
        return { start: span.start, end: span.end, revision: span.draftRev }
      } catch {
        return null
      }
    }

    function sameSpan(left, right) {
      return (
        left !== null &&
        right !== null &&
        left.start === right.start &&
        left.end === right.end &&
        left.revision === right.revision
      )
    }

    /** Whether the browser focus currently sits in an editable surface (the composer). */
    function editorFocused() {
      try {
        const active = document.activeElement
        return active !== null && active !== undefined && active.isContentEditable === true
      } catch {
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    const CSS = `
      .dsp-menu {
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + 8px);
        z-index: 120;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        max-height: min(360px, 52vh);
        padding: 4px;
        overflow: hidden;
        color: #1a1a1a;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
      }
      .dsp-menu * { box-sizing: border-box; }
      .dsp-menu-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px 4px;
        font-size: 11px;
        line-height: 16px;
        color: #8a8f98;
      }
      .dsp-menu-title {
        font-weight: 600;
        color: #5f6368;
      }
      .dsp-menu-hint { white-space: nowrap; }
      .dsp-menu-list {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        gap: 2px;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c9ccd1 transparent;
      }
      .dsp-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        min-height: 34px;
        padding: 6px 8px;
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        color: #1a1a1a;
        text-align: left;
        background: transparent;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
      }
      .dsp-item[data-active="true"] {
        background: #f2f3f5;
      }
      .dsp-alias {
        flex: none;
        margin-top: 1px;
        padding: 1px 6px;
        font-family: var(--ds-font-family-code, ui-monospace, monospace);
        font-size: 11px;
        line-height: 16px;
        color: #5f6368;
        background: #f2f3f5;
        border-radius: 6px;
      }
      .dsp-item-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .dsp-item-label,
      .dsp-item-body {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsp-item-body {
        font-size: 12px;
        line-height: 16px;
        color: #5f6368;
      }
      .dsp-empty {
        padding: 12px 10px;
        font-size: 12px;
        line-height: 18px;
        color: #8a8f98;
      }
      .dsp-menu-foot {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
        padding: 6px 4px 2px;
        border-top: 1px solid #f0f1f3;
      }
      .dsp-link-btn {
        padding: 4px 8px;
        font: inherit;
        font-size: 12px;
        line-height: 16px;
        color: #4d6bfe;
        background: transparent;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
      }
      .dsp-link-btn:hover { background: #f2f5ff; }
      .dsp-trigger-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 6px;
        font-family: var(--ds-font-family-code, ui-monospace, monospace);
        font-size: 12px;
        line-height: 1;
        color: var(--dsw-alias-label-secondary, #666666);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
      }
      .dsp-trigger-btn:hover {
        color: var(--dsw-alias-label-primary, #1a1a1a);
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
      }
      .dsp-settings {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-width: 820px;
        padding: 4px 0 40px;
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-primary, #1a1a1a);
      }
      .dsp-settings h2 {
        margin: 0;
        font-size: 18px;
        line-height: 26px;
        font-weight: 600;
      }
      .dsp-settings p { margin: 0; }
      .dsp-muted { color: var(--dsw-alias-label-secondary, #666666); }
      .dsp-help { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }
      .dsp-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.1));
        border-radius: var(--dsw-radius-lg, 12px);
      }
      .dsp-section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .dsp-section-title { font-weight: 600; }
      .dsp-field { display: flex; flex-direction: column; gap: 4px; }
      .dsp-field-label { font-weight: 500; }
      .dsp-input,
      .dsp-textarea {
        width: 100%;
        padding: 6px 8px;
        font: inherit;
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-primary, #1a1a1a);
        background: var(--dsw-alias-bg-base, transparent);
        border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.14));
        border-radius: var(--dsw-radius-md, 8px);
        outline: none;
      }
      .dsp-input:focus,
      .dsp-textarea:focus {
        border-color: var(--dsw-alias-brand-primary, #4d6bfe);
      }
      .dsp-textarea { resize: vertical; min-height: 52px; }
      .dsp-trigger-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dsp-trigger-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .dsp-add-trigger { align-self: flex-start; }
      .dsp-trigger-input {
        width: 84px;
        font-family: var(--ds-font-family-code, ui-monospace, monospace);
        text-align: center;
      }
      .dsp-phrase-list { display: flex; flex-direction: column; gap: 8px; }
      .dsp-phrase {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03));
        border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
        border-radius: var(--dsw-radius-md, 8px);
      }
      .dsp-phrase-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dsp-phrase-head .dsp-input { width: auto; }
      .dsp-alias-input { width: 110px !important; flex: none; }
      .dsp-label-input { flex: 1; min-width: 90px; }
      .dsp-spacer { flex: 1; }
      .dsp-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        font-size: 14px;
        line-height: 1;
        color: var(--dsw-alias-label-secondary, #666666);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
      }
      .dsp-icon-btn:hover {
        color: var(--dsw-alias-label-primary, #1a1a1a);
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
      }
      .dsp-icon-btn:disabled { opacity: 0.35; cursor: default; }
      .dsp-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dsp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 30px;
        padding: 0 12px;
        font: inherit;
        font-size: 13px;
        line-height: 1;
        border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.14));
        background: transparent;
        color: var(--dsw-alias-label-primary, #1a1a1a);
        cursor: pointer;
      }
      .dsp-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
      .dsp-btn[data-variant="primary"] {
        color: #ffffff;
        background: var(--dsw-alias-brand-primary, #4d6bfe);
        border-color: transparent;
      }
      .dsp-btn[data-variant="primary"]:hover { filter: brightness(1.05); }
      .dsp-btn:disabled { opacity: 0.55; cursor: default; }
      .dsp-notice { font-size: 12px; line-height: 18px; }
      .dsp-notice[data-kind="ok"] { color: var(--dsw-alias-state-success-primary, #1f8a4c); }
      .dsp-notice[data-kind="error"] { color: var(--dsw-alias-state-error-primary, #d33a3a); }
      .dsp-count { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }
      .dsp-settings-embedded {
        max-width: none;
        padding: 0;
      }
      .dsp-dialog-mask {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        pointer-events: auto;
        background: rgba(15, 23, 42, 0.38);
      }
      .dsp-dialog {
        display: flex;
        flex-direction: column;
        width: min(900px, 100%);
        max-height: 88vh;
        overflow: hidden;
        color: #1a1a1a;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
        outline: none;
      }
      .dsp-dialog * { box-sizing: border-box; }
      .dsp-dialog-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        border-bottom: 1px solid #eef0f2;
      }
      .dsp-dialog-title {
        font-size: 15px;
        line-height: 22px;
        font-weight: 600;
      }
      .dsp-dialog-body {
        padding: 18px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c9ccd1 transparent;
      }
      .dsp-dialog .dsp-settings { color: #1a1a1a; }
      .dsp-dialog .dsp-muted,
      .dsp-dialog .dsp-settings p { color: #5f6368; }
      .dsp-dialog .dsp-help,
      .dsp-dialog .dsp-count { color: #8a8f98; }
      .dsp-dialog .dsp-section {
        background: #ffffff;
        border-color: #e5e7eb;
      }
      .dsp-dialog .dsp-input,
      .dsp-dialog .dsp-textarea {
        color: #1a1a1a;
        background: #ffffff;
        border-color: #dcdfe4;
      }
      .dsp-dialog .dsp-input:focus,
      .dsp-dialog .dsp-textarea:focus { border-color: #4d6bfe; }
      .dsp-dialog .dsp-phrase {
        background: #f7f8fa;
        border-color: #e5e7eb;
      }
      .dsp-dialog .dsp-btn {
        color: #1a1a1a;
        border-color: #dcdfe4;
      }
      .dsp-dialog .dsp-btn:hover { background: #f2f3f5; }
      .dsp-dialog .dsp-btn[data-variant="primary"] {
        color: #ffffff;
        background: #4d6bfe;
        border-color: transparent;
      }
      .dsp-dialog .dsp-icon-btn { color: #5f6368; }
      .dsp-dialog .dsp-icon-btn:hover { color: #1a1a1a; background: #f2f3f5; }
      .dsp-dialog .dsp-notice[data-kind="ok"] { color: #1f8a4c; }
      .dsp-dialog .dsp-notice[data-kind="error"] { color: #d33a3a; }
    `

    /** One style element per mounted seat; React removes it on unmount. */
    function StyleTag() {
      return h('style', { 'data-dsh-phrases': '' }, CSS)
    }

    /* ------------------------------------------------------------------ */
    /* Composer menu                                                       */
    /* ------------------------------------------------------------------ */

    function ComposerPhrases(props) {
      const { inputActions, useInput, t, sessionId } = props
      const input = useInput((state) => state)
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const [caret, setCaret] = useState(() => readSpan(inputActions))
      const [active, setActive] = useState(0)
      const [dismissed, setDismissed] = useState(null)
      const [suppressed, setSuppressed] = useState(false)
      const rootRef = useRef(null)
      const listRef = useRef(null)
      const latest = useRef({ detectText: '', token: null, triggers: ['#'] })

      // Track the caret after every published draft change.
      useEffect(() => {
        const span = readSpan(inputActions)
        if (span === null) return
        setCaret((previous) => (sameSpan(previous, span) ? previous : span))
      }, [inputActions, input?.draft, input?.draftRev])

      // Track caret moves that do not change the draft.
      useEffect(() => {
        let frame = 0
        const update = () => {
          const span = readSpan(inputActions)
          if (span === null) return
          setCaret((previous) => (sameSpan(previous, span) ? previous : span))
        }
        const onSelectionChange = () => {
          if (frame !== 0) return
          frame = requestAnimationFrame(() => {
            frame = 0
            update()
          })
        }
        document.addEventListener('selectionchange', onSelectionChange)
        return () => {
          if (frame !== 0) cancelAnimationFrame(frame)
          document.removeEventListener('selectionchange', onSelectionChange)
        }
      }, [inputActions])

      // A fresh user gesture re-arms detection after an insertion.
      useEffect(() => {
        const rearm = () => setSuppressed((value) => (value ? false : value))
        document.addEventListener('keydown', rearm, true)
        document.addEventListener('pointerdown', rearm, true)
        return () => {
          document.removeEventListener('keydown', rearm, true)
          document.removeEventListener('pointerdown', rearm, true)
        }
      }, [])

      const triggers = state.triggers.length > 0 ? state.triggers : ['#']
      const draft = input?.draft ?? ''
      const detectText = useMemo(
        () => detectTextOf(draft, input?.occurrences),
        [draft, input?.occurrences],
      )

      let token = null
      if (
        !suppressed &&
        input &&
        input.phase === 'plain' &&
        editorFocused() &&
        caret !== null &&
        caret.start === caret.end &&
        caret.revision === input.draftRev
      ) {
        token = findToken(detectText, caret.end, triggers)
        if (
          token !== null &&
          dismissed !== null &&
          dismissed.start === token.start &&
          dismissed.query === token.query &&
          dismissed.trigger === token.trigger
        ) {
          token = null
        }
      }

      const query = token === null ? '' : token.query
      const results = useMemo(
        () => (token === null ? [] : searchPhrases(state.phrases, query)),
        [state.phrases, token?.start, query],
      )
      const open = token !== null && (query === '' || results.length > 0)
      latest.current = { detectText, token, triggers }

      useEffect(() => {
        setActive(0)
      }, [token?.start, query, results.length])

      useEffect(() => {
        if (!open) return
        const node = listRef.current
        if (node === null) return
        const activeNode = node.querySelector('[data-active="true"]')
        activeNode?.scrollIntoView?.({ block: 'nearest' })
      }, [open, active])

      const dismiss = () => {
        const current = latest.current
        if (current.token === null) return
        setDismissed({
          start: current.token.start,
          query: current.token.query,
          trigger: current.token.trigger,
        })
      }

      const commit = (phrase) => {
        const span = readSpan(inputActions)
        const current = latest.current
        if (span === null || span.start !== span.end || current.token === null) {
          dismiss()
          return
        }
        const fresh = findToken(current.detectText, span.end, current.triggers)
        if (fresh === null) {
          dismiss()
          return
        }
        setSuppressed(true)
        setDismissed(null)
        try {
          inputActions.insertText(phrase.body, {
            start: fresh.start,
            end: span.end,
            draftRev: span.revision,
          })
        } catch {
          setSuppressed(false)
        }
      }

      useEffect(() => {
        if (!open) return
        const onKeyDown = (event) => {
          if (event.isComposing || event.keyCode === 229) return
          const key = event.key
          if (key === 'ArrowDown' || key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            if (results.length === 0) return
            setActive((index) => {
              const next = key === 'ArrowDown' ? index + 1 : index - 1
              return (next + results.length) % results.length
            })
            return
          }
          if (key === 'Enter' || key === 'Tab') {
            if (key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
              return
            }
            if (key === 'Tab' && (event.ctrlKey || event.metaKey || event.altKey)) return
            if (key === 'Tab' && event.shiftKey) {
              event.preventDefault()
              event.stopPropagation()
              dismiss()
              return
            }
            if (results.length === 0) return
            event.preventDefault()
            event.stopPropagation()
            commit(results[Math.min(active, results.length - 1)])
            return
          }
          if (key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            dismiss()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [open, results, active, inputActions])

      useEffect(() => {
        if (!open) return
        const onPointerDown = (event) => {
          const node = rootRef.current
          if (node !== null && event.target instanceof Node && node.contains(event.target)) return
          dismiss()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [open])

      if (!open) return null

      const rows = []
      if (state.status === 'loading' && results.length === 0) {
        rows.push(h('div', { key: 'loading', className: 'dsp-empty' }, t('menu.loading')))
      } else if (results.length === 0) {
        rows.push(
          h(
            'div',
            { key: 'empty', className: 'dsp-empty' },
            state.phrases.length === 0 ? t('menu.noPhrases') : t('menu.empty'),
          ),
        )
      } else {
        for (let index = 0; index < results.length; index += 1) {
          const phrase = results[index]
          const lines = phrase.body.split('\n')
          const title = phrase.label !== '' ? phrase.label : lines[0]
          const preview =
            phrase.label !== ''
              ? phrase.body.replace(/\s+/gu, ' ')
              : lines.slice(1).join(' ').replace(/\s+/gu, ' ').trim()
          rows.push(
            h(
              'button',
              {
                key: phrase.id,
                type: 'button',
                role: 'option',
                'aria-selected': index === active,
                'data-active': index === active ? 'true' : 'false',
                className: 'dsp-item',
                onMouseDown: (event) => {
                  event.preventDefault()
                  commit(phrase)
                },
                onMouseMove: () => {
                  if (index !== active) setActive(index)
                },
              },
              phrase.alias !== ''
                ? h('span', { className: 'dsp-alias', 'aria-label': t('menu.alias') }, phrase.alias)
                : null,
              h(
                'span',
                { className: 'dsp-item-main' },
                h('span', { className: 'dsp-item-label' }, title),
                preview !== '' ? h('span', { className: 'dsp-item-body' }, preview) : null,
              ),
            ),
          )
        }
      }

      return h(
        'div',
        {
          ref: rootRef,
          className: 'dsp-menu',
          role: 'dialog',
          'aria-label': t('menu.title'),
        },
        h(StyleTag),
        h(
          'div',
          { className: 'dsp-menu-head' },
          h('span', { className: 'dsp-menu-title' }, t('menu.title')),
          h('span', { className: 'dsp-menu-hint' }, t('menu.hint')),
        ),
        h(
          'div',
          { ref: listRef, className: 'dsp-menu-list', role: 'listbox', 'aria-label': t('menu.title') },
          rows,
        ),
        h(
          'div',
          { className: 'dsp-menu-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsp-link-btn',
              onMouseDown: (event) => {
                event.preventDefault()
                event.stopPropagation()
                dismiss()
                openEditor(sessionId)
              },
            },
            t('menu.edit'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Composer trigger button                                             */
    /* ------------------------------------------------------------------ */

    function ComposerTrigger(props) {
      const { inputActions, useInput, t, focusComposer, sessionId } = props
      const input = useInput((state) => state)
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const triggers = state.triggers.length > 0 ? state.triggers : ['#']
      const trigger = triggers[0]
      const triggerLabel = triggers.join(' / ')

      const insertTrigger = (event) => {
        event.preventDefault()
        event.stopPropagation()
        // Put the caret back into the composer first; the click may have started
        // from an unfocused hero composer.
        focusComposer?.(sessionId)
        const span = readSpan(inputActions)
        if (span === null) return
        const draft = input?.draft ?? ''
        const end = span.end
        const before = end > 0 ? draft.slice(end - 1, end) : ''
        const prefix = before !== '' && WORD_CHAR.test(before) ? ' ' : ''
        const start = span.start
        try {
          inputActions.insertText(`${prefix}${trigger}`, {
            start,
            end,
            draftRev: span.revision,
          })
        } catch {
          // The composer may be mid-submission; the click is a no-op then.
        }
      }

      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'button',
          {
            type: 'button',
            className: 'dsp-trigger-btn',
            title: t('trigger.title', { triggers: triggerLabel }),
            'aria-label': t('trigger.title', { triggers: triggerLabel }),
            onMouseDown: insertTrigger,
          },
          trigger,
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Settings page                                                       */
    /* ------------------------------------------------------------------ */

    function cloneData(data) {
      return {
        triggers: data.triggers.slice(),
        phrases: data.phrases.map((phrase) => ({ ...phrase })),
      }
    }

    function PhrasesSettings(props) {
      const { t, embedded } = props
      const live = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const [draft, setDraft] = useState(null)
      const [saving, setSaving] = useState(false)
      const [notice, setNotice] = useState(null)

      useEffect(() => {
        setDraft(cloneData(live))
      }, [live.revision])

      const data = draft ?? cloneData(live)

      const update = (change) => {
        setDraft((current) => {
          const base = current ?? cloneData(live)
          return change({
            triggers: base.triggers.slice(),
            phrases: base.phrases.map((phrase) => ({ ...phrase })),
          })
        })
        setNotice(null)
      }

      const updatePhrase = (index, patch) => {
        update((next) => {
          next.phrases[index] = { ...next.phrases[index], ...patch }
          return next
        })
      }

      const movePhrase = (index, delta) => {
        update((next) => {
          const target = index + delta
          if (target < 0 || target >= next.phrases.length) return next
          const [phrase] = next.phrases.splice(index, 1)
          next.phrases.splice(target, 0, phrase)
          return next
        })
      }

      const removePhrase = (index) => {
        update((next) => {
          next.phrases.splice(index, 1)
          return next
        })
      }

      const addPhrase = () => {
        update((next) => {
          next.phrases.push({ id: makeId(), body: '', alias: '', label: '' })
          return next
        })
      }

      const updateTrigger = (index, value) => {
        update((next) => {
          next.triggers[index] = value
          return next
        })
      }

      const addTrigger = () => {
        update((next) => {
          if (next.triggers.length < 8) next.triggers.push('')
          return next
        })
      }

      const removeTrigger = (index) => {
        update((next) => {
          if (next.triggers.length > 1) next.triggers.splice(index, 1)
          return next
        })
      }

      const save = async () => {
        if (saving) return
        const triggers = []
        for (const raw of data.triggers) {
          const value = raw.trim()
          if (
            value === '' ||
            value.length > 8 ||
            /\s/u.test(value) ||
            value === '/' ||
            value === '@' ||
            triggers.includes(value)
          ) {
            setNotice({ kind: 'error', text: t('settings.triggerInvalid') })
            return
          }
          triggers.push(value)
        }
        if (triggers.length === 0) {
          setNotice({ kind: 'error', text: t('settings.triggerInvalid') })
          return
        }
        for (let index = 0; index < data.phrases.length; index += 1) {
          if (data.phrases[index].body.trim() === '') {
            setNotice({ kind: 'error', text: t('settings.bodyRequired', { n: index + 1 }) })
            return
          }
        }
        setSaving(true)
        setNotice(null)
        const result = await saveStore({ triggers, phrases: data.phrases })
        setSaving(false)
        if (result.ok) setNotice({ kind: 'ok', text: t('settings.saved') })
        else setNotice({ kind: 'error', text: t('settings.saveFailed', { message: result.error }) })
      }

      const revert = () => {
        setDraft(cloneData(live))
        setNotice(null)
      }

      const rows = []
      if (data.phrases.length === 0) {
        rows.push(h('div', { key: 'empty', className: 'dsp-help' }, t('settings.empty')))
      } else {
        for (let index = 0; index < data.phrases.length; index += 1) {
          const phrase = data.phrases[index]
          rows.push(
            h(
              'div',
              { key: phrase.id, className: 'dsp-phrase' },
              h(
                'div',
                { className: 'dsp-phrase-head' },
                h('input', {
                  className: 'dsp-input dsp-alias-input',
                  value: phrase.alias,
                  placeholder: t('settings.aliasPlaceholder'),
                  'aria-label': t('settings.alias'),
                  maxLength: 16,
                  onChange: (event) => updatePhrase(index, { alias: event.target.value }),
                }),
                h('input', {
                  className: 'dsp-input dsp-label-input',
                  value: phrase.label,
                  placeholder: t('settings.labelPlaceholder'),
                  'aria-label': t('settings.label'),
                  maxLength: 60,
                  onChange: (event) => updatePhrase(index, { label: event.target.value }),
                }),
                h('span', { className: 'dsp-spacer' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsp-icon-btn',
                    title: t('settings.moveUp'),
                    'aria-label': t('settings.moveUp'),
                    disabled: index === 0,
                    onClick: () => movePhrase(index, -1),
                  },
                  '↑',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsp-icon-btn',
                    title: t('settings.moveDown'),
                    'aria-label': t('settings.moveDown'),
                    disabled: index === data.phrases.length - 1,
                    onClick: () => movePhrase(index, 1),
                  },
                  '↓',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsp-icon-btn',
                    title: t('settings.remove'),
                    'aria-label': t('settings.remove'),
                    onClick: () => removePhrase(index),
                  },
                  '×',
                ),
              ),
              h('textarea', {
                className: 'dsp-textarea',
                rows: 2,
                value: phrase.body,
                placeholder: t('settings.bodyPlaceholder'),
                'aria-label': t('settings.body'),
                onChange: (event) => updatePhrase(index, { body: event.target.value }),
              }),
            ),
          )
        }
      }

      return h(
        React.Fragment,
        null,
        embedded ? null : h(StyleTag),
        h(
          'div',
          { className: embedded ? 'dsp-settings dsp-settings-embedded' : 'dsp-settings' },
          embedded ? null : h('h2', null, t('settings.title')),
          h('p', { className: 'dsp-muted' }, t('settings.description')),
          h(
            'div',
            { className: 'dsp-section' },
            h('div', { className: 'dsp-field' },
              h('span', { className: 'dsp-field-label' }, t('settings.triggers')),
              h(
                'div',
                { className: 'dsp-trigger-list' },
                data.triggers.map((value, index) =>
                  h(
                    'div',
                    { className: 'dsp-trigger-row', key: index },
                    h('input', {
                      className: 'dsp-input dsp-trigger-input',
                      value,
                      maxLength: 8,
                      placeholder: data.triggers[0] || '#',
                      'aria-label': `${t('settings.triggers')} ${index + 1}`,
                      onChange: (event) => updateTrigger(index, event.target.value),
                    }),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsp-icon-btn',
                        title: t('settings.removeTrigger'),
                        'aria-label': t('settings.removeTrigger'),
                        disabled: data.triggers.length <= 1,
                        onClick: () => removeTrigger(index),
                      },
                      '×',
                    ),
                  ),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsp-btn dsp-add-trigger',
                  disabled: data.triggers.length >= 8,
                  onClick: addTrigger,
                },
                `+ ${t('settings.addTrigger')}`,
              ),
              h('span', { className: 'dsp-help' }, t('settings.triggerHint')),
            ),
          ),
          h(
            'div',
            { className: 'dsp-section' },
            h(
              'div',
              { className: 'dsp-section-head' },
              h('span', { className: 'dsp-section-title' }, t('settings.phrases')),
              h('span', { className: 'dsp-count' }, t('settings.phraseCount', { count: data.phrases.length })),
            ),
            h('div', { className: 'dsp-phrase-list' }, rows),
            h(
              'div',
              null,
              h(
                'button',
                { type: 'button', className: 'dsp-btn', onClick: addPhrase },
                `+ ${t('settings.add')}`,
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsp-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsp-btn',
                'data-variant': 'primary',
                disabled: saving,
                onClick: save,
              },
              saving ? t('settings.saving') : t('settings.save'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsp-btn', disabled: saving, onClick: revert },
              t('settings.revert'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsp-btn',
                disabled: saving,
                onClick: () => {
                  void loadStore(true)
                },
              },
              t('settings.reload'),
            ),
            live.status === 'error'
              ? h(
                  'span',
                  { className: 'dsp-notice', 'data-kind': 'error' },
                  t('settings.loadFailed', { message: live.error ?? '' }),
                )
              : null,
            notice !== null
              ? h('span', { className: 'dsp-notice', 'data-kind': notice.kind }, notice.text)
              : null,
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Direct editor dialog                                                */
    /* ------------------------------------------------------------------ */

    function EditorDialog(props) {
      const { t, focusComposer } = props
      const state = useSyncExternalStore(editorStore.subscribe, editorStore.getSnapshot)
      const panelRef = useRef(null)
      const open = state.open

      const close = () => {
        const sessionId = state.sessionId
        closeEditor()
        if (sessionId !== null) {
          setTimeout(() => focusComposer?.(sessionId), 0)
        }
      }

      useEffect(() => {
        if (!open) return
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKeyDown = (event) => {
          if (event.isComposing) return
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          closeEditor()
          if (state.sessionId !== null) {
            setTimeout(() => focusComposer?.(state.sessionId), 0)
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        const frame = requestAnimationFrame(() => panelRef.current?.focus?.())
        return () => {
          document.body.style.overflow = previous
          document.removeEventListener('keydown', onKeyDown, true)
          if (frame) cancelAnimationFrame(frame)
        }
      }, [open, state.sessionId, focusComposer])

      if (!open) return null

      return h(
        'div',
        {
          className: 'dsp-dialog-mask',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) close()
          },
        },
        h(
          'div',
          {
            className: 'dsp-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('editor.title'),
            tabIndex: -1,
            ref: panelRef,
          },
          h(StyleTag),
          h(
            'div',
            { className: 'dsp-dialog-head' },
            h('span', { className: 'dsp-dialog-title' }, t('editor.title')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsp-icon-btn',
                title: t('editor.close'),
                'aria-label': t('editor.close'),
                onClick: close,
              },
              '×',
            ),
          ),
          h('div', { className: 'dsp-dialog-body' }, h(PhrasesSettings, { t, embedded: true })),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Client entry                                                        */
    /* ------------------------------------------------------------------ */

    /** Resolve the session composer's public focus action, if the session is retained. */
    function focusComposerFor(ctx) {
      return (sessionId) => {
        try {
          const sessions = ctx.get('sessions')
          const actx = sessions?.scope?.(sessionId)
          if (actx === undefined || actx === null) return
          const conversation = actx.get?.('conversation')
          conversation?.input?.for?.(actx)?.focus?.()
        } catch {
          // An unfocused or disposed session simply keeps the click a no-op.
        }
      }
    }

    function apply(ctx) {
      const locale = ctx.get('locale')
      if (locale) {
        ctx.effect(() => locale.register(NS, DICT), 'phrases: locale dictionaries')
      }
      const t = makeTranslator(locale)
      const focusComposer = focusComposerFor(ctx)

      if (store.getSnapshot().status === 'loading' && store.getSnapshot().phrases.length === 0) {
        void loadStore()
      }

      ctx.slots.inject('conversation.input.overlay', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.overlay',
            id: 'phrases-menu',
            order: 5,
          },
          (props) => h(ComposerPhrases, { ...props, t }),
        ),
      )

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'phrases-trigger',
            order: 40,
            label: () =>
              t('trigger.title', { triggers: store.getSnapshot().triggers.join(' / ') }),
          },
          (props) => h(ComposerTrigger, { ...props, t, focusComposer }),
        ),
      )

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'phrases',
            order: 25,
            label: () => t('settings.title'),
          },
          (props) => h(PhrasesSettings, { ...props, t }),
        ),
      )

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'phrases-editor',
            order: 20,
          },
          (props) => h(EditorDialog, { ...props, t, focusComposer }),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply,
    }
  },
})
