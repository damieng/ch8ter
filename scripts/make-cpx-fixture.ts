// Generate a CPX fixture: a CPI wrapped in a minimal DOS COM, then packed
// with UPX into a COM-format executable.
//
// cpxDecoder works by emulating the UPX decompression stub, so a CPX fixture
// has to be a genuine UPX-packed COM file; it cannot be synthesised in code.
// Rather than vendor a GPL-licensed CPX from the FreeDOS package, this builds a
// CPI with this project's own writer and wraps it in a COM stub written here,
// so nothing third-party enters the repository.
//
// Requires a UPX that still packs DOS COM files. UPX 4.x and 5.x dropped the
// format; FreeDOS's own CPX files were made with UPX 1.x. Set UPX_BIN, e.g.
//   UPX_BIN=/path/to/upx-3.96/upx.exe pnpm tsx scripts/make-cpx-fixture.ts
//
// Compression level 1 matters: it selects the simplest stub. Levels 7-9 emit a
// stub using shift instructions our x86 emulator does not implement, whereas
// real FreeDOS CPX files decode fine, so the emulator is not the problem.
//
// The packed output is committed, so this only needs re-running if the CPI
// writer's layout changes.

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeCpi } from '../src/fileFormats/cpiWriter'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'src', 'testFixtures', 'cpi')
mkdirSync(fixtures, { recursive: true })

// 256 glyphs of 8x8, a regular gradient. Bulky enough for the compressor to do
// real work, and no copyrighted glyph shapes.
const glyphs = new Uint8Array(256 * 8)
for (let g = 0; g < 256; g++) {
  for (let r = 0; r < 8; r++) glyphs[g * 8 + r] = (g * 7 + r * 31) & 0xFF
}

const cpi = writeCpi({
  fontData: glyphs,
  glyphWidth: 8,
  glyphHeight: 8,
  startChar: 0,
  glyphCount: 256,
  baseline: 7,
  meta: null,
  glyphMeta: null,
  fontName: 'Fixture',
  detectedCharset: 'cp437',
})
console.log('CPI:', cpi.length, 'bytes')

// The CPI *is* the COM: its `FONT` signature sits at offset 0, which becomes
// 0x100 once loaded, and that is exactly where decompressCpx looks for it. A
// stub byte before it would shift everything by one.
const com = new Uint8Array(cpi.length)
com.set(cpi, 0)

const comPath = join(fixtures, 'sample.com')
writeFileSync(comPath, com)

const cpxPath = join(fixtures, 'sample.cpx')
if (existsSync(cpxPath)) rmSync(cpxPath)

const upx = process.env.UPX_BIN ?? 'upx'
execFileSync(upx, ['-1', '-q', '-o', cpxPath, comPath], { stdio: 'inherit' })
rmSync(comPath)
console.log('CPX written to', cpxPath)
