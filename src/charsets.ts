/**
 * Charset definitions, signal, and pure charset utility functions.
 * Extracted from store.ts (PERF-03) to keep store.ts focused on state management.
 */

import { signal, effect } from '@preact/signals'
import { standardCodepages } from './codepages'

// --- Types ---

interface CharsetDefRaw {
  label: string
  extends?: string
  overrides: Record<number, string>
  colorSystem?: string // matches name in COLOR_SYSTEMS for preview default
  range?: [number, number] // codepoint range [lo, hi] inclusive — filters glyph grid
}

export interface CharsetDef {
  label: string
  overrides: Record<number, string>
  colorSystem?: string
  range?: [number, number]
}

// --- Data Tables ---

const CHARSETS_RAW = {
  amiga: { label: 'Amiga (ISO-8859-1)', extends: 'iso8859_1', range: [32, 255] as [number, number], colorSystem: 'Custom', overrides: {
    0x7F: '\u2302', // ⌂
  }},
  cpc: { label: 'Amstrad CPC', range: [0, 255] as [number, number], colorSystem: 'Amstrad CPC', overrides: {
    0x00: '\u25FB', 0x01: '\u23BE', 0x02: '\u23CA', 0x03: '\u23CC',
    0x04: '\u26A1', 0x05: '\u22A0', 0x06: '\u2713', 0x07: '\u237E',
    0x08: '\u2190', 0x09: '\u2192', 0x0A: '\u2193', 0x0B: '\u2191',
    0x0C: '\u21A1', 0x0D: '\u21B2', 0x0E: '\u2297', 0x0F: '\u2299',
    0x10: '\u229F', 0x11: '\u25F7', 0x12: '\u25F6', 0x13: '\u25F5',
    0x14: '\u25F4', 0x15: '\u237B', 0x16: '\u238D', 0x17: '\u22A3',
    0x18: '\u29D6', 0x19: '\u237F', 0x1A: '\u2426', 0x1B: '\u2296',
    0x1C: '\u25F0', 0x1D: '\u25F1', 0x1E: '\u25F2', 0x1F: '\u25F3',
    0x27: '\u2019', 0x5E: '\u2191', 0x7F: '\u2421',
    0x80: '\u00A0', 0x81: '\u2598', 0x82: '\u259D', 0x83: '\u2580',
    0x84: '\u2596', 0x85: '\u258C', 0x86: '\u259E', 0x87: '\u259B',
    0x88: '\u2597', 0x89: '\u259A', 0x8A: '\u2590', 0x8B: '\u259C',
    0x8C: '\u2584', 0x8D: '\u2599', 0x8E: '\u259F', 0x8F: '\u2588',
    0x90: '\u00B7', 0x91: '\u2575', 0x92: '\u2576', 0x93: '\u2514',
    0x94: '\u2577', 0x95: '\u2502', 0x96: '\u250C', 0x97: '\u251C',
    0x98: '\u2574', 0x99: '\u2518', 0x9A: '\u2500', 0x9B: '\u2534',
    0x9C: '\u2510', 0x9D: '\u2524', 0x9E: '\u252C', 0x9F: '\u253C',
    0xA0: '\u005E', 0xA1: '\u00B4', 0xA2: '\u00A8', 0xA3: '\u00A3',
    0xA4: '\u00A9', 0xA5: '\u00B6', 0xA6: '\u00A7', 0xA7: '\u2018',
    0xA8: '\u00BC', 0xA9: '\u00BD', 0xAA: '\u00BE', 0xAB: '\u00B1',
    0xAC: '\u00F7', 0xAD: '\u00AC', 0xAE: '\u00BF', 0xAF: '\u00A1',
    0xB0: '\u03B1', 0xB1: '\u03B2', 0xB2: '\u03B3', 0xB3: '\u03B4',
    0xB4: '\u03B5', 0xB5: '\u03B8', 0xB6: '\u03BB', 0xB7: '\u03BC',
    0xB8: '\u03C0', 0xB9: '\u03C3', 0xBA: '\u03C6', 0xBB: '\u03C8',
    0xBC: '\u03C7', 0xBD: '\u03C9', 0xBE: '\u03A3', 0xBF: '\u03A9',
    0xC0: '\uD83E\uDEA0', 0xC1: '\uD83E\uDEA1', 0xC2: '\uD83E\uDEA3',
    0xC3: '\uD83E\uDEA2', 0xC4: '\uD83E\uDEA7', 0xC5: '\uD83E\uDEA5',
    0xC6: '\uD83E\uDEA6', 0xC7: '\uD83E\uDEA4', 0xC8: '\uD83E\uDEA8',
    0xC9: '\uD83E\uDEA9', 0xCA: '\uD83E\uDEAE', 0xCB: '\u2573',
    0xCC: '\u2571', 0xCD: '\u2572', 0xCE: '\uD83E\uDE95', 0xCF: '\u2592',
    0xD0: '\u2594', 0xD1: '\u2595', 0xD2: '\u2581', 0xD3: '\u258F',
    0xD4: '\u25E4', 0xD5: '\u25E5', 0xD6: '\u25E2', 0xD7: '\u25E3',
    0xD8: '\uD83E\uDE8E', 0xD9: '\uD83E\uDE8D', 0xDA: '\uD83E\uDE8F',
    0xDB: '\uD83E\uDE8C', 0xDC: '\uD83E\uDE9C', 0xDD: '\uD83E\uDE9D',
    0xDE: '\uD83E\uDE9E', 0xDF: '\uD83E\uDE9F',
    0xE0: '\u263A', 0xE1: '\u2639', 0xE2: '\u2663', 0xE3: '\u2666',
    0xE4: '\u2665', 0xE5: '\u2660', 0xE6: '\u25CB', 0xE7: '\u25CF',
    0xE8: '\u25A1', 0xE9: '\u25A0', 0xEA: '\u2642', 0xEB: '\u2640',
    0xEC: '\u2669', 0xED: '\u266A', 0xEE: '\u263C', 0xEF: '\uD807\uDC57',
    0xF0: '\u2B61', 0xF1: '\u2B63', 0xF2: '\u2B60', 0xF3: '\u2B62',
    0xF4: '\u25B2', 0xF5: '\u25BC', 0xF6: '\u25B6', 0xF7: '\u25C0',
    0xF8: '\uD83E\uDFC6', 0xF9: '\uD83E\uDFC5', 0xFA: '\uD83E\uDFC7',
    0xFB: '\uD83E\uDFC8', 0xFC: '\uD807\uDC63', 0xFD: '\uD807\uDC64',
    0xFE: '\u2B65', 0xFF: '\u2B64',
  }},
  cp437: { label: 'DOS (CP437)', range: [0, 255] as [number, number], colorSystem: 'Custom', overrides: {
    0x00: '\u0000', 0x01: '\u263A', 0x02: '\u263B', 0x03: '\u2665',
    0x04: '\u2666', 0x05: '\u2663', 0x06: '\u2660', 0x07: '\u2022',
    0x08: '\u25D8', 0x09: '\u25CB', 0x0A: '\u25D9', 0x0B: '\u2642',
    0x0C: '\u2640', 0x0D: '\u266A', 0x0E: '\u266B', 0x0F: '\u263C',
    0x10: '\u25BA', 0x11: '\u25C4', 0x12: '\u2195', 0x13: '\u203C',
    0x14: '\u00B6', 0x15: '\u00A7', 0x16: '\u25AC', 0x17: '\u21A8',
    0x18: '\u2191', 0x19: '\u2193', 0x1A: '\u2192', 0x1B: '\u2190',
    0x1C: '\u221F', 0x1D: '\u2194', 0x1E: '\u25B2', 0x1F: '\u25BC',
    0x7F: '\u2302',
    0x80: '\u00C7', 0x81: '\u00FC', 0x82: '\u00E9', 0x83: '\u00E2',
    0x84: '\u00E4', 0x85: '\u00E0', 0x86: '\u00E5', 0x87: '\u00E7',
    0x88: '\u00EA', 0x89: '\u00EB', 0x8A: '\u00E8', 0x8B: '\u00EF',
    0x8C: '\u00EE', 0x8D: '\u00EC', 0x8E: '\u00C4', 0x8F: '\u00C5',
    0x90: '\u00C9', 0x91: '\u00E6', 0x92: '\u00C6', 0x93: '\u00F4',
    0x94: '\u00F6', 0x95: '\u00F2', 0x96: '\u00FB', 0x97: '\u00F9',
    0x98: '\u00FF', 0x99: '\u00D6', 0x9A: '\u00DC', 0x9B: '\u00A2',
    0x9C: '\u00A3', 0x9D: '\u00A5', 0x9E: '\u20A7', 0x9F: '\u0192',
    0xA0: '\u00E1', 0xA1: '\u00ED', 0xA2: '\u00F3', 0xA3: '\u00FA',
    0xA4: '\u00F1', 0xA5: '\u00D1', 0xA6: '\u00AA', 0xA7: '\u00BA',
    0xA8: '\u00BF', 0xA9: '\u2310', 0xAA: '\u00AC', 0xAB: '\u00BD',
    0xAC: '\u00BC', 0xAD: '\u00A1', 0xAE: '\u00AB', 0xAF: '\u00BB',
    0xB0: '\u2591', 0xB1: '\u2592', 0xB2: '\u2593', 0xB3: '\u2502',
    0xB4: '\u2524', 0xB5: '\u2561', 0xB6: '\u2562', 0xB7: '\u2556',
    0xB8: '\u2555', 0xB9: '\u2563', 0xBA: '\u2551', 0xBB: '\u2557',
    0xBC: '\u255D', 0xBD: '\u255C', 0xBE: '\u255B', 0xBF: '\u2510',
    0xC0: '\u2514', 0xC1: '\u2534', 0xC2: '\u252C', 0xC3: '\u251C',
    0xC4: '\u2500', 0xC5: '\u253C', 0xC6: '\u255E', 0xC7: '\u255F',
    0xC8: '\u255A', 0xC9: '\u2554', 0xCA: '\u2569', 0xCB: '\u2566',
    0xCC: '\u2560', 0xCD: '\u2550', 0xCE: '\u256C', 0xCF: '\u2567',
    0xD0: '\u2568', 0xD1: '\u2564', 0xD2: '\u2565', 0xD3: '\u2559',
    0xD4: '\u2558', 0xD5: '\u2552', 0xD6: '\u2553', 0xD7: '\u256B',
    0xD8: '\u256A', 0xD9: '\u2518', 0xDA: '\u250C', 0xDB: '\u2588',
    0xDC: '\u2584', 0xDD: '\u258C', 0xDE: '\u2590', 0xDF: '\u2580',
    0xE0: '\u03B1', 0xE1: '\u00DF', 0xE2: '\u0393', 0xE3: '\u03C0',
    0xE4: '\u03A3', 0xE5: '\u03C3', 0xE6: '\u00B5', 0xE7: '\u03C4',
    0xE8: '\u03A6', 0xE9: '\u0398', 0xEA: '\u03A9', 0xEB: '\u03B4',
    0xEC: '\u221E', 0xED: '\u03C6', 0xEE: '\u03B5', 0xEF: '\u2229',
    0xF0: '\u2261', 0xF1: '\u00B1', 0xF2: '\u2265', 0xF3: '\u2264',
    0xF4: '\u2320', 0xF5: '\u2321', 0xF6: '\u00F7', 0xF7: '\u2248',
    0xF8: '\u00B0', 0xF9: '\u2219', 0xFA: '\u00B7', 0xFB: '\u221A',
    0xFC: '\u207F', 0xFD: '\u00B2', 0xFE: '\u25A0', 0xFF: '\u00A0',
  }},
  cp850: { label: 'DOS (CP850)', range: [0, 255] as [number, number], colorSystem: 'Custom', overrides: {
    0x00: '\u0000', 0x01: '\u263A', 0x02: '\u263B', 0x03: '\u2665',
    0x04: '\u2666', 0x05: '\u2663', 0x06: '\u2660', 0x07: '\u2022',
    0x08: '\u25D8', 0x09: '\u25CB', 0x0A: '\u25D9', 0x0B: '\u2642',
    0x0C: '\u2640', 0x0D: '\u266A', 0x0E: '\u266B', 0x0F: '\u263C',
    0x10: '\u25BA', 0x11: '\u25C4', 0x12: '\u2195', 0x13: '\u203C',
    0x14: '\u00B6', 0x15: '\u00A7', 0x16: '\u25AC', 0x17: '\u21A8',
    0x18: '\u2191', 0x19: '\u2193', 0x1A: '\u2192', 0x1B: '\u2190',
    0x1C: '\u221F', 0x1D: '\u2194', 0x1E: '\u25B2', 0x1F: '\u25BC',
    0x7F: '\u2302',
    0x80: '\u00C7', 0x81: '\u00FC', 0x82: '\u00E9', 0x83: '\u00E2',
    0x84: '\u00E4', 0x85: '\u00E0', 0x86: '\u00E5', 0x87: '\u00E7',
    0x88: '\u00EA', 0x89: '\u00EB', 0x8A: '\u00E8', 0x8B: '\u00EF',
    0x8C: '\u00EE', 0x8D: '\u00EC', 0x8E: '\u00C4', 0x8F: '\u00C5',
    0x90: '\u00C9', 0x91: '\u00E6', 0x92: '\u00C6', 0x93: '\u00F4',
    0x94: '\u00F6', 0x95: '\u00F2', 0x96: '\u00FB', 0x97: '\u00F9',
    0x98: '\u00FF', 0x99: '\u00D6', 0x9A: '\u00DC', 0x9B: '\u00D8',
    0x9C: '\u00A3', 0x9D: '\u00D8', 0x9E: '\u00D7', 0x9F: '\u0192',
    0xA0: '\u00E1', 0xA1: '\u00ED', 0xA2: '\u00F3', 0xA3: '\u00FA',
    0xA4: '\u00F1', 0xA5: '\u00D1', 0xA6: '\u00AA', 0xA7: '\u00BA',
    0xA8: '\u00BF', 0xA9: '\u00AE', 0xAA: '\u00AC', 0xAB: '\u00BD',
    0xAC: '\u00BC', 0xAD: '\u00A1', 0xAE: '\u00AB', 0xAF: '\u00BB',
    0xB0: '\u2591', 0xB1: '\u2592', 0xB2: '\u2593', 0xB3: '\u2502',
    0xB4: '\u2524', 0xB5: '\u00C1', 0xB6: '\u00C2', 0xB7: '\u00C0',
    0xB8: '\u00A9', 0xB9: '\u2563', 0xBA: '\u2551', 0xBB: '\u2557',
    0xBC: '\u255D', 0xBD: '\u00A2', 0xBE: '\u00A5', 0xBF: '\u2510',
    0xC0: '\u2514', 0xC1: '\u2534', 0xC2: '\u252C', 0xC3: '\u251C',
    0xC4: '\u2500', 0xC5: '\u253C', 0xC6: '\u00E3', 0xC7: '\u00C3',
    0xC8: '\u255A', 0xC9: '\u2554', 0xCA: '\u2569', 0xCB: '\u2566',
    0xCC: '\u2560', 0xCD: '\u2550', 0xCE: '\u256C', 0xCF: '\u00A4',
    0xD0: '\u00F0', 0xD1: '\u00D0', 0xD2: '\u00CA', 0xD3: '\u00CB',
    0xD4: '\u00C8', 0xD5: '\u0131', 0xD6: '\u00CD', 0xD7: '\u00CE',
    0xD8: '\u00CF', 0xD9: '\u2518', 0xDA: '\u250C', 0xDB: '\u2588',
    0xDC: '\u2584', 0xDD: '\u00A6', 0xDE: '\u00CC', 0xDF: '\u2580',
    0xE0: '\u00D3', 0xE1: '\u00DF', 0xE2: '\u00D4', 0xE3: '\u00D2',
    0xE4: '\u00F5', 0xE5: '\u00D5', 0xE6: '\u00B5', 0xE7: '\u00FE',
    0xE8: '\u00DE', 0xE9: '\u00DA', 0xEA: '\u00DB', 0xEB: '\u00D9',
    0xEC: '\u00FD', 0xED: '\u00DD', 0xEE: '\u00AF', 0xEF: '\u00B4',
    0xF0: '\u00AD', 0xF1: '\u00B1', 0xF2: '\u2017', 0xF3: '\u00BE',
    0xF4: '\u00B6', 0xF5: '\u00A7', 0xF6: '\u00F7', 0xF7: '\u00B8',
    0xF8: '\u00B0', 0xF9: '\u00A8', 0xFA: '\u00B7', 0xFB: '\u00B9',
    0xFC: '\u00B3', 0xFD: '\u00B2', 0xFE: '\u25A0', 0xFF: '\u00A0',
  }},
  cpm: { label: 'Amstrad CP/M Plus', range: [0, 255] as [number, number], colorSystem: 'Custom', overrides: {
    0x00: '\u221E', 0x01: '\u2299', 0x02: '\u0393', 0x03: '\u0394',
    0x04: '\u2297', 0x05: '\u00D7', 0x06: '\u00F7', 0x07: '\u2234',
    0x08: '\u03A0', 0x09: '\u2193', 0x0A: '\u03A3', 0x0B: '\u2190',
    0x0C: '\u2192', 0x0D: '\u00B1', 0x0E: '\u2194', 0x0F: '\u03A9',
    0x10: '\u03B1', 0x11: '\u03B2', 0x12: '\u03B3', 0x13: '\u03B4',
    0x14: '\u03B5', 0x15: '\u03B8', 0x16: '\u03BB', 0x17: '\u03BC',
    0x18: '\u03C0', 0x19: '\u03C1', 0x1A: '\u03C3', 0x1B: '\u03C4',
    0x1C: '\u03C6', 0x1D: '\u03C7', 0x1E: '\u03C8', 0x1F: '\u03C9',
    0xA0: '\u00AA', 0xA1: '\u00BA', 0xA2: '\u00B0', 0xA3: '\u00A3',
    0xA4: '\u00A9', 0xA5: '\u00B6', 0xA6: '\u00A7', 0xA7: '\u2020',
    0xA8: '\u00BC', 0xA9: '\u00BD', 0xAA: '\u00BE', 0xAB: '\u00AB',
    0xAC: '\u00BB', 0xAD: '\u20A7', 0xAE: '\u00BF', 0xAF: '\u00A1',
    0xB0: '\u0192', 0xB1: '\u00A2', 0xB2: '\u00A8', 0xB3: '\u00B4',
    0xB4: '\u02C6', 0xB5: '\u2030', 0xB6: '\u215B', 0xB7: '\u215C',
    0xB8: '\u215D', 0xB9: '\u215E', 0xBA: '\u00DF', 0xBB: '\u25CB',
    0xBC: '\u2022', 0xBD: '\u00A5', 0xBE: '\u00AE', 0xBF: '\u2122',
    0xC0: '\u00C1', 0xC1: '\u00C9', 0xC2: '\u00CD', 0xC3: '\u00D3', 0xC4: '\u00DA',
    0xC5: '\u00C2', 0xC6: '\u00CA', 0xC7: '\u00CE', 0xC8: '\u00D4', 0xC9: '\u00DB',
    0xCA: '\u00C0', 0xCB: '\u00C8', 0xCC: '\u00CC', 0xCD: '\u00D2', 0xCE: '\u00D9',
    0xCF: '\u0178',
    0xD0: '\u00C4', 0xD1: '\u00CB', 0xD2: '\u00CF', 0xD3: '\u00D6', 0xD4: '\u00DC',
    0xD5: '\u00C7', 0xD6: '\u00C6', 0xD7: '\u00C5', 0xD8: '\u00D8',
    0xD9: '\u00D1', 0xDA: '\u00C3', 0xDB: '\u00D5',
    0xDC: '\u2265', 0xDD: '\u2264', 0xDE: '\u2260', 0xDF: '\u2245',
    0xE0: '\u00E1', 0xE1: '\u00E9', 0xE2: '\u00ED', 0xE3: '\u00F3', 0xE4: '\u00FA',
    0xE5: '\u00E2', 0xE6: '\u00EA', 0xE7: '\u00EE', 0xE8: '\u00F4', 0xE9: '\u00FB',
    0xEA: '\u00E0', 0xEB: '\u00E8', 0xEC: '\u00EC', 0xED: '\u00F2', 0xEE: '\u00F9',
    0xEF: '\u00FF',
    0xF0: '\u00E4', 0xF1: '\u00EB', 0xF2: '\u00EF', 0xF3: '\u00F6', 0xF4: '\u00FC',
    0xF5: '\u00E7', 0xF6: '\u00E6', 0xF7: '\u00E5', 0xF8: '\u00F8',
    0xF9: '\u00F1', 0xFA: '\u00E3', 0xFB: '\u00F5',
    0xFC: '\u21D2', 0xFD: '\u21D0', 0xFE: '\u21D4', 0xFF: '\u2261',
  }},
  ascii: { label: 'ASCII', range: [32, 126] as [number, number], overrides: {} },
  atarist: { label: 'Atari ST', extends: 'cp437', range: [32, 255] as [number, number], overrides: {
    0x9E: '\u00DF',
    0xB0: '\u00E3', 0xB1: '\u00F5', 0xB2: '\u00D8', 0xB3: '\u00F8',
    0xB4: '\u0153', 0xB5: '\u0152', 0xB6: '\u00C0', 0xB7: '\u00C3',
    0xB8: '\u00D5', 0xB9: '\u00A8', 0xBA: '\u00B4', 0xBB: '\u2020',
    0xBC: '\u00B6', 0xBD: '\u00A9', 0xBE: '\u00AE', 0xBF: '\u2122',
    0xC0: '\u0133', 0xC1: '\u0132', 0xC2: '\u05D0', 0xC3: '\u05D1',
    0xC4: '\u05D2', 0xC5: '\u05D3', 0xC6: '\u05D4', 0xC7: '\u05D5',
    0xC8: '\u05D6', 0xC9: '\u05D7', 0xCA: '\u05D8', 0xCB: '\u05D9',
    0xCC: '\u05DB', 0xCD: '\u05DC', 0xCE: '\u05DE', 0xCF: '\u05E0',
    0xD0: '\u05E1', 0xD1: '\u05E2', 0xD2: '\u05E4', 0xD3: '\u05E6',
    0xD4: '\u05E7', 0xD5: '\u05E8', 0xD6: '\u05E9', 0xD7: '\u05EA',
    0xD8: '\u05DF', 0xD9: '\u05DA', 0xDA: '\u05DD', 0xDB: '\u05E3',
    0xDC: '\u05E5', 0xDD: '\u00A7', 0xDE: '\u2227', 0xDF: '\u221E',
    0xEC: '\u222E', 0xEE: '\u2208', 0xFE: '\u00B3', 0xFF: '\u00AF',
  }},
  atari: { label: 'Atari 8-bit', range: [0, 127] as [number, number], colorSystem: 'Atari 8-bit', overrides: {
    0x00: '\u2665', 0x01: '\u251C', 0x02: '\u2595', 0x03: '\u2518',
    0x04: '\u2524', 0x05: '\u2510', 0x06: '\u2571', 0x07: '\u2572',
    0x08: '\u25E2', 0x09: '\u2597', 0x0A: '\u25E3', 0x0B: '\u259D',
    0x0C: '\u2598', 0x0D: '\u2594', 0x0E: '\u2582', 0x0F: '\u2596',
    0x10: '\u2663', 0x11: '\u250C', 0x12: '\u2500', 0x13: '\u253C',
    0x14: '\u2022', 0x15: '\u2584', 0x16: '\u258E', 0x17: '\u252C',
    0x18: '\u2534', 0x19: '\u258C', 0x1A: '\u2514', 0x1B: '\u241B',
    0x1C: '\u2191', 0x1D: '\u2193', 0x1E: '\u2190', 0x1F: '\u2192',
    0x60: '\u2666', 0x7B: '\u2660', 0x7D: '\u25D8', 0x7E: '\u25C0', 0x7F: '\u25B6',
  }},
  bbc: { label: 'BBC Micro', range: [32, 127] as [number, number], colorSystem: 'Acorn BBC Micro', overrides: {
    0x60: '\u00A3', 0x7F: '\u00A9',
  }},
  c64: { label: 'Commodore 64', range: [0, 127] as [number, number], colorSystem: 'Commodore 64', overrides: {
    0: '\u0040',
    1: '\u0061', 2: '\u0062', 3: '\u0063', 4: '\u0064', 5: '\u0065',
    6: '\u0066', 7: '\u0067', 8: '\u0068', 9: '\u0069', 10: '\u006A',
    11: '\u006B', 12: '\u006C', 13: '\u006D', 14: '\u006E', 15: '\u006F',
    16: '\u0070', 17: '\u0071', 18: '\u0072', 19: '\u0073', 20: '\u0074',
    21: '\u0075', 22: '\u0076', 23: '\u0077', 24: '\u0078', 25: '\u0079',
    26: '\u007A', 27: '\u005B', 28: '\u00A3', 29: '\u005D', 30: '\u2191', 31: '\u2190',
    64: '\u2500',
    91: '\u253C', 92: '\u2502', 93: '\u2502', 94: '\u2571', 95: '\u2572',
    96: '\u2573', 97: '\u258C', 98: '\u2584', 99: '\u2594', 100: '\u2581',
    101: '\u258E', 102: '\u2592', 103: '\u25E4', 104: '\u25E5', 105: '\u25E3',
    106: '\u25E2', 107: '\u251C', 108: '\u2597', 109: '\u2514', 110: '\u2510',
    111: '\u2582', 112: '\u250C', 113: '\u2534', 114: '\u252C', 115: '\u2524',
    116: '\u259E', 117: '\u258D', 118: '\u2595', 119: '\u2586', 120: '\u2585',
    121: '\u2583', 122: '\u2713', 123: '\u2596', 124: '\u259D', 125: '\u2518',
    126: '\u2598', 127: '\u259A',
  }},
  ...standardCodepages,
  msx: { label: 'MSX International', extends: 'cp437', range: [0, 255] as [number, number], colorSystem: 'MSX (TMS9918)', overrides: {
    0x00: '\u0000', 0x01: '\u0001', 0x02: '\u0002', 0x03: '\u0003',
    0x04: '\u0004', 0x05: '\u0005', 0x06: '\u0008', 0x07: '\u0009',
    0x08: '\u000A', 0x09: '\u000B', 0x0A: '\u000C', 0x0B: '\u000D',
    0x0C: '\u000E', 0x0D: '\u000F', 0x0E: '\u0010', 0x0F: '\u001B',
    0x10: '\u0011', 0x11: '\u0012', 0x12: '\u0013', 0x13: '\u0014',
    0x14: '\u0015', 0x15: '\u0016', 0x16: '\u0017', 0x17: '\u0018',
    0x18: '\u0019', 0x19: '\u001A', 0x1A: '\u001B', 0x1B: '\u001C',
    0x1C: '\u001D', 0x1D: '\u001E', 0x1E: '\u001F', 0x1F: '\u007F',
    0x7F: '\u25B6',
    0xB0: '\u00C3', 0xB1: '\u00E3', 0xB2: '\u0128', 0xB3: '\u0129',
    0xB4: '\u00D5', 0xB5: '\u00F5', 0xB6: '\u0170', 0xB7: '\u0171',
    0xB8: '\u0132', 0xB9: '\u0133', 0xBA: '\u00BE', 0xBB: '\u223D',
    0xBC: '\u25CA', 0xBD: '\u2030', 0xBE: '\u00B6', 0xBF: '\u00A7',
    0xC0: '\u2582', 0xC1: '\u259A', 0xC2: '\u2586', 0xC3: '\uD83E\uDEA2',
    0xC4: '\u25AC', 0xC5: '\uD83E\uDEA5', 0xC6: '\u258E', 0xC7: '\u259E',
    0xC8: '\u258A', 0xC9: '\uD83E\uDEA7', 0xCA: '\uD83E\uDEAA',
    0xCB: '\uD83E\uDEB9', 0xCC: '\uD83E\uDEB8',
    0xCD: '\uD83E\uDE6D', 0xCE: '\uD83E\uDE6F',
    0xCF: '\uD83E\uDE6C', 0xD0: '\uD83E\uDE6E',
    0xD1: '\uD83E\uDEBA', 0xD2: '\uD83E\uDEBB',
    0xD3: '\u2598', 0xD4: '\u2597', 0xD5: '\u259D', 0xD6: '\u2596',
    0xD7: '\uD83E\uDEB6',
    0xD8: '\u0394', 0xD9: '\u2021', 0xDA: '\u03C9',
    0xED: '\u2300', 0xEE: '\u2208', 0xFF: '\u2588',
  }},
  sam: { label: 'SAM Coupe', range: [32, 127] as [number, number], colorSystem: 'SAM Coup\u00e9', overrides: {
    0x60: '\u00A3', 0x7F: '\u00A9',
  }},
  zx: { label: 'ZX Spectrum', range: [32, 127] as [number, number], colorSystem: 'Sinclair ZX Spectrum', overrides: {
    0x5E: '\u2191', 0x60: '\u00A3', 0x7F: '\u00A9',
  }},
  palmos: { label: 'PalmOS 3.3', extends: 'win1252', range: [0, 255] as [number, number], overrides: {
    0x08: '\u2190', 0x09: '\u2192', 0x0A: '\u2193', 0x0B: '\u2191',
    0x14: '\u25C0', 0x15: '\u25B6', 0x16: '\u2318', 0x17: '\u2702',
    0x18: '\u2026', 0x19: '\u2007',
    0x80: '\u20AC', 0x8D: '\u2662', 0x8E: '\u2663', 0x8F: '\u2661',
    0x90: '\u2660', 0x9D: '\u2318', 0x9E: '\u2702',
  }},
}

export type Charset = keyof typeof CHARSETS_RAW

// --- Resolve extends chains ---

function resolveCharsets(raw: Record<string, CharsetDefRaw>): Record<string, CharsetDef> {
  const resolved: Record<string, CharsetDef> = {}
  function resolve(key: string): CharsetDef {
    if (resolved[key]) return resolved[key]
    const entry = raw[key]
    if (!entry) throw new Error(`Unknown charset: ${key}`)
    let overrides = entry.overrides
    if (entry.extends) {
      const base = resolve(entry.extends)
      overrides = { ...base.overrides, ...entry.overrides }
    }
    resolved[key] = { label: entry.label, overrides, colorSystem: entry.colorSystem, range: entry.range }
    return resolved[key]
  }
  for (const key of Object.keys(raw)) resolve(key)
  return resolved
}

export const CHARSETS: Record<Charset, CharsetDef> = resolveCharsets(CHARSETS_RAW) as Record<Charset, CharsetDef>

// --- Charset signal + persistence ---

const CHARSET_KEY = 'ch8ter-charset'
function loadCharset(): Charset {
  try {
    const stored = localStorage.getItem(CHARSET_KEY)
    if (stored && stored in CHARSETS_RAW) return stored as Charset
  } catch { /* ignore */ }
  return 'zx'
}
export const charset = signal<Charset>(loadCharset())
effect(() => { localStorage.setItem(CHARSET_KEY, charset.value) })

// --- Pure charset utilities ---

export function cpToUnicode(cp: number, cs: Charset): string {
  return CHARSETS[cs].overrides[cp] ?? String.fromCodePoint(cp)
}

export function buildUnicodeReverse(cs: Charset): Map<string, number> {
  const def = CHARSETS[cs]
  const map = new Map<string, number>()
  const range = def.range ?? [32, 126]
  for (let cp = range[0]; cp <= range[1]; cp++) {
    const ch = def.overrides[cp] ?? String.fromCodePoint(cp)
    if (!map.has(ch)) map.set(ch, cp)
  }
  return map
}

function hexLabel(charCode: number): string {
  return '0x' + charCode.toString(16).toUpperCase().padStart(2, '0')
}

export function charLabel(charCode: number): string {
  const overrides = CHARSETS[charset.value]?.overrides
  if (overrides && overrides[charCode] !== undefined) {
    return overrides[charCode]
  }
  if (charCode >= 33 && charCode <= 126) return String.fromCharCode(charCode)
  if (charCode >= 160 && charCode <= 255) return String.fromCharCode(charCode)
  return hexLabel(charCode)
}

// Cached reverse map for O(1) charCodeFromKey lookups
let _reverseCache: { cs: Charset; map: Map<string, number> } | null = null

export function charCodeFromKey(ch: string): number | null {
  const codepoints = [...ch]
  if (codepoints.length !== 1) return null
  const cs = charset.value
  if (!_reverseCache || _reverseCache.cs !== cs) {
    _reverseCache = { cs, map: buildUnicodeReverse(cs) }
  }
  const mapped = _reverseCache.map.get(ch)
  if (mapped !== undefined) return mapped
  const code = codepoints[0].codePointAt(0)!
  if (code >= 32 && code <= 126) return code
  return null
}

export function charsetGlyphFilter(startChar: number, range?: [number, number]): ((index: number) => boolean) | null {
  if (range) {
    const lo = range[0] - startChar
    const hi = range[1] - startChar
    return (i: number) => i >= lo && i <= hi
  }
  return null
}
