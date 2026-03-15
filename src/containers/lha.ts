/**
 * LHA / LZH archive parser and writer.
 *
 * Usage:
 *   const archive = parseLha(uint8Array)
 *   for (const entry of archive.entries) {
 *     console.log(entry.filename, entry.data.length)
 *   }
 */

import type { LhaArchive, LhaEntry } from './lhaTypes'
import { parseHeaders } from './lhaHeader'
import { decompress } from './lhaDecompress'
import { crc16 } from './lhaCrc'

export type { LhaArchive, LhaEntry }

/** Parse an LHA/LZH archive, decompressing all entries */
export function parseLha(data: Uint8Array): LhaArchive {
  const rawHeaders = parseHeaders(data)
  const entries: LhaEntry[] = []

  for (const hdr of rawHeaders) {
    let entryData: Uint8Array

    if (hdr.isDirectory) {
      entryData = new Uint8Array(0)
    } else {
      entryData = decompress(
        hdr.method,
        data,
        hdr.dataOffset,
        hdr.compressedSize,
        hdr.uncompressedSize,
      )

      // Verify CRC
      const computed = crc16(entryData)
      if (computed !== hdr.crc && hdr.crc !== 0) {
        console.warn(
          `LHA CRC mismatch for ${hdr.directory}${hdr.filename}: ` +
          `expected 0x${hdr.crc.toString(16)}, got 0x${computed.toString(16)}`,
        )
      }
    }

    entries.push({
      method: hdr.method,
      compressedSize: hdr.compressedSize,
      uncompressedSize: hdr.uncompressedSize,
      filename: hdr.filename,
      directory: hdr.directory,
      timestamp: hdr.timestamp,
      crc: hdr.crc,
      osId: hdr.osId,
      headerLevel: hdr.headerLevel,
      isDirectory: hdr.isDirectory,
      data: entryData,
    })
  }

  return { entries }
}
