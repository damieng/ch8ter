/** LHA archive entry after decompression */
export interface LhaEntry {
  method: string          // e.g. "-lh5-"
  compressedSize: number
  uncompressedSize: number
  filename: string
  directory: string
  timestamp: Date
  crc: number
  osId: number
  headerLevel: number
  isDirectory: boolean
  data: Uint8Array        // uncompressed file data
}

export interface LhaArchive {
  entries: LhaEntry[]
}

/** Raw parsed header before decompression */
export interface LhaRawHeader {
  method: string
  compressedSize: number
  uncompressedSize: number
  filename: string
  directory: string
  timestamp: Date
  crc: number
  osId: number
  headerLevel: number
  isDirectory: boolean
  dataOffset: number      // byte offset of compressed data in the archive
}
