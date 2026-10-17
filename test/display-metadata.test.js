/**
 * Display-metadata contract for the Harness Plugin Manager, bundle details, and
 * the Settings plugin inventory. `readPluginMeta` (dsh-app-boot) resolves these
 * resources through Node's ESM resolver without activating the plugin:
 * `./locale/*.json` (`en.json` first, then every sibling language file) supplies
 * `meta.title`/`meta.description`, and `./icon` supplies the icon. A missing
 * export, a malformed dictionary, or a resource left out of `package.json#files`
 * degrades the row to package-name fallback text and generic artwork with no
 * error at runtime.
 *
 * Modeled on the brand project's scripts/smoke-metadata.mjs, expressed as a
 * `node --test` suite. Run with `node --test test/display-metadata.test.js`.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/** Harness rule: locale filenames are language ids (`en`, `zh`, `pt-BR`). */
const LANGUAGE_ID = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u
/** Harness rule: icons are SVG, PNG, JPEG, or WebP up to 256 KiB. */
const ICON_MEDIA_TYPES = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp'])
const MAX_ICON_BYTES = 256 * 1024
/** Any CJK Unified Ideograph is enough to identify the Chinese dictionary. */
const CJK = /[\u3400-\u9fff]/u

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** Resolve an exported subpath the way `readPluginMeta`'s ESM resolver does. */
function resolveExport(specifier) {
  let url
  try {
    url = import.meta.resolve(`${manifest.name}/${specifier}`)
  } catch (cause) {
    throw new Error(`exports["${specifier}"] does not resolve: ${cause.message}`)
  }
  const file = fileURLToPath(url)
  const local = relative(packageRoot, file)
  assert.ok(
    !isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`),
    `${specifier} must resolve inside the package, got ${file}`,
  )
  return file
}

/** Follow string exports, and `{ default }` condition objects, to the shipped file. */
function exportTarget(value) {
  return typeof value === 'string' ? value : value?.default
}

function assertDisplayText(language, title, description) {
  assert.equal(typeof title, 'string', `locale/${language}.json: meta.title must be a string`)
  assert.notEqual(title.trim(), '', `locale/${language}.json: meta.title must be non-empty`)
  assert.equal(typeof description, 'string', `locale/${language}.json: meta.description must be a string`)
  assert.notEqual(description.trim(), '', `locale/${language}.json: meta.description must be non-empty`)
}

test('locale dictionaries resolve through exports and carry localized display text', () => {
  const english = resolveExport('locale/en.json')
  const chinese = resolveExport('locale/zh.json')
  assert.equal(dirname(chinese), dirname(english), 'locale/zh.json must share the locale directory with en.json')

  // en.json is the discovery entry; every sibling .json is a language dictionary.
  const localeDirectory = dirname(english)
  const languages = new Map()
  for (const entry of readdirSync(localeDirectory, { withFileTypes: true })) {
    if (!entry.name.endsWith('.json')) continue
    const language = entry.name.slice(0, -5)
    assert.match(language, LANGUAGE_ID, `locale/${entry.name} must use a language id as its filename`)
    assert.ok(!languages.has(language), `locale/${entry.name} duplicates language ${language}`)
    const file = resolveExport(`locale/${entry.name}`)
    assert.equal(dirname(file), localeDirectory, `locale/${entry.name} must share the English locale directory`)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assertDisplayText(language, parsed?.meta?.title, parsed?.meta?.description)
    languages.set(language, { title: parsed.meta.title, description: parsed.meta.description })
  }

  assert.ok(languages.has('en'), 'locale/en.json (the dictionary the Harness reads first) must exist')
  assert.ok(languages.has('zh'), "locale/zh.json must ship for the plugin's Chinese audience")

  const { en, zh } = Object.fromEntries(languages)
  assert.match(zh.title, CJK, 'locale/zh.json: meta.title must be Chinese text')
  assert.match(zh.description, CJK, 'locale/zh.json: meta.description must be Chinese text')
  assert.notEqual(zh.title, en.title, 'the Chinese and English titles must differ')
  assert.notEqual(zh.description, en.description, 'the Chinese and English descriptions must differ')
})

test('icon resolves through the ./icon export as a square PNG image', () => {
  const icon = resolveExport('icon')
  const extension = extname(icon).toLowerCase()
  assert.ok(ICON_MEDIA_TYPES.has(extension), `the icon must be SVG, PNG, JPEG, or WebP, got ${extension}`)
  assert.equal(extension, '.png', 'the plugin-list icon must be the packaged icon.png')

  // The Harness reads the image as a data URL without activating the plugin; its
  // only limits are the accepted formats above and the 256 KiB ceiling.
  const iconBytes = statSync(icon).size
  assert.ok(iconBytes > 1_024, 'the icon must not be an empty or placeholder file')
  assert.ok(iconBytes <= MAX_ICON_BYTES, `the icon must stay within 256 KiB, got ${iconBytes} bytes`)

  const bytes = readFileSync(icon)
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'the icon must be a PNG file',
  )
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'the PNG must start with an IHDR chunk')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  assert.equal(width, height, `the plugin-list icon must be square, got ${width}x${height}`)
  assert.ok(width >= 128, `the plugin-list icon must be at least 128 px, got ${width}`)
})

test('package.json ships and exports the metadata resources; loader exports stay unchanged', () => {
  const files = manifest.files ?? []
  assert.ok(files.includes('icon.png'), 'package.json files must ship icon.png')
  assert.ok(files.includes('locale/*.json'), 'package.json files must ship locale/*.json')
  assert.ok(files.includes('cordis.patch.yml'), 'package.json files must ship cordis.patch.yml')

  // Both the tarball (`files`) and the resolver (`exports`) must carry them.
  assert.equal(exportTarget(manifest.exports?.['./icon']), './icon.png', 'package.json must export ./icon')
  assert.equal(exportTarget(manifest.exports?.['./locale/*.json']), './locale/*.json', 'package.json must export ./locale/*.json')

  // The loader contract the plugin already shipped with stays intact.
  assert.equal(exportTarget(manifest.exports?.['.']), './index.js', 'the host half must stay exported at "."')
  assert.equal(exportTarget(manifest.exports?.['./client']), './client.js', 'the browser half must stay exported at "./client"')
  assert.equal(exportTarget(manifest.exports?.['./cordis.patch.yml']), './cordis.patch.yml', 'the bundle patch must stay exported')
})
