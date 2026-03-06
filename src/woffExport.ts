// Convert a TrueType font binary (ArrayBuffer) to WOFF 1.0 format.
// Uses the browser's CompressionStream API for deflate compression.

export async function ttfToWoff(ttf: ArrayBuffer): Promise<ArrayBuffer> {
  const src = new Uint8Array(ttf)
  const view = new DataView(ttf)

  // Read TrueType offset table
  const sfVersion = view.getUint32(0)
  const numTables = view.getUint16(4)

  // Parse table directory (starts at offset 12, 16 bytes per entry)
  interface TableEntry {
    tag: string
    checksum: number
    offset: number
    length: number
  }
  const tables: TableEntry[] = []
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    const tag = String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3))
    tables.push({
      tag,
      checksum: view.getUint32(off + 4),
      offset: view.getUint32(off + 8),
      length: view.getUint32(off + 12),
    })
  }

  // Compress each table with deflate
  interface WoffTableEntry {
    tag: string
    checksum: number
    origLength: number
    compData: Uint8Array
  }
  const woffTables: WoffTableEntry[] = []

  for (const t of tables) {
    const raw = src.slice(t.offset, t.offset + t.length)
    const compressed = await deflate(raw)
    // Only use compressed version if it's actually smaller
    woffTables.push({
      tag: t.tag,
      checksum: t.checksum,
      origLength: t.length,
      compData: compressed.length < raw.length ? compressed : raw,
    })
  }

  // Calculate WOFF file layout
  // Header: 44 bytes
  // Table directory: 20 bytes per table
  // Then compressed table data (each 4-byte aligned)
  const headerSize = 44
  const dirSize = 20 * numTables
  let dataOffset = headerSize + dirSize

  const tableOffsets: number[] = []
  for (const t of woffTables) {
    tableOffsets.push(dataOffset)
    dataOffset += t.compData.length
    dataOffset = (dataOffset + 3) & ~3 // 4-byte align
  }
  const totalSize = dataOffset

  // Write WOFF file
  const out = new DataView(new ArrayBuffer(totalSize))
  let pos = 0

  function w32(v: number) { out.setUint32(pos, v); pos += 4 }
  function w16(v: number) { out.setUint16(pos, v); pos += 2 }

  // WOFF header
  w32(0x774F4646)      // signature 'wOFF'
  w32(sfVersion)       // flavor (original sfVersion)
  w32(totalSize)       // WOFF file length
  w16(numTables)       // numTables
  w16(0)               // reserved
  w32(src.length)      // totalSfntSize (original TTF size)
  w16(1)               // majorVersion
  w16(0)               // minorVersion
  w32(0)               // metaOffset
  w32(0)               // metaLength
  w32(0)               // metaOrigLength
  w32(0)               // privOffset
  w32(0)               // privLength

  // Table directory
  for (let i = 0; i < numTables; i++) {
    const t = woffTables[i]
    // tag (4 bytes)
    for (let j = 0; j < 4; j++) out.setUint8(pos + j, t.tag.charCodeAt(j))
    pos += 4
    w32(tableOffsets[i])    // offset
    w32(t.compData.length)  // compLength
    w32(t.origLength)       // origLength
    w32(t.checksum)         // origChecksum
  }

  // Table data
  const outBytes = new Uint8Array(out.buffer)
  for (let i = 0; i < numTables; i++) {
    outBytes.set(woffTables[i].compData, tableOffsets[i])
  }

  return out.buffer
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  writer.write(data as unknown as BufferSource)
  writer.close()
  const reader = cs.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
