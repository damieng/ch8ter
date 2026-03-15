/** CRC-16/IBM (CRC-16-ARC) — polynomial 0x8005, reflected */

const crcTable = new Uint16Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1
  }
  crcTable[i] = crc
}

export function crc16(data: Uint8Array, start = 0, end = data.length, initial = 0): number {
  let crc = initial
  for (let i = start; i < end; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF]
  }
  return crc & 0xFFFF
}
