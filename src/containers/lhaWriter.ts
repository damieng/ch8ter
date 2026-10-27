/**
 * LHA / LZH archive writer.
 *
 * Emits level-0 headers with the `-lh0-` (stored) method — universally
 * readable by UNLHA, lha, LhA on Amiga, DirMaster, and our own parser.
 *
 * Level-0 header layout (all multi-byte values little-endian):
 *   [0]          header size (= 22 + filename length)
 *   [1]          checksum: sum of bytes [2..headerSize-1]
 *   [2..6]       method ("-lh0-")
 *   [7..10]      compressed size
 *   [11..14]     uncompressed size
 *   [15..18]     timestamp (MS-DOS packed date/time)
 *   [19]         attribute
 *   [20]         header level (0)
 *   [21]         filename length
 *   [22..]       filename ('/' separators)
 *   [size..+1]   CRC-16 of the uncompressed data
 *   [size+2..]   file data
 */

import { crc16 } from './lhaCrc'

export interface LhaEntry {
  path: string
  data: Uint8Array
  date?: Date
}

const METHOD = [0x2D, 0x6C, 0x68, 0x30, 0x2D] // "-lh0-"

function dosTimestamp(date: Date): number {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  const dateWord = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const timeWord = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  return ((dateWord << 16) | timeWord) >>> 0
}

export function writeLhaArchive(entries: LhaEntry[], now: Date = new Date()): Uint8Array {
  if (entries.length === 0) throw new Error('Cannot write an empty LHA archive')

  const chunks: Uint8Array[] = []
  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, '/')
    const nameBytes = new TextEncoder().encode(path)
    if (nameBytes.length === 0 || nameBytes.length > 255) {
      throw new Error(`Invalid LHA entry name: "${path}"`)
    }

    const headerSize = 22 + nameBytes.length
    const header = new Uint8Array(headerSize + 2) // header + CRC
    const view = new DataView(header.buffer)

    header[0] = headerSize
    header.set(METHOD, 2)
    view.setUint32(7, entry.data.length, true)
    view.setUint32(11, entry.data.length, true)
    view.setUint32(15, dosTimestamp(entry.date ?? now), true)
    header[19] = 0x20 // attribute
    header[20] = 0    // header level
    header[21] = nameBytes.length
    header.set(nameBytes, 22)

    // Checksum: sum of bytes [2..headerSize-1]
    let sum = 0
    for (let i = 2; i < headerSize; i++) sum = (sum + header[i]) & 0xFF
    header[1] = sum

    const crc = crc16(entry.data)
    header[headerSize] = crc & 0xFF
    header[headerSize + 1] = (crc >> 8) & 0xFF

    chunks.push(header, entry.data)
  }

  // End-of-archive marker: a zero header-size byte
  chunks.push(new Uint8Array(1))

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out
}
