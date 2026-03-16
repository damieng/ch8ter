// Shared utilities for TrueType font export (ttfExport.ts and ttfVarExport.ts).

export class BinaryWriter {
  private buf: DataView
  private pos = 0

  constructor(size: number) {
    this.buf = new DataView(new ArrayBuffer(size))
  }

  get offset() { return this.pos }
  set offset(v: number) { this.pos = v }
  get buffer() { return this.buf.buffer }
  get length() { return this.pos }

  u8(v: number) { this.buf.setUint8(this.pos++, v) }
  u16(v: number) { this.buf.setUint16(this.pos, v); this.pos += 2 }
  i16(v: number) { this.buf.setInt16(this.pos, v); this.pos += 2 }
  u32(v: number) { this.buf.setUint32(this.pos, v); this.pos += 4 }
  i32(v: number) { this.buf.setInt32(this.pos, v); this.pos += 4 }
  tag(s: string) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)) }

  // Fixed 16.16
  fixed(v: number) { this.i32(Math.round(v * 65536)) }

  // LONGDATETIME (int64, seconds since 1904-01-01)
  datetime(d: Date) {
    const epoch = Date.UTC(1904, 0, 1)
    const secs = Math.floor((d.getTime() - epoch) / 1000)
    this.u32(Math.floor(secs / 0x100000000))
    this.u32(secs >>> 0)
  }

  pad(alignment: number) {
    while (this.pos % alignment) this.u8(0)
  }

  bytes() { return new Uint8Array(this.buf.buffer, 0, this.pos) }
}

export function calcChecksum(data: Uint8Array): number {
  let sum = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = Math.ceil(data.byteLength / 4) * 4
  for (let i = 0; i < len; i += 4) {
    if (i + 4 <= data.byteLength) {
      sum = (sum + view.getUint32(i)) >>> 0
    } else {
      let val = 0
      for (let j = 0; j < 4; j++) {
        val = (val << 8) | (i + j < data.byteLength ? data[i + j] : 0)
      }
      sum = (sum + val) >>> 0
    }
  }
  return sum
}

export function buildCmap(glyphUnicodes: { unicode: number; glyphId: number }[]): Uint8Array {
  // Build format 4 subtable for BMP characters
  const entries = glyphUnicodes
    .filter(e => e.unicode >= 0 && e.unicode <= 0xFFFF)
    .sort((a, b) => a.unicode - b.unicode)

  // Build segments
  const segments: { start: number; end: number; delta: number }[] = []
  for (const e of entries) {
    const last = segments.length > 0 ? segments[segments.length - 1] : null
    if (last && e.unicode === last.end + 1 && e.glyphId - e.unicode === last.delta) {
      last.end = e.unicode
    } else {
      segments.push({ start: e.unicode, end: e.unicode, delta: e.glyphId - e.unicode })
    }
  }
  // Add sentinel segment
  segments.push({ start: 0xFFFF, end: 0xFFFF, delta: 1 })

  const segCount = segments.length
  const searchRange = 2 * (1 << Math.floor(Math.log2(segCount)))
  const entrySelector = Math.floor(Math.log2(segCount))
  const rangeShift = 2 * segCount - searchRange

  // Format 4 subtable size
  const fmt4Size = 16 + segCount * 8 // header(14) + reservedPad(2) + 4 arrays of segCount uint16

  // cmap header: version(2) + numTables(2) + record(8) + format4
  const w = new BinaryWriter(4 + 8 + fmt4Size)

  // cmap header
  w.u16(0)  // version
  w.u16(1)  // numTables

  // Encoding record: platform 3 (Windows), encoding 1 (Unicode BMP)
  w.u16(3)   // platformID
  w.u16(1)   // encodingID
  w.u32(12)  // offset to subtable

  // Format 4 subtable
  w.u16(4)          // format
  w.u16(fmt4Size)   // length
  w.u16(0)          // language
  w.u16(segCount * 2) // segCountX2
  w.u16(searchRange)
  w.u16(entrySelector)
  w.u16(rangeShift)

  // endCode
  for (const seg of segments) w.u16(seg.end)
  w.u16(0) // reservedPad

  // startCode
  for (const seg of segments) w.u16(seg.start)

  // idDelta
  for (const seg of segments) w.i16(seg.delta)

  // idRangeOffset (all zeros — we use delta mapping)
  for (let i = 0; i < segCount; i++) w.u16(0)

  return w.bytes()
}

export function buildName(
  familyName: string,
  styleName: string,
  extraNames: { id: number; value: string }[] = [],
): Uint8Array {
  const fullName = familyName + ' ' + styleName
  const psName = familyName.replace(/\s/g, '') + '-' + styleName
  const uniqueId = psName

  // Name records: ID 0=copyright, 1=family, 2=style, 3=uniqueId, 4=fullName, 5=version, 6=psName
  const strings = [
    { id: 1, value: familyName },
    { id: 2, value: styleName },
    { id: 3, value: uniqueId },
    { id: 4, value: fullName },
    { id: 5, value: 'Version 1.000' },
    { id: 6, value: psName },
    ...extraNames,
  ]

  // Encode as platform 3 (Windows), encoding 1 (Unicode BMP), language 0x0409 (English)
  const encodedStrings = strings.map(s => {
    const buf = new Uint8Array(s.value.length * 2)
    for (let i = 0; i < s.value.length; i++) {
      buf[i * 2] = s.value.charCodeAt(i) >> 8
      buf[i * 2 + 1] = s.value.charCodeAt(i) & 0xFF
    }
    return { id: s.id, data: buf }
  })

  const headerSize = 6 + strings.length * 12
  const totalStringSize = encodedStrings.reduce((s, e) => s + e.data.length, 0)
  const w = new BinaryWriter(headerSize + totalStringSize)

  w.u16(0) // format
  w.u16(strings.length) // count
  w.u16(headerSize) // stringOffset

  let strOffset = 0
  for (const es of encodedStrings) {
    w.u16(3)      // platformID (Windows)
    w.u16(1)      // encodingID (Unicode BMP)
    w.u16(0x0409) // languageID (English)
    w.u16(es.id)  // nameID
    w.u16(es.data.length) // length
    w.u16(strOffset)      // offset
    strOffset += es.data.length
  }

  for (const es of encodedStrings) {
    for (const b of es.data) w.u8(b)
  }

  return w.bytes()
}

export function buildPost(): Uint8Array {
  const w = new BinaryWriter(32)
  w.fixed(3.0)  // format 3.0 (no glyph names)
  w.fixed(0)    // italicAngle
  w.i16(-100)   // underlinePosition
  w.i16(50)     // underlineThickness
  w.u32(1)      // isFixedPitch
  w.u32(0)      // minMemType42
  w.u32(0)      // maxMemType42
  w.u32(0)      // minMemType1
  w.u32(0)      // maxMemType1
  return w.bytes()
}

/** Assemble table data into a complete TTF file with correct checksums. */
export function assembleTtf(tables: { tag: string; data: Uint8Array }[]): ArrayBuffer {
  // Sort tables by tag
  tables.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)

  const numTables = tables.length
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = (1 << entrySelector) * 16
  const rangeShift = numTables * 16 - searchRange

  // Calculate offsets
  const headerSize = 12 + numTables * 16
  let tableOffset = headerSize
  const tableEntries = tables.map(t => {
    const padded = t.data.length + ((4 - (t.data.length % 4)) % 4)
    const entry = { tag: t.tag, checksum: calcChecksum(t.data), offset: tableOffset, length: t.data.length, data: t.data }
    tableOffset += padded
    return entry
  })

  const totalSize = tableOffset
  const out = new BinaryWriter(totalSize)

  // Offset table
  out.u32(0x00010000)   // sfVersion (TrueType)
  out.u16(numTables)
  out.u16(searchRange)
  out.u16(entrySelector)
  out.u16(rangeShift)

  // Table records
  for (const e of tableEntries) {
    out.tag(e.tag)
    out.u32(e.checksum)
    out.u32(e.offset)
    out.u32(e.length)
  }

  // Table data
  for (const e of tableEntries) {
    for (const b of e.data) out.u8(b)
    const pad = (4 - (e.length % 4)) % 4
    for (let i = 0; i < pad; i++) out.u8(0)
  }

  // Fix head checksumAdjustment
  const fullBytes = new Uint8Array(out.buffer, 0, totalSize)
  const fullChecksum = calcChecksum(fullBytes)
  const adjustment = (0xB1B0AFBA - fullChecksum) >>> 0
  const headEntry = tableEntries.find(e => e.tag === 'head')!
  const view = new DataView(out.buffer)
  view.setUint32(headEntry.offset + 8, adjustment)

  return (out.buffer as ArrayBuffer).slice(0, totalSize)
}
