/**
 * LHA archive header parsing for all header levels (0, 1, 2, 3).
 */

import type { LhaRawHeader } from './lhaTypes'

/** Parse all headers from an LHA archive. Returns raw headers with data offsets. */
export function parseHeaders(data: Uint8Array): LhaRawHeader[] {
  const headers: LhaRawHeader[] = []
  let pos = 0

  while (pos < data.length) {
    if (data[pos] === 0) break // end-of-archive
    const header = parseOneHeader(data, pos)
    if (!header) break
    headers.push(header.entry)
    pos = header.entry.dataOffset + header.entry.compressedSize
  }

  return headers
}

function parseOneHeader(data: Uint8Array, pos: number): { entry: LhaRawHeader } | null {
  if (pos + 21 > data.length) return null
  const level = data[pos + 20]
  switch (level) {
    case 0: return parseLevel0(data, pos)
    case 1: return parseLevel1(data, pos)
    case 2: return parseLevel2(data, pos)
    case 3: return parseLevel3(data, pos)
    default: return null
  }
}

// ── Helpers ────────────────────────────────────────────────

function readU16(d: Uint8Array, o: number): number {
  return d[o] | (d[o + 1] << 8)
}

function readU32(d: Uint8Array, o: number): number {
  return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0
}

function readString(d: Uint8Array, o: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(d[o + i])
  return s
}

function parseDosTimestamp(raw: number): Date {
  const time = raw & 0xFFFF
  const date = (raw >>> 16) & 0xFFFF
  const seconds = (time & 0x1F) * 2
  const minutes = (time >>> 5) & 0x3F
  const hours = (time >>> 11) & 0x1F
  const day = date & 0x1F
  const month = ((date >>> 5) & 0x0F) - 1
  const year = ((date >>> 9) & 0x7F) + 1980
  return new Date(year, month, day, hours, minutes, seconds)
}

function splitPath(filename: string): { dir: string; name: string } {
  const normalized = filename.replace(/[\\\xFF]/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', name: normalized }
  return { dir: normalized.substring(0, lastSlash + 1), name: normalized.substring(lastSlash + 1) }
}

/**
 * Parse extended header chain (level 1/2).
 * Each ext header = [type(1)][data(extSize-3)][next_ext_size(2)], total extSize bytes.
 * Returns accumulated filename, directory, and total byte size of ext headers.
 */
function parseExtHeaders(
  data: Uint8Array, startPos: number, firstExtSize: number,
): { filename: string; directory: string; totalExtSize: number } {
  let filename = ''
  let directory = ''
  let totalExtSize = 0
  let extPos = startPos
  let extSize = firstExtSize

  while (extSize > 2 && extPos + extSize <= data.length) {
    const type = data[extPos]
    const dataLen = extSize - 3 // 1 byte type + dataLen bytes + 2 bytes next_size

    if (type === 0x01 && dataLen > 0) {
      filename = readString(data, extPos + 1, dataLen)
    } else if (type === 0x02 && dataLen > 0) {
      const raw = readString(data, extPos + 1, dataLen)
      directory = raw.replace(/\xFF/g, '/')
      if (directory.length > 0 && !directory.endsWith('/')) directory += '/'
    }

    totalExtSize += extSize
    // Next ext header size is the last 2 bytes of this ext header
    const nextExtSize = readU16(data, extPos + extSize - 2)
    extPos += extSize
    extSize = nextExtSize
  }

  return { filename, directory, totalExtSize }
}

// ── Level 0 ────────────────────────────────────────────────

function parseLevel0(data: Uint8Array, pos: number): { entry: LhaRawHeader } | null {
  const headerSize = data[pos]
  if (headerSize === 0) return null
  const totalHeader = headerSize + 2

  if (pos + totalHeader > data.length) return null

  const method = readString(data, pos + 2, 5)
  const compressedSize = readU32(data, pos + 7)
  const uncompressedSize = readU32(data, pos + 11)
  const timestamp = parseDosTimestamp(readU32(data, pos + 15))
  const filenameLen = data[pos + 21]
  const filename = readString(data, pos + 22, filenameLen)

  let crc = 0
  if (22 + filenameLen + 2 <= totalHeader) {
    crc = readU16(data, pos + 22 + filenameLen)
  }

  // Level 0 may have an OS ID after the CRC if there's room
  let osId = 0
  if (22 + filenameLen + 3 <= totalHeader) {
    osId = data[pos + 24 + filenameLen]
  }

  const { dir, name } = splitPath(filename)
  const isDirectory = method === '-lhd-' || filename.endsWith('/') || filename.endsWith('\\')

  return {
    entry: {
      method, compressedSize, uncompressedSize,
      filename: name, directory: dir,
      timestamp, crc, osId, headerLevel: 0, isDirectory,
      dataOffset: pos + totalHeader,
    },
  }
}

// ── Level 1 ────────────────────────────────────────────────

function parseLevel1(data: Uint8Array, pos: number): { entry: LhaRawHeader } | null {
  const headerSize = data[pos]
  if (headerSize === 0) return null
  const baseHeaderEnd = pos + headerSize + 2

  if (baseHeaderEnd > data.length) return null

  const method = readString(data, pos + 2, 5)
  const skipSize = readU32(data, pos + 7)
  const uncompressedSize = readU32(data, pos + 11)
  const timestamp = parseDosTimestamp(readU32(data, pos + 15))
  const filenameLen = data[pos + 21]
  let filename = readString(data, pos + 22, filenameLen)
  const crc = readU16(data, pos + 22 + filenameLen)
  const osId = data[pos + 24 + filenameLen]

  // First ext header size is the last 2 bytes of the base header
  const firstExtSize = readU16(data, pos + headerSize)

  // Parse extended header chain starting after the base header
  const ext = parseExtHeaders(data, baseHeaderEnd, firstExtSize)
  if (ext.filename) filename = ext.filename

  // For level 1: compressed data size = skipSize - totalExtSize
  const compressedSize = skipSize - ext.totalExtSize

  const { dir, name } = ext.directory
    ? { dir: ext.directory, name: filename }
    : splitPath(filename)
  const isDirectory = method === '-lhd-' || filename.endsWith('/')

  return {
    entry: {
      method, compressedSize, uncompressedSize,
      filename: name, directory: dir,
      timestamp, crc, osId, headerLevel: 1, isDirectory,
      dataOffset: baseHeaderEnd + ext.totalExtSize,
    },
  }
}

// ── Level 2 ────────────────────────────────────────────────

function parseLevel2(data: Uint8Array, pos: number): { entry: LhaRawHeader } | null {
  if (pos + 26 > data.length) return null

  const totalHeaderSize = readU16(data, pos)
  if (totalHeaderSize === 0) return null
  if (pos + totalHeaderSize > data.length) return null

  const method = readString(data, pos + 2, 5)
  const compressedSize = readU32(data, pos + 7)
  const uncompressedSize = readU32(data, pos + 11)
  const timestamp = new Date(readU32(data, pos + 15) * 1000)
  const crc = readU16(data, pos + 21)
  const osId = data[pos + 23]

  // First ext header size at offset 24
  const firstExtSize = readU16(data, pos + 24)

  // Extended headers start at offset 26 (after the 2-byte firstExtSize field)
  const ext = parseExtHeaders(data, pos + 26, firstExtSize)

  let filename = ext.filename
  const directory = ext.directory
  const isDirectory = method === '-lhd-' || filename.endsWith('/')

  // If no filename from extended headers, use empty
  if (!filename && !isDirectory) filename = ''

  return {
    entry: {
      method, compressedSize, uncompressedSize,
      filename, directory,
      timestamp, crc, osId, headerLevel: 2, isDirectory,
      dataOffset: pos + totalHeaderSize,
    },
  }
}

// ── Level 3 ────────────────────────────────────────────────

function parseLevel3(data: Uint8Array, pos: number): { entry: LhaRawHeader } | null {
  if (pos + 32 > data.length) return null

  const wordSize = readU16(data, pos)
  if (wordSize !== 4) return null

  const method = readString(data, pos + 2, 5)
  const compressedSize = readU32(data, pos + 7)
  const uncompressedSize = readU32(data, pos + 11)
  const timestamp = new Date(readU32(data, pos + 15) * 1000)
  const crc = readU16(data, pos + 21)
  const osId = data[pos + 23]
  const totalHeaderSize = readU32(data, pos + 24)

  // Extended headers with 4-byte size fields
  let filename = ''
  let directory = ''
  let extPos = pos + 28
  let extSize = readU32(data, extPos)
  extPos += 4

  while (extSize > 4 && extPos + extSize - 4 <= data.length) {
    const type = data[extPos]
    const dataLen = extSize - 5 // 4 bytes size + 1 byte type + dataLen

    if (type === 0x01 && dataLen > 0) {
      filename = readString(data, extPos + 1, dataLen)
    } else if (type === 0x02 && dataLen > 0) {
      const raw = readString(data, extPos + 1, dataLen)
      directory = raw.replace(/\xFF/g, '/')
      if (!directory.endsWith('/')) directory += '/'
    }

    extPos += extSize - 4
    if (extPos + 4 > data.length) break
    extSize = readU32(data, extPos)
    extPos += 4
  }

  return {
    entry: {
      method, compressedSize, uncompressedSize,
      filename, directory,
      timestamp, crc, osId, headerLevel: 3,
      isDirectory: method === '-lhd-',
      dataOffset: pos + totalHeaderSize,
    },
  }
}
