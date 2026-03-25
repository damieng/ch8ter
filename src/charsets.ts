/**
 * Charset definitions, signal, and pure charset utility functions.
 * Extracted from store.ts (PERF-03) to keep store.ts focused on state management.
 */

import { signal, effect } from '@preact/signals'

// --- Standard Codepages (ISO 8859, Windows) ---
// Each entry only contains overrides where codepoint !== Unicode value.
// Entries with 'extends' inherit all overrides from the base, then apply their own on top.

const standardCodepages = {
  iso8859_1: { label: 'ISO 8859-1 (Latin-1)', range: [32, 255] as [number, number], overrides: {} },
  iso8859_2: { label: 'ISO 8859-2 (Central European)', range: [32, 255], overrides: {
    0xA1: '\u0104', 0xA2: '\u02D8', 0xA3: '\u0141', 0xA5: '\u013D',
    0xA6: '\u015A', 0xA9: '\u0160', 0xAA: '\u015E', 0xAB: '\u0164',
    0xAC: '\u0179', 0xAE: '\u017D', 0xAF: '\u017B', 0xB1: '\u0105',
    0xB2: '\u02DB', 0xB3: '\u0142', 0xB5: '\u013E', 0xB6: '\u015B',
    0xB7: '\u02C7', 0xB9: '\u0161', 0xBA: '\u015F', 0xBB: '\u0165',
    0xBC: '\u017A', 0xBD: '\u02DD', 0xBE: '\u017E', 0xBF: '\u017C',
    0xC0: '\u0154', 0xC3: '\u0102', 0xC5: '\u0139', 0xC6: '\u0106',
    0xC8: '\u010C', 0xCA: '\u0118', 0xCC: '\u011A', 0xCF: '\u010E',
    0xD0: '\u0110', 0xD1: '\u0143', 0xD2: '\u0147', 0xD5: '\u0150',
    0xD8: '\u0158', 0xD9: '\u016E', 0xDB: '\u0170', 0xDE: '\u0162',
    0xE0: '\u0155', 0xE3: '\u0103', 0xE5: '\u013A', 0xE6: '\u0107',
    0xE8: '\u010D', 0xEA: '\u0119', 0xEC: '\u011B', 0xEF: '\u010F',
    0xF0: '\u0111', 0xF1: '\u0144', 0xF2: '\u0148', 0xF5: '\u0151',
    0xF8: '\u0159', 0xF9: '\u016F', 0xFB: '\u0171', 0xFE: '\u0163',
    0xFF: '\u02D9',
  }},
  iso8859_3: { label: 'ISO 8859-3 (South European)', range: [32, 255], overrides: {
    0xA1: '\u0126', 0xA2: '\u02D8', 0xA6: '\u0124', 0xA9: '\u0130',
    0xAA: '\u015E', 0xAB: '\u011E', 0xAC: '\u0134', 0xAF: '\u017B',
    0xB1: '\u0127', 0xB6: '\u0125', 0xB9: '\u0131', 0xBA: '\u015F',
    0xBB: '\u011F', 0xBC: '\u0135', 0xBF: '\u017C', 0xC5: '\u010A',
    0xC6: '\u0108', 0xD5: '\u0120', 0xD8: '\u011C', 0xDD: '\u016C',
    0xDE: '\u015C', 0xE5: '\u010B', 0xE6: '\u0109', 0xF5: '\u0121',
    0xF8: '\u011D', 0xFD: '\u016D', 0xFE: '\u015D', 0xFF: '\u02D9',
  }},
  iso8859_4: { label: 'ISO 8859-4 (North European)', range: [32, 255], overrides: {
    0xA1: '\u0104', 0xA2: '\u0138', 0xA3: '\u0156', 0xA5: '\u0128',
    0xA6: '\u013B', 0xA9: '\u0160', 0xAA: '\u0112', 0xAB: '\u0122',
    0xAC: '\u0166', 0xAE: '\u017D', 0xB1: '\u0105', 0xB2: '\u02DB',
    0xB3: '\u0157', 0xB5: '\u0129', 0xB6: '\u013C', 0xB7: '\u02C7',
    0xB9: '\u0161', 0xBA: '\u0113', 0xBB: '\u0123', 0xBC: '\u0167',
    0xBD: '\u014A', 0xBE: '\u017E', 0xBF: '\u014B', 0xC0: '\u0100',
    0xC7: '\u012E', 0xC8: '\u010C', 0xCA: '\u0118', 0xCC: '\u0116',
    0xCF: '\u012A', 0xD0: '\u0110', 0xD1: '\u0145', 0xD2: '\u014C',
    0xD3: '\u0136', 0xD9: '\u0172', 0xDD: '\u0168', 0xDE: '\u016A',
    0xE0: '\u0101', 0xE7: '\u012F', 0xE8: '\u010D', 0xEA: '\u0119',
    0xEC: '\u0117', 0xEF: '\u012B', 0xF0: '\u0111', 0xF1: '\u0146',
    0xF2: '\u014D', 0xF3: '\u0137', 0xF9: '\u0173', 0xFD: '\u0169',
    0xFE: '\u016B', 0xFF: '\u02D9',
  }},
  iso8859_5: { label: 'ISO 8859-5 (Cyrillic)', range: [32, 255], overrides: { 0xA1: '\u0401', 0xA2: '\u0402', 0xA3: '\u0403', 0xA4: '\u0404', 0xA5: '\u0405', 0xA6: '\u0406', 0xA7: '\u0407', 0xA8: '\u0408', 0xA9: '\u0409', 0xAA: '\u040A', 0xAB: '\u040B', 0xAC: '\u040C', 0xAE: '\u040E', 0xAF: '\u040F', 0xB0: '\u0410', 0xB1: '\u0411', 0xB2: '\u0412', 0xB3: '\u0413', 0xB4: '\u0414', 0xB5: '\u0415', 0xB6: '\u0416', 0xB7: '\u0417', 0xB8: '\u0418', 0xB9: '\u0419', 0xBA: '\u041A', 0xBB: '\u041B', 0xBC: '\u041C', 0xBD: '\u041D', 0xBE: '\u041E', 0xBF: '\u041F', 0xC0: '\u0420', 0xC1: '\u0421', 0xC2: '\u0422', 0xC3: '\u0423', 0xC4: '\u0424', 0xC5: '\u0425', 0xC6: '\u0426', 0xC7: '\u0427', 0xC8: '\u0428', 0xC9: '\u0429', 0xCA: '\u042A', 0xCB: '\u042B', 0xCC: '\u042C', 0xCD: '\u042D', 0xCE: '\u042E', 0xCF: '\u042F', 0xD0: '\u0430', 0xD1: '\u0431', 0xD2: '\u0432', 0xD3: '\u0433', 0xD4: '\u0434', 0xD5: '\u0435', 0xD6: '\u0436', 0xD7: '\u0437', 0xD8: '\u0438', 0xD9: '\u0439', 0xDA: '\u043A', 0xDB: '\u043B', 0xDC: '\u043C', 0xDD: '\u043D', 0xDE: '\u043E', 0xDF: '\u043F', 0xE0: '\u0440', 0xE1: '\u0441', 0xE2: '\u0442', 0xE3: '\u0443', 0xE4: '\u0444', 0xE5: '\u0445', 0xE6: '\u0446', 0xE7: '\u0447', 0xE8: '\u0448', 0xE9: '\u0449', 0xEA: '\u044A', 0xEB: '\u044B', 0xEC: '\u044C', 0xED: '\u044D', 0xEE: '\u044E', 0xEF: '\u044F', 0xF0: '\u2116', 0xF1: '\u0451', 0xF2: '\u0452', 0xF3: '\u0453', 0xF4: '\u0454', 0xF5: '\u0455', 0xF6: '\u0456', 0xF7: '\u0457', 0xF8: '\u0458', 0xF9: '\u0459', 0xFA: '\u045A', 0xFB: '\u045B', 0xFC: '\u045C', 0xFD: '\u00A7', 0xFE: '\u045E', 0xFF: '\u045F' }},
  iso8859_6: { label: 'ISO 8859-6 (Arabic)', range: [32, 255], overrides: { 0xAC: '\u060C', 0xBB: '\u061B', 0xBF: '\u061F', 0xC1: '\u0621', 0xC2: '\u0622', 0xC3: '\u0623', 0xC4: '\u0624', 0xC5: '\u0625', 0xC6: '\u0626', 0xC7: '\u0627', 0xC8: '\u0628', 0xC9: '\u0629', 0xCA: '\u062A', 0xCB: '\u062B', 0xCC: '\u062C', 0xCD: '\u062D', 0xCE: '\u062E', 0xCF: '\u062F', 0xD0: '\u0630', 0xD1: '\u0631', 0xD2: '\u0632', 0xD3: '\u0633', 0xD4: '\u0634', 0xD5: '\u0635', 0xD6: '\u0636', 0xD7: '\u0637', 0xD8: '\u0638', 0xD9: '\u0639', 0xDA: '\u063A', 0xE0: '\u0640', 0xE1: '\u0641', 0xE2: '\u0642', 0xE3: '\u0643', 0xE4: '\u0644', 0xE5: '\u0645', 0xE6: '\u0646', 0xE7: '\u0647', 0xE8: '\u0648', 0xE9: '\u0649', 0xEA: '\u064A', 0xEB: '\u064B', 0xEC: '\u064C', 0xED: '\u064D', 0xEE: '\u064E', 0xEF: '\u064F', 0xF0: '\u0650', 0xF1: '\u0651', 0xF2: '\u0652' }},
  iso8859_7: { label: 'ISO 8859-7 (Greek)', range: [32, 255], overrides: { 0xA1: '\u2018', 0xA2: '\u2019', 0xA4: '\u20AC', 0xA5: '\u20AF', 0xAA: '\u037A', 0xAF: '\u2015', 0xB4: '\u0384', 0xB5: '\u0385', 0xB6: '\u0386', 0xB8: '\u0388', 0xB9: '\u0389', 0xBA: '\u038A', 0xBC: '\u038C', 0xBE: '\u038E', 0xBF: '\u038F', 0xC0: '\u0390', 0xC1: '\u0391', 0xC2: '\u0392', 0xC3: '\u0393', 0xC4: '\u0394', 0xC5: '\u0395', 0xC6: '\u0396', 0xC7: '\u0397', 0xC8: '\u0398', 0xC9: '\u0399', 0xCA: '\u039A', 0xCB: '\u039B', 0xCC: '\u039C', 0xCD: '\u039D', 0xCE: '\u039E', 0xCF: '\u039F', 0xD0: '\u03A0', 0xD1: '\u03A1', 0xD3: '\u03A3', 0xD4: '\u03A4', 0xD5: '\u03A5', 0xD6: '\u03A6', 0xD7: '\u03A7', 0xD8: '\u03A8', 0xD9: '\u03A9', 0xDA: '\u03AA', 0xDB: '\u03AB', 0xDC: '\u03AC', 0xDD: '\u03AD', 0xDE: '\u03AE', 0xDF: '\u03AF', 0xE0: '\u03B0', 0xE1: '\u03B1', 0xE2: '\u03B2', 0xE3: '\u03B3', 0xE4: '\u03B4', 0xE5: '\u03B5', 0xE6: '\u03B6', 0xE7: '\u03B7', 0xE8: '\u03B8', 0xE9: '\u03B9', 0xEA: '\u03BA', 0xEB: '\u03BB', 0xEC: '\u03BC', 0xED: '\u03BD', 0xEE: '\u03BE', 0xEF: '\u03BF', 0xF0: '\u03C0', 0xF1: '\u03C1', 0xF2: '\u03C2', 0xF3: '\u03C3', 0xF4: '\u03C4', 0xF5: '\u03C5', 0xF6: '\u03C6', 0xF7: '\u03C7', 0xF8: '\u03C8', 0xF9: '\u03C9', 0xFA: '\u03CA', 0xFB: '\u03CB', 0xFC: '\u03CC', 0xFD: '\u03CD', 0xFE: '\u03CE' }},
  iso8859_8: { label: 'ISO 8859-8 (Hebrew)', range: [32, 255], overrides: { 0xAA: '\u00D7', 0xBA: '\u00F7', 0xDF: '\u2017', 0xE0: '\u05D0', 0xE1: '\u05D1', 0xE2: '\u05D2', 0xE3: '\u05D3', 0xE4: '\u05D4', 0xE5: '\u05D5', 0xE6: '\u05D6', 0xE7: '\u05D7', 0xE8: '\u05D8', 0xE9: '\u05D9', 0xEA: '\u05DA', 0xEB: '\u05DB', 0xEC: '\u05DC', 0xED: '\u05DD', 0xEE: '\u05DE', 0xEF: '\u05DF', 0xF0: '\u05E0', 0xF1: '\u05E1', 0xF2: '\u05E2', 0xF3: '\u05E3', 0xF4: '\u05E4', 0xF5: '\u05E5', 0xF6: '\u05E6', 0xF7: '\u05E7', 0xF8: '\u05E8', 0xF9: '\u05E9', 0xFA: '\u05EA', 0xFD: '\u200E', 0xFE: '\u200F' }},
  iso8859_9: { label: 'ISO 8859-9 (Turkish)', extends: 'iso8859_1', range: [32, 255], overrides: { 0xD0: '\u011E', 0xDD: '\u0130', 0xDE: '\u015E', 0xF0: '\u011F', 0xFD: '\u0131', 0xFE: '\u015F' }},
  iso8859_10: { label: 'ISO 8859-10 (Nordic)', range: [32, 255], overrides: { 0xA1: '\u0104', 0xA2: '\u0112', 0xA3: '\u0122', 0xA4: '\u012A', 0xA5: '\u0128', 0xA6: '\u0136', 0xA8: '\u013B', 0xA9: '\u0110', 0xAA: '\u0160', 0xAB: '\u0166', 0xAC: '\u017D', 0xAE: '\u016A', 0xAF: '\u014A', 0xB1: '\u0105', 0xB2: '\u0113', 0xB3: '\u0123', 0xB4: '\u012B', 0xB5: '\u0129', 0xB6: '\u0137', 0xB8: '\u013C', 0xB9: '\u0111', 0xBA: '\u0161', 0xBB: '\u0167', 0xBC: '\u017E', 0xBD: '\u2015', 0xBE: '\u016B', 0xBF: '\u014B', 0xC0: '\u0100', 0xC7: '\u012E', 0xC8: '\u010C', 0xCA: '\u0118', 0xCC: '\u0116', 0xD1: '\u0145', 0xD2: '\u014C', 0xD7: '\u0168', 0xD9: '\u0172', 0xE0: '\u0101', 0xE7: '\u012F', 0xE8: '\u010D', 0xEA: '\u0119', 0xEC: '\u0117', 0xF1: '\u0146', 0xF2: '\u014D', 0xF7: '\u0169', 0xF9: '\u0173', 0xFF: '\u0138' }},
  iso8859_13: { label: 'ISO 8859-13 (Baltic)', range: [32, 255], overrides: { 0xA1: '\u201D', 0xA5: '\u201E', 0xA8: '\u00D8', 0xAA: '\u0156', 0xAF: '\u00C6', 0xB4: '\u201C', 0xB8: '\u00F8', 0xBA: '\u0157', 0xBF: '\u00E6', 0xC0: '\u0104', 0xC1: '\u012E', 0xC2: '\u0100', 0xC3: '\u0106', 0xC6: '\u0118', 0xC7: '\u0112', 0xC8: '\u010C', 0xCA: '\u0179', 0xCB: '\u0116', 0xCC: '\u0122', 0xCD: '\u0136', 0xCE: '\u012A', 0xCF: '\u013B', 0xD0: '\u0160', 0xD1: '\u0143', 0xD2: '\u0145', 0xD4: '\u014C', 0xD8: '\u0172', 0xD9: '\u0141', 0xDA: '\u015A', 0xDB: '\u016A', 0xDD: '\u017B', 0xDE: '\u017D', 0xE0: '\u0105', 0xE1: '\u012F', 0xE2: '\u0101', 0xE3: '\u0107', 0xE6: '\u0119', 0xE7: '\u0113', 0xE8: '\u010D', 0xEA: '\u017A', 0xEB: '\u0117', 0xEC: '\u0123', 0xED: '\u0137', 0xEE: '\u012B', 0xEF: '\u013C', 0xF0: '\u0161', 0xF1: '\u0144', 0xF2: '\u0146', 0xF4: '\u014D', 0xF8: '\u0173', 0xF9: '\u0142', 0xFA: '\u015B', 0xFB: '\u016B', 0xFD: '\u017C', 0xFE: '\u017E', 0xFF: '\u2019' }},
  iso8859_14: { label: 'ISO 8859-14 (Celtic)', extends: 'iso8859_1', range: [32, 255], overrides: { 0xA1: '\u1E02', 0xA2: '\u1E03', 0xA4: '\u010A', 0xA5: '\u010B', 0xA6: '\u1E0A', 0xA8: '\u1E80', 0xAA: '\u1E82', 0xAB: '\u1E0B', 0xAC: '\u1EF2', 0xAF: '\u0178', 0xB0: '\u1E1E', 0xB1: '\u1E1F', 0xB2: '\u0120', 0xB3: '\u0121', 0xB4: '\u1E40', 0xB5: '\u1E41', 0xB7: '\u1E56', 0xB8: '\u1E81', 0xB9: '\u1E57', 0xBA: '\u1E83', 0xBB: '\u1E60', 0xBC: '\u1EF3', 0xBD: '\u1E84', 0xBE: '\u1E85', 0xBF: '\u1E61', 0xD0: '\u0174', 0xD7: '\u1E6A', 0xDE: '\u0176', 0xF0: '\u0175', 0xF7: '\u1E6B', 0xFE: '\u0177' }},
  iso8859_15: { label: 'ISO 8859-15 (Western European)', extends: 'iso8859_1', range: [32, 255], overrides: { 0xA4: '\u20AC', 0xA6: '\u0160', 0xA8: '\u0161', 0xB4: '\u017D', 0xB8: '\u017E', 0xBC: '\u0152', 0xBD: '\u0153', 0xBE: '\u0178' }},
  iso8859_16: { label: 'ISO 8859-16 (Romanian)', extends: 'iso8859_1', range: [32, 255], overrides: { 0xA1: '\u0104', 0xA2: '\u0105', 0xA3: '\u0141', 0xA4: '\u20AC', 0xA5: '\u201E', 0xA6: '\u0160', 0xA8: '\u0161', 0xAA: '\u0218', 0xAC: '\u0179', 0xAE: '\u017A', 0xAF: '\u017B', 0xB2: '\u010C', 0xB3: '\u0142', 0xB4: '\u017D', 0xB5: '\u201D', 0xB8: '\u017E', 0xB9: '\u010D', 0xBA: '\u0219', 0xBC: '\u0152', 0xBD: '\u0153', 0xBE: '\u0178', 0xBF: '\u017C', 0xC3: '\u0102', 0xC5: '\u0106', 0xD0: '\u0110', 0xD1: '\u0143', 0xD5: '\u0150', 0xD7: '\u015A', 0xD8: '\u0170', 0xDD: '\u0118', 0xDE: '\u021A', 0xE3: '\u0103', 0xE5: '\u0107', 0xF0: '\u0111', 0xF1: '\u0144', 0xF5: '\u0151', 0xF7: '\u015B', 0xF8: '\u0171', 0xFD: '\u0119', 0xFE: '\u021B' }},
  win1250: { label: 'Windows-1250 (Central European)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u015A', 0x8D: '\u0164', 0x8E: '\u017D', 0x8F: '\u0179', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u015B', 0x9D: '\u0165', 0x9E: '\u017E', 0x9F: '\u017A', 0xA1: '\u02C7', 0xA2: '\u02D8', 0xA3: '\u0141', 0xA5: '\u0104', 0xAA: '\u015E', 0xAF: '\u017B', 0xB2: '\u02DB', 0xB3: '\u0142', 0xB9: '\u0105', 0xBA: '\u015F', 0xBC: '\u013D', 0xBD: '\u02DD', 0xBE: '\u013E', 0xBF: '\u017C', 0xC0: '\u0154', 0xC3: '\u0102', 0xC5: '\u0139', 0xC6: '\u0106', 0xC8: '\u010C', 0xCA: '\u0118', 0xCC: '\u011A', 0xCF: '\u010E', 0xD0: '\u0110', 0xD1: '\u0143', 0xD2: '\u0147', 0xD5: '\u0150', 0xD8: '\u0158', 0xD9: '\u016E', 0xDB: '\u0170', 0xDE: '\u0162', 0xE0: '\u0155', 0xE3: '\u0103', 0xE5: '\u013A', 0xE6: '\u0107', 0xE8: '\u010D', 0xEA: '\u0119', 0xEC: '\u011B', 0xEF: '\u010F', 0xF0: '\u0111', 0xF1: '\u0144', 0xF2: '\u0148', 0xF5: '\u0151', 0xF8: '\u0159', 0xF9: '\u016F', 0xFB: '\u0171', 0xFE: '\u0163', 0xFF: '\u02D9' }},
  win1251: { label: 'Windows-1251 (Cyrillic)', range: [32, 255], overrides: { 0x80: '\u0402', 0x81: '\u0403', 0x82: '\u201A', 0x83: '\u0453', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u20AC', 0x89: '\u2030', 0x8A: '\u0409', 0x8B: '\u2039', 0x8C: '\u040A', 0x8D: '\u040C', 0x8E: '\u040B', 0x8F: '\u040F', 0x90: '\u0452', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x99: '\u2122', 0x9A: '\u0459', 0x9B: '\u203A', 0x9C: '\u045A', 0x9D: '\u045C', 0x9E: '\u045B', 0x9F: '\u045F', 0xA1: '\u040E', 0xA2: '\u045E', 0xA3: '\u0408', 0xA5: '\u0490', 0xA8: '\u0401', 0xAA: '\u0404', 0xAF: '\u0407', 0xB2: '\u0406', 0xB3: '\u0456', 0xB4: '\u0491', 0xB8: '\u0451', 0xB9: '\u2116', 0xBA: '\u0454', 0xBC: '\u0458', 0xBD: '\u0405', 0xBE: '\u0455', 0xBF: '\u0457', 0xC0: '\u0410', 0xC1: '\u0411', 0xC2: '\u0412', 0xC3: '\u0413', 0xC4: '\u0414', 0xC5: '\u0415', 0xC6: '\u0416', 0xC7: '\u0417', 0xC8: '\u0418', 0xC9: '\u0419', 0xCA: '\u041A', 0xCB: '\u041B', 0xCC: '\u041C', 0xCD: '\u041D', 0xCE: '\u041E', 0xCF: '\u041F', 0xD0: '\u0420', 0xD1: '\u0421', 0xD2: '\u0422', 0xD3: '\u0423', 0xD4: '\u0424', 0xD5: '\u0425', 0xD6: '\u0426', 0xD7: '\u0427', 0xD8: '\u0428', 0xD9: '\u0429', 0xDA: '\u042A', 0xDB: '\u042B', 0xDC: '\u042C', 0xDD: '\u042D', 0xDE: '\u042E', 0xDF: '\u042F', 0xE0: '\u0430', 0xE1: '\u0431', 0xE2: '\u0432', 0xE3: '\u0433', 0xE4: '\u0434', 0xE5: '\u0435', 0xE6: '\u0436', 0xE7: '\u0437', 0xE8: '\u0438', 0xE9: '\u0439', 0xEA: '\u043A', 0xEB: '\u043B', 0xEC: '\u043C', 0xED: '\u043D', 0xEE: '\u043E', 0xEF: '\u043F', 0xF0: '\u0440', 0xF1: '\u0441', 0xF2: '\u0442', 0xF3: '\u0443', 0xF4: '\u0444', 0xF5: '\u0445', 0xF6: '\u0446', 0xF7: '\u0447', 0xF8: '\u0448', 0xF9: '\u0449', 0xFA: '\u044A', 0xFB: '\u044B', 0xFC: '\u044C', 0xFD: '\u044D', 0xFE: '\u044E', 0xFF: '\u044F' }},
  win1252: { label: 'Windows-1252 / Latin-1 (Western)', extends: 'iso8859_1', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178' }},
  win1253: { label: 'Windows-1253 (Greek)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x89: '\u2030', 0x8B: '\u2039', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x99: '\u2122', 0x9B: '\u203A', 0xA1: '\u0385', 0xA2: '\u0386', 0xAF: '\u2015', 0xB4: '\u0384', 0xB8: '\u0388', 0xB9: '\u0389', 0xBA: '\u038A', 0xBC: '\u038C', 0xBE: '\u038E', 0xBF: '\u038F', 0xC0: '\u0390', 0xC1: '\u0391', 0xC2: '\u0392', 0xC3: '\u0393', 0xC4: '\u0394', 0xC5: '\u0395', 0xC6: '\u0396', 0xC7: '\u0397', 0xC8: '\u0398', 0xC9: '\u0399', 0xCA: '\u039A', 0xCB: '\u039B', 0xCC: '\u039C', 0xCD: '\u039D', 0xCE: '\u039E', 0xCF: '\u039F', 0xD0: '\u03A0', 0xD1: '\u03A1', 0xD3: '\u03A3', 0xD4: '\u03A4', 0xD5: '\u03A5', 0xD6: '\u03A6', 0xD7: '\u03A7', 0xD8: '\u03A8', 0xD9: '\u03A9', 0xDA: '\u03AA', 0xDB: '\u03AB', 0xDC: '\u03AC', 0xDD: '\u03AD', 0xDE: '\u03AE', 0xDF: '\u03AF', 0xE0: '\u03B0', 0xE1: '\u03B1', 0xE2: '\u03B2', 0xE3: '\u03B3', 0xE4: '\u03B4', 0xE5: '\u03B5', 0xE6: '\u03B6', 0xE7: '\u03B7', 0xE8: '\u03B8', 0xE9: '\u03B9', 0xEA: '\u03BA', 0xEB: '\u03BB', 0xEC: '\u03BC', 0xED: '\u03BD', 0xEE: '\u03BE', 0xEF: '\u03BF', 0xF0: '\u03C0', 0xF1: '\u03C1', 0xF2: '\u03C2', 0xF3: '\u03C3', 0xF4: '\u03C4', 0xF5: '\u03C5', 0xF6: '\u03C6', 0xF7: '\u03C7', 0xF8: '\u03C8', 0xF9: '\u03C9', 0xFA: '\u03CA', 0xFB: '\u03CB', 0xFC: '\u03CC', 0xFD: '\u03CD', 0xFE: '\u03CE' }},
  win1254: { label: 'Windows-1254 (Turkish)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153', 0x9F: '\u0178', 0xD0: '\u011E', 0xDD: '\u0130', 0xDE: '\u015E', 0xF0: '\u011F', 0xFD: '\u0131', 0xFE: '\u015F' }},
  win1255: { label: 'Windows-1255 (Hebrew)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8B: '\u2039', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC', 0x99: '\u2122', 0x9B: '\u203A', 0xA4: '\u20AA', 0xAA: '\u00D7', 0xBA: '\u00F7', 0xC0: '\u05B0', 0xC1: '\u05B1', 0xC2: '\u05B2', 0xC3: '\u05B3', 0xC4: '\u05B4', 0xC5: '\u05B5', 0xC6: '\u05B6', 0xC7: '\u05B7', 0xC8: '\u05B8', 0xC9: '\u05B9', 0xCB: '\u05BB', 0xCC: '\u05BC', 0xCD: '\u05BD', 0xCE: '\u05BE', 0xCF: '\u05BF', 0xD0: '\u05C0', 0xD1: '\u05C1', 0xD2: '\u05C2', 0xD3: '\u05C3', 0xD4: '\u05F0', 0xD5: '\u05F1', 0xD6: '\u05F2', 0xD7: '\u05F3', 0xD8: '\u05F4', 0xE0: '\u05D0', 0xE1: '\u05D1', 0xE2: '\u05D2', 0xE3: '\u05D3', 0xE4: '\u05D4', 0xE5: '\u05D5', 0xE6: '\u05D6', 0xE7: '\u05D7', 0xE8: '\u05D8', 0xE9: '\u05D9', 0xEA: '\u05DA', 0xEB: '\u05DB', 0xEC: '\u05DC', 0xED: '\u05DD', 0xEE: '\u05DE', 0xEF: '\u05DF', 0xF0: '\u05E0', 0xF1: '\u05E1', 0xF2: '\u05E2', 0xF3: '\u05E3', 0xF4: '\u05E4', 0xF5: '\u05E5', 0xF6: '\u05E6', 0xF7: '\u05E7', 0xF8: '\u05E8', 0xF9: '\u05E9', 0xFA: '\u05EA', 0xFD: '\u200E', 0xFE: '\u200F' }},
  win1256: { label: 'Windows-1256 (Arabic)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x81: '\u067E', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0679', 0x8B: '\u2039', 0x8C: '\u0152', 0x8D: '\u0686', 0x8E: '\u0698', 0x8F: '\u0688', 0x90: '\u06AF', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u06A9', 0x99: '\u2122', 0x9A: '\u0691', 0x9B: '\u203A', 0x9C: '\u0153', 0x9D: '\u200C', 0x9E: '\u200D', 0x9F: '\u06BA', 0xA1: '\u060C', 0xAA: '\u06BE', 0xBA: '\u061B', 0xBF: '\u061F', 0xC0: '\u06C1', 0xC1: '\u0621', 0xC2: '\u0622', 0xC3: '\u0623', 0xC4: '\u0624', 0xC5: '\u0625', 0xC6: '\u0626', 0xC7: '\u0627', 0xC8: '\u0628', 0xC9: '\u0629', 0xCA: '\u062A', 0xCB: '\u062B', 0xCC: '\u062C', 0xCD: '\u062D', 0xCE: '\u062E', 0xCF: '\u062F', 0xD0: '\u0630', 0xD1: '\u0631', 0xD2: '\u0632', 0xD3: '\u0633', 0xD4: '\u0634', 0xD5: '\u0635', 0xD6: '\u0636', 0xD8: '\u0637', 0xD9: '\u0638', 0xDA: '\u0639', 0xDB: '\u063A', 0xDC: '\u0640', 0xDD: '\u0641', 0xDE: '\u0642', 0xDF: '\u0643', 0xE1: '\u0644', 0xE3: '\u0645', 0xE4: '\u0646', 0xE5: '\u0647', 0xE6: '\u0648', 0xEC: '\u0649', 0xED: '\u064A', 0xF0: '\u064B', 0xF1: '\u064C', 0xF2: '\u064D', 0xF3: '\u064E', 0xF5: '\u064F', 0xF6: '\u0650', 0xF8: '\u0651', 0xFA: '\u0652', 0xFD: '\u200E', 0xFE: '\u200F', 0xFF: '\u06D2' }},
  win1257: { label: 'Windows-1257 (Baltic)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x89: '\u2030', 0x8B: '\u2039', 0x8D: '\u00A8', 0x8E: '\u02C7', 0x8F: '\u00B8', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x99: '\u2122', 0x9B: '\u203A', 0x9D: '\u00AF', 0x9E: '\u02DB', 0xA8: '\u00D8', 0xAA: '\u0156', 0xAF: '\u00C6', 0xB8: '\u00F8', 0xBA: '\u0157', 0xBF: '\u00E6', 0xC0: '\u0104', 0xC1: '\u012E', 0xC2: '\u0100', 0xC3: '\u0106', 0xC6: '\u0118', 0xC7: '\u0112', 0xC8: '\u010C', 0xCA: '\u0179', 0xCB: '\u0116', 0xCC: '\u0122', 0xCD: '\u0136', 0xCE: '\u012A', 0xCF: '\u013B', 0xD0: '\u0160', 0xD1: '\u0143', 0xD2: '\u0145', 0xD4: '\u014C', 0xD8: '\u0172', 0xD9: '\u0141', 0xDA: '\u015A', 0xDB: '\u016A', 0xDD: '\u017B', 0xDE: '\u017D', 0xE0: '\u0105', 0xE1: '\u012F', 0xE2: '\u0101', 0xE3: '\u0107', 0xE6: '\u0119', 0xE7: '\u0113', 0xE8: '\u010D', 0xEA: '\u017A', 0xEB: '\u0117', 0xEC: '\u0123', 0xED: '\u0137', 0xEE: '\u012B', 0xEF: '\u013C', 0xF0: '\u0161', 0xF1: '\u0144', 0xF2: '\u0146', 0xF4: '\u014D', 0xF8: '\u0173', 0xF9: '\u0142', 0xFA: '\u015B', 0xFB: '\u016B', 0xFD: '\u017C', 0xFE: '\u017E', 0xFF: '\u02D9' }},
  win1258: { label: 'Windows-1258 (Vietnamese)', range: [32, 255], overrides: { 0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8B: '\u2039', 0x8C: '\u0152', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC', 0x99: '\u2122', 0x9B: '\u203A', 0x9C: '\u0153', 0x9F: '\u0178', 0xC3: '\u0102', 0xCC: '\u0300', 0xD0: '\u0110', 0xD2: '\u0309', 0xD5: '\u01A0', 0xDD: '\u01AF', 0xDE: '\u0303', 0xE3: '\u0103', 0xEC: '\u0301', 0xF0: '\u0111', 0xF2: '\u0323', 0xF5: '\u01A1', 0xFD: '\u01B0', 0xFE: '\u20AB' }},
} satisfies Record<string, { label: string; extends?: string; overrides: Record<number, string>; range?: [number, number] }>

// Map BDF CHARSET_REGISTRY + CHARSET_ENCODING to our charset keys
export const bdfCharsetMap: Record<string, string> = {
  'ISO8859-1': 'iso8859_1', 'ISO8859-2': 'iso8859_2', 'ISO8859-3': 'iso8859_3',
  'ISO8859-4': 'iso8859_4', 'ISO8859-5': 'iso8859_5', 'ISO8859-6': 'iso8859_6',
  'ISO8859-7': 'iso8859_7', 'ISO8859-8': 'iso8859_8', 'ISO8859-9': 'iso8859_9',
  'ISO8859-10': 'iso8859_10', 'ISO8859-13': 'iso8859_13', 'ISO8859-14': 'iso8859_14',
  'ISO8859-15': 'iso8859_15', 'ISO8859-16': 'iso8859_16',
  'ISO646.1991-IRV': 'ascii', 'ISO10646-1': 'iso8859_1',
}

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
  cp860: { label: 'DOS (CP860 Portuguese)', extends: 'cp437', range: [0, 255] as [number, number], overrides: {
    0x80: '\u00C7', 0x81: '\u00FC', 0x82: '\u00E9', 0x83: '\u00E2',
    0x84: '\u00E3', 0x85: '\u00E0', 0x86: '\u00C1', 0x87: '\u00E7',
    0x88: '\u00EA', 0x89: '\u00CA', 0x8A: '\u00E8', 0x8B: '\u00CD',
    0x8C: '\u00D4', 0x8D: '\u00EC', 0x8E: '\u00C3', 0x8F: '\u00C2',
    0x90: '\u00C9', 0x91: '\u00C0', 0x92: '\u00C8', 0x93: '\u00F4',
    0x94: '\u00F5', 0x95: '\u00F2', 0x96: '\u00DA', 0x97: '\u00F9',
    0x98: '\u00CC', 0x99: '\u00D5', 0x9A: '\u00DC', 0x9B: '\u00A2',
    0x9C: '\u00A3', 0x9D: '\u00D9', 0x9E: '\u20A7', 0x9F: '\u00D3',
    0xA0: '\u00E1', 0xA1: '\u00ED', 0xA2: '\u00F3', 0xA3: '\u00FA',
    0xA4: '\u00F1', 0xA5: '\u00D1', 0xA6: '\u00AA', 0xA7: '\u00BA',
    0xA8: '\u00BF', 0xA9: '\u00D2', 0xAA: '\u00AC', 0xAB: '\u00BD',
    0xAC: '\u00BC', 0xAD: '\u00A1', 0xAE: '\u00AB', 0xAF: '\u00BB',
  }},
  cp863: { label: 'DOS (CP863 Canadian French)', extends: 'cp437', range: [0, 255] as [number, number], overrides: {
    0x80: '\u00C7', 0x81: '\u00FC', 0x82: '\u00E9', 0x83: '\u00E2',
    0x84: '\u00C2', 0x85: '\u00E0', 0x86: '\u00B6', 0x87: '\u00E7',
    0x88: '\u00EA', 0x89: '\u00EB', 0x8A: '\u00E8', 0x8B: '\u00EF',
    0x8C: '\u00EE', 0x8D: '\u2017', 0x8E: '\u00C0', 0x8F: '\u00A7',
    0x90: '\u00C9', 0x91: '\u00C8', 0x92: '\u00CA', 0x93: '\u00F4',
    0x94: '\u00CB', 0x95: '\u00CF', 0x96: '\u00FB', 0x97: '\u00F9',
    0x98: '\u00A4', 0x99: '\u00D4', 0x9A: '\u00DC', 0x9B: '\u00A2',
    0x9C: '\u00A3', 0x9D: '\u00D9', 0x9E: '\u00DB', 0x9F: '\u0192',
    0xA0: '\u00A6', 0xA1: '\u00B4', 0xA2: '\u00F3', 0xA3: '\u00FA',
    0xA4: '\u00A8', 0xA5: '\u00B8', 0xA6: '\u00B3', 0xA7: '\u00AF',
    0xA8: '\u00CE', 0xA9: '\u2310', 0xAA: '\u00AC', 0xAB: '\u00BD',
    0xAC: '\u00BC', 0xAD: '\u00BE', 0xAE: '\u00AB', 0xAF: '\u00BB',
  }},
  cp865: { label: 'DOS (CP865 Nordic)', extends: 'cp437', range: [0, 255] as [number, number], overrides: {
    0x9B: '\u00F8', 0x9C: '\u00A3', 0x9D: '\u00D8', 0x9E: '\u20A7', 0x9F: '\u0192',
    0xAF: '\u00A4',
  }},
  cp866: { label: 'DOS (CP866 Cyrillic)', extends: 'cp437', range: [0, 255] as [number, number], overrides: {
    0x80: '\u0410', 0x81: '\u0411', 0x82: '\u0412', 0x83: '\u0413',
    0x84: '\u0414', 0x85: '\u0415', 0x86: '\u0416', 0x87: '\u0417',
    0x88: '\u0418', 0x89: '\u0419', 0x8A: '\u041A', 0x8B: '\u041B',
    0x8C: '\u041C', 0x8D: '\u041D', 0x8E: '\u041E', 0x8F: '\u041F',
    0x90: '\u0420', 0x91: '\u0421', 0x92: '\u0422', 0x93: '\u0423',
    0x94: '\u0424', 0x95: '\u0425', 0x96: '\u0426', 0x97: '\u0427',
    0x98: '\u0428', 0x99: '\u0429', 0x9A: '\u042A', 0x9B: '\u042B',
    0x9C: '\u042C', 0x9D: '\u042D', 0x9E: '\u042E', 0x9F: '\u042F',
    0xA0: '\u0430', 0xA1: '\u0431', 0xA2: '\u0432', 0xA3: '\u0433',
    0xA4: '\u0434', 0xA5: '\u0435', 0xA6: '\u0436', 0xA7: '\u0437',
    0xA8: '\u0438', 0xA9: '\u0439', 0xAA: '\u043A', 0xAB: '\u043B',
    0xAC: '\u043C', 0xAD: '\u043D', 0xAE: '\u043E', 0xAF: '\u043F',
    0xE0: '\u0440', 0xE1: '\u0441', 0xE2: '\u0442', 0xE3: '\u0443',
    0xE4: '\u0444', 0xE5: '\u0445', 0xE6: '\u0446', 0xE7: '\u0447',
    0xE8: '\u0448', 0xE9: '\u0449', 0xEA: '\u044A', 0xEB: '\u044B',
    0xEC: '\u044C', 0xED: '\u044D', 0xEE: '\u044E', 0xEF: '\u044F',
    0xF0: '\u0401', 0xF1: '\u0451', 0xF2: '\u0404', 0xF3: '\u0454',
    0xF4: '\u0407', 0xF5: '\u0457', 0xF6: '\u040E', 0xF7: '\u045E',
    0xF8: '\u00B0', 0xF9: '\u2219', 0xFA: '\u00B7', 0xFB: '\u221A',
    0xFC: '\u2116', 0xFD: '\u00A4', 0xFE: '\u25A0', 0xFF: '\u00A0',
  }},
  cp848: { label: 'DOS (CP848 Ukrainian)', extends: 'cp1125', range: [0, 255] as [number, number], overrides: {
    0xFD: '\u20AC',
  }},
  cp849: { label: 'DOS (CP849 Belarusian)', extends: 'cp1131', range: [0, 255] as [number, number], overrides: {
    0xFB: '\u20AC',
  }},
  cp1125: { label: 'DOS (CP1125 Ukrainian)', extends: 'cp866', range: [0, 255] as [number, number], overrides: {
    0xF2: '\u0490', 0xF3: '\u0491', 0xF4: '\u0404', 0xF5: '\u0454',
    0xF6: '\u0406', 0xF7: '\u0456', 0xF8: '\u0407', 0xF9: '\u0457',
  }},
  cp1131: { label: 'DOS (CP1131 Belarusian)', extends: 'cp866', range: [0, 255] as [number, number], overrides: {
    0xF8: '\u0406', 0xF9: '\u0456', 0xFA: '\u00B7', 0xFB: '\u00A4',
    0xFC: '\u0490', 0xFD: '\u0491', 0xFE: '\u2219',
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
  wiscii: { label: 'Wang (WISCII)', range: [32, 253] as [number, number], overrides: {
    0x5E: '\u2191', 0x7F: '\u00A2',
    0x80: '\u00B0', 0x81: '\u2666', 0x82: '\u25BA', 0x83: '\u25C4',
    0x84: '\u2192', 0x85: '\u2319', 0x86: '\u00A6', 0x87: '\u25A0',
    0x88: '\u203C', 0x89: '\u2195', 0x8A: '\u2193', 0x8B: '\u2191',
    0x8C: '\u2190', 0x8D: '\u00B1', 0x8E: '\u00A1', 0x8F: '\u00BF',
    0x90: '\u00C2', 0x91: '\u00C0', 0x92: '\u00C1', 0x93: '\u00C4',
    0x94: '\u00C3', 0x95: '\u2190', 0x96: '\u00C5', 0x97: '\u2193',
    0x98: '\u00C6', 0x99: '\u00C7', 0x9A: '\u2021', 0x9B: '\u2022',
    0x9C: '\u00CA', 0x9D: '\u00C8', 0x9E: '\u00C9', 0x9F: '\u00CB',
    0xA0: '\u00E2', 0xA1: '\u00E0', 0xA2: '\u00E1', 0xA3: '\u00E4',
    0xA4: '\u00E3', 0xA5: '\u2192', 0xA6: '\u00E5', 0xA7: '\u2020',
    0xA8: '\u00E6', 0xA9: '\u00E7', 0xAA: '\u25A1',
    0xAC: '\u00EA', 0xAD: '\u00E8', 0xAE: '\u00E9', 0xAF: '\u00EB',
    0xB0: '\u01E6', 0xB1: '\u0132', 0xB2: '\u0130', 0xB3: '\u00CE',
    0xB4: '\u00CC', 0xB5: '\u00CD', 0xB6: '\u00CF', 0xB7: '\u013F',
    0xB8: '\u00D1', 0xB9: '\u00D4', 0xBA: '\u00D2', 0xBB: '\u00D3',
    0xBC: '\u00D6', 0xBD: '\u00D5', 0xBE: '\u0152', 0xBF: '\u00D8',
    0xC0: '\u01E7', 0xC1: '\u0133', 0xC2: '\u0131', 0xC3: '\u00EE',
    0xC4: '\u00EC', 0xC5: '\u00ED', 0xC6: '\u00EF', 0xC7: '\u0140',
    0xC8: '\u00F1', 0xC9: '\u00F4', 0xCA: '\u00F2', 0xCB: '\u00F3',
    0xCC: '\u00F6', 0xCD: '\u00F5', 0xCE: '\u0153', 0xCF: '\u00F8',
    0xD0: '\u00DE', 0xD1: '\u00D0', 0xD2: '\u00DD', 0xD3: '\u015E',
    0xD4: '\u2018', 0xD5: '\u00DB', 0xD6: '\u00D9', 0xD7: '\u00DA',
    0xD8: '\u00DC', 0xD9: '\u00A9', 0xDA: '\u00AE', 0xDB: '\u211E',
    0xDC: '\u00AA', 0xDD: '\u00AB', 0xDE: '\u00A7', 0xDF: '\u00B6',
    0xE0: '\u00FE', 0xE1: '\u00F0', 0xE2: '\u00FD', 0xE3: '\u015F',
    0xE4: '\u2019', 0xE5: '\u00FB', 0xE6: '\u00F9', 0xE7: '\u00FA',
    0xE8: '\u00FC', 0xE9: '\u2122', 0xEA: '\u00A4', 0xEB: '\u2194',
    0xEC: '\u00BA', 0xED: '\u00BB', 0xEE: '\u00DF', 0xEF: '\u02D9',
    0xF0: '\u00A3', 0xF1: '\u0192', 0xF2: '\u00A5', 0xF3: '\u00BC',
    0xF4: '\u00BD', 0xF5: '\u00BE', 0xF6: '\u02C6', 0xF7: '\u0060',
    0xF8: '\u00B4', 0xF9: '\u00A8', 0xFA: '\u02DC', 0xFB: '\u00B8',
    0xFC: '\u02C7', 0xFD: '\u02D8',
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
  if (charCode === 32) return '\u2423'
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
