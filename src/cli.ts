#!/usr/bin/env node
// CLI font converter for Ch8ter bitmap font editor.
// Usage: ch8ter convert <input> <output> [options]

import { readFileSync, writeFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { basename, extname } from 'path'
import { loadFontFile, saveFontFile, type FontConversionData } from './fontData'

const LOAD_EXTS = ['.ch8', '.udg', '.bin', '.bdf', '.psf', '.psfu', '.yaff', '.draw', '.fzx', '.fnt', '.pcf', '.pdb', '.com']
const SAVE_EXTS = ['.ch8', '.udg', '.bdf', '.psf', '.yaff', '.draw', '.fzx', '.fnt', '.pcf', '.pdb', '.com']

function usage() {
  console.error(`Ch8ter font converter

Usage: ch8ter convert <input-file> <output-file> [options]

Options:
  --width <N>       Glyph width for raw formats (default: 8)
  --height <N>      Glyph height for raw formats (default: 8)
  --start-char <N>  Starting character code override
  --name <string>   Font name override
  --baseline <N>    Baseline row from top (0-indexed) override

Supported input formats:  ${LOAD_EXTS.join(', ')}
Supported output formats: ${SAVE_EXTS.join(', ')}

File extensions are used to determine format automatically.
Gzip-compressed inputs (.gz suffix) are decompressed transparently.`)
}

function die(msg: string): never {
  console.error(`Error: ${msg}`)
  return process.exit(1) as never
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage()
    process.exit(args.length === 0 ? 1 : 0)
  }

  // Parse command and args
  const command = args[0]
  if (command !== 'convert') {
    die(`Unknown command: ${command}\nRun with --help for usage.`)
  }

  let inputFile = ''
  let outputFile = ''
  let width = 8
  let height = 8
  let startChar: number | undefined
  let fontName: string | undefined
  let baselineOverride: number | undefined

  const positional: string[] = []
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--width' && i + 1 < args.length) {
      width = parseInt(args[++i], 10)
    } else if (arg === '--height' && i + 1 < args.length) {
      height = parseInt(args[++i], 10)
    } else if (arg === '--start-char' && i + 1 < args.length) {
      startChar = parseInt(args[++i], 10)
    } else if (arg === '--name' && i + 1 < args.length) {
      fontName = args[++i]
    } else if (arg === '--baseline' && i + 1 < args.length) {
      baselineOverride = parseInt(args[++i], 10)
    } else if (arg.startsWith('-')) {
      die(`Unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (positional.length < 2) {
    die('Expected: ch8ter convert <input-file> <output-file>')
  }
  inputFile = positional[0]
  outputFile = positional[1]

  // Determine input format (strip .gz if present)
  let inputName = basename(inputFile)
  const isGz = inputName.toLowerCase().endsWith('.gz')
  if (isGz) inputName = inputName.slice(0, -3)

  const inputExt = extname(inputName).toLowerCase()
  if (!LOAD_EXTS.includes(inputExt)) {
    die(`Unsupported input format: ${inputExt}\nSupported: ${LOAD_EXTS.join(', ')}`)
  }

  const outputExt = extname(outputFile).toLowerCase()
  if (!SAVE_EXTS.includes(outputExt)) {
    die(`Unsupported output format: ${outputExt}\nSupported: ${SAVE_EXTS.join(', ')}`)
  }

  // Read and decompress input
  let inputBuf: Buffer
  try {
    inputBuf = readFileSync(inputFile)
  } catch (e) {
    die(`Cannot read input file: ${(e as Error).message}`)
  }

  if (isGz) {
    try {
      inputBuf = gunzipSync(inputBuf)
    } catch (e) {
      die(`Failed to decompress .gz: ${(e as Error).message}`)
    }
  }

  // Load font
  let fontData: FontConversionData
  try {
    const ab = inputBuf.buffer.slice(inputBuf.byteOffset, inputBuf.byteOffset + inputBuf.byteLength) as ArrayBuffer
    fontData = loadFontFile(inputName, ab, {
      width, height, startChar,
    })
  } catch (e) {
    die(`Failed to parse ${inputExt}: ${(e as Error).message}`)
  }

  // Apply overrides
  if (fontName) fontData.fontName = fontName
  if (baselineOverride !== undefined) fontData.baseline = baselineOverride

  // Write output
  let output: Uint8Array | string
  try {
    output = saveFontFile(outputExt, fontData)
  } catch (e) {
    die(`Failed to write ${outputExt}: ${(e as Error).message}`)
  }

  try {
    if (typeof output === 'string') {
      writeFileSync(outputFile, output, 'utf-8')
    } else {
      writeFileSync(outputFile, output)
    }
  } catch (e) {
    die(`Cannot write output file: ${(e as Error).message}`)
  }

  console.error(
    `Converted ${inputName} (${fontData.glyphWidth}x${fontData.glyphHeight}, ${fontData.glyphCount} glyphs) -> ${basename(outputFile)}`
  )
}

main()
