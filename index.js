/**
 * Host half of the common-phrases bundle.
 *
 * It owns the durable phrase file and one tiny same-origin HTTP endpoint
 * (`/dsh-phrases/api`) that the browser half reads and writes:
 *
 *   GET  -> { ok: true, data: { version, trigger, phrases } }
 *   PUT  -> same body shape, validates, persists atomically, returns the data
 *
 * The endpoint is intentionally not part of the Remote API: a plugin installed
 * from a local directory has no generated Typert manifest. Requests must carry
 * the `x-dsh-phrases: 1` header (which cross-site browser requests cannot send
 * without a CORS preflight this route never grants) and, when the browser sends
 * an Origin, it must match this server's origin.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Route the browser half talks to. */
const API_PATH = '/dsh-phrases/api'

/** Defaults used until the user saves a phrase file. */
const DEFAULT_DATA = {
  version: 1,
  triggers: ['#'],
  phrases: [
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
  ],
}

/** Directory that holds the phrase file. */
function dataDirectory() {
  const profile = process.env.DSH_PROFILE_DIR
  if (typeof profile === 'string' && profile.trim() !== '') return profile
  const home = process.env.DSH_HOME
  if (typeof home === 'string' && home.trim() !== '') return home
  return path.join(os.homedir(), '.dsh')
}

/** Absolute path of the durable phrase file. */
function dataFile() {
  return path.join(dataDirectory(), 'dsh-phrases.json')
}

/** Deep-copy a JSON value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Coerce one stored record into the shape the client uses; null drops it. */
function cleanPhrase(phrase, index) {
  if (phrase === null || typeof phrase !== 'object') return null
  const body = typeof phrase.body === 'string' ? phrase.body : ''
  if (body.trim() === '') return null
  const id =
    typeof phrase.id === 'string' && phrase.id.trim() !== ''
      ? phrase.id.trim()
      : `p-${String(index)}`
  return {
    id,
    body,
    alias: typeof phrase.alias === 'string' ? phrase.alias.trim() : '',
    label: typeof phrase.label === 'string' ? phrase.label.trim() : '',
  }
}

/** Upper bounds for trigger configuration. */
const MAX_TRIGGERS = 8
const MAX_TRIGGER_LENGTH = 8

/** Coerce one stored trigger field into a usable non-empty list. */
function storedTriggers(raw) {
  const list = Array.isArray(raw?.triggers)
    ? raw.triggers
    : typeof raw?.trigger === 'string'
      ? [raw.trigger]
      : []
  const result = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const value = item.trim().slice(0, MAX_TRIGGER_LENGTH)
    if (value === '' || result.includes(value) || result.length >= MAX_TRIGGERS) continue
    result.push(value)
  }
  return result.length > 0 ? result : DEFAULT_DATA.triggers.slice()
}

/** Validate a client payload; throws a user-facing Error on invalid input. */
function sanitize(input) {
  if (input === null || typeof input !== 'object') throw new Error('invalid payload')
  const list = Array.isArray(input.triggers)
    ? input.triggers
    : typeof input.trigger === 'string'
      ? [input.trigger]
      : []
  if (list.length === 0 || list.length > MAX_TRIGGERS) {
    throw new Error(`one to ${String(MAX_TRIGGERS)} triggers are required`)
  }
  const triggers = []
  for (const item of list) {
    if (typeof item !== 'string') throw new Error('each trigger must be a string')
    const value = item.trim()
    if (value === '' || value.length > MAX_TRIGGER_LENGTH || /\s/u.test(value)) {
      throw new Error(`each trigger must be 1-${String(MAX_TRIGGER_LENGTH)} non-space characters`)
    }
    if (value === '/' || value === '@') throw new Error('trigger "/" and "@" are reserved')
    if (triggers.includes(value)) throw new Error('triggers must be unique')
    triggers.push(value)
  }
  if (!Array.isArray(input.phrases)) throw new Error('phrases must be an array')
  if (input.phrases.length > 500) throw new Error('at most 500 phrases are supported')
  const phrases = []
  for (let index = 0; index < input.phrases.length; index += 1) {
    const phrase = cleanPhrase(input.phrases[index], index)
    if (phrase === null) throw new Error(`phrase ${String(index + 1)} is empty`)
    if (phrase.body.length > 20000) {
      throw new Error(`phrase ${String(index + 1)} is longer than 20000 characters`)
    }
    phrases.push(phrase)
  }
  return { version: 1, triggers, phrases }
}

/** Normalize whatever is on disk, tolerating hand edits and older shapes. */
function normalizeStored(raw) {
  if (raw === null || typeof raw !== 'object') return clone(DEFAULT_DATA)
  const triggers = storedTriggers(raw)
  const list = Array.isArray(raw.phrases) ? raw.phrases : []
  const phrases = []
  for (let index = 0; index < list.length; index += 1) {
    const phrase = cleanPhrase(list[index], index)
    if (phrase !== null) phrases.push(phrase)
  }
  return { version: 1, triggers, phrases }
}

let writeChain = Promise.resolve()

/** Read the file, creating it with defaults on first use. */
async function readData() {
  const file = dataFile()
  try {
    const text = await fs.readFile(file, 'utf8')
    return normalizeStored(JSON.parse(text))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const initial = clone(DEFAULT_DATA)
      await writeData(initial).catch(() => {})
      return initial
    }
    if (error instanceof SyntaxError) {
      throw new Error(`phrase file is not valid JSON: ${file}`)
    }
    throw error
  }
}

/** Persist one validated data object atomically. */
function writeData(data) {
  const file = dataFile()
  const run = writeChain.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp-${String(process.pid)}-${String(Date.now())}`
    await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    await fs.rename(temporary, file)
  })
  writeChain = run.catch(() => {})
  return run
}

/** Read a request body with a hard size cap. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

/** Write one JSON response. */
function send(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** Same-origin gate for one request. */
function originAllowed(webServer, request) {
  const origin = request.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    const parsed = new URL(origin)
    const own = new URL(webServer.getOrigin())
    if (parsed.port !== own.port) return false
    if (parsed.hostname === own.hostname) return true
    // Treat loopback aliases as the same local origin (localhost vs 127.0.0.1).
    const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
    return local.has(parsed.hostname) && local.has(own.hostname)
  } catch {
    return false
  }
}

/** Add the pre-multi-trigger `trigger` field so an older browser tab still reads a trigger. */
function responseData(data) {
  return { ...data, trigger: data.triggers[0] ?? '#' }
}

/** Route handler for the phrase API. */
async function handleRequest(webServer, request, response) {
  try {
    if (!originAllowed(webServer, request)) {
      send(response, 403, { ok: false, error: 'origin not allowed' })
      return
    }
    if (request.headers['x-dsh-phrases'] !== '1') {
      send(response, 403, { ok: false, error: 'missing x-dsh-phrases header' })
      return
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname !== API_PATH) {
      send(response, 404, { ok: false, error: 'not found' })
      return
    }
    if (request.method === 'GET') {
      send(response, 200, { ok: true, data: responseData(await readData()) })
      return
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      const text = await readBody(request, 1_000_000)
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('request body is not valid JSON')
      }
      const data = sanitize(parsed)
      await writeData(data)
      send(response, 200, { ok: true, data: responseData(data) })
      return
    }
    send(response, 405, { ok: false, error: 'method not allowed' })
  } catch (error) {
    send(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Host entry: register the endpoint when this composition serves HTTP. */
export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () =>
        scope.webServer.register({
          kind: 'exact',
          path: API_PATH,
          handler: (request, response) => {
            void handleRequest(scope.webServer, request, response).catch(() => {})
          },
        }),
      'phrases: HTTP endpoint',
    )
  })
}
