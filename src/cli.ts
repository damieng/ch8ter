#!/usr/bin/env node
// CLI font converter for Ch8ter bitmap font editor.
// Usage: ch8ter convert <input-file> <format> [output-file] [options]

import { readFileSync, writeFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { basename, extname, join, dirname } from 'path'
import { loadFontFile, saveFontFile, type FontConversionData } from './fontData'

// Map format names to file extensions and internal save keys
const OUTPUT_FORMATS: Record<string, { ext: string; key: string }> = {
  ch8:      { ext: '.ch8',  key: 'ch8' },
  bdf:      { ext: '.bdf',  key: 'bdf' },
  psf:      { ext: '.psf',  key: 'psf' },
  yaff:     { ext: '.yaff', key: 'yaff' },
  draw:     { ext: '.draw', key: 'draw' },
  fzx:      { ext: '.fzx',  key: 'fzx' },
  gdos:     { ext: '.fnt',  key: 'fnt' },
  pcf:      { ext: '.pcf',  key: 'pcf' },
  pdb:      { ext: '.pdb',  key: 'pdb' },
  palm:     { ext: '.pdb',  key: 'pdb' },
  atari8:   { ext: '.fnt',  key: 'atari8' },
  amiga:    { ext: '',       key: 'amiga' },
  cpm:      { ext: '.com',  key: 'com' },
}

const FORMAT_NAMES = Object.keys(OUTPUT_FORMATS).join(', ')

function usage() {
  console.error(`Ch8ter font converter

Usage: ch8ter convert <input-file> <format> [output-file] [options]

The input format is auto-detected from the file content and extension.
The output format is specified by name; the file extension is set automatically.
If output-file is omitted, the input filename is used with the new extension.

Output formats: ${FORMAT_NAMES}

Options:
  --width <N>       Glyph width for raw formats (default: 8)
  --height <N>      Glyph height for raw formats (default: 8)
  --start-char <N>  Starting character code override
  --name <string>   Font name override
  --baseline <N>    Baseline row from top (0-indexed) override

Examples:
  ch8ter convert myfont.bdf psf
  ch8ter convert myfont.ch8 bdf --width 8 --height 16
  ch8ter convert myfont.pdb yaff output.yaff
  ch8ter convert myfont.fnt atari8

Gzip-compressed inputs (.gz suffix) are decompressed transparently.
Extensionless files (e.g. Amiga font size files) are auto-detected.`)
}

function die(msg: string): never {
  console.error(`Error: ${msg}`)
  return process.exit(1) as never
}

function inputBaseName(filename: string): string {
  const base = basename(filename)
  const ext = extname(base)
  return ext ? base.slice(0, -ext.length) : base
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage()
    process.exit(args.length === 0 ? 1 : 0)
  }

  const command = args[0]
  if (command !== 'convert') {
    die(`Unknown command: ${command}\nRun with --help for usage.`)
  }

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
    die('Expected: ch8ter convert <input-file> <format> [output-file]')
  }

  const inputFile = positional[0]
  const formatName = positional[1].toLowerCase()
  const format = OUTPUT_FORMATS[formatName]
  if (!format) {
    die(`Unknown output format: ${positional[1]}\nSupported: ${FORMAT_NAMES}`)
  }

  // Determine output filename
  let outputFile: string
  if (positional.length >= 3) {
    outputFile = positional[2]
  } else {
    const base = inputBaseName(inputFile)
    if (formatName === 'amiga') {
      outputFile = join(dirname(inputFile), base + '-' + height)
    } else {
      outputFile = join(dirname(inputFile), base + format.ext)
    }
  }

  // Determine input name (strip .gz if present)
  let inputName = basename(inputFile)
  const isGz = inputName.toLowerCase().endsWith('.gz')
  if (isGz) inputName = inputName.slice(0, -3)

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
    fontData = loadFontFile(inputName, ab, { width, height, startChar })
  } catch (e) {
    die(`Failed to parse input: ${(e as Error).message}`)
  }

  // Apply overrides
  if (fontName) fontData.fontName = fontName
  if (baselineOverride !== undefined) fontData.baseline = baselineOverride

  // Write output
  let output: Uint8Array | string
  try {
    output = saveFontFile(format.key, fontData)
  } catch (e) {
    die(`Failed to write ${formatName}: ${(e as Error).message}`)
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
