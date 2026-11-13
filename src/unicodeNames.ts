import { charset, cpToUnicode, type Charset } from './charsets'
import { UNICODE_NAME_DATA } from './unicodeNameData'

// ISO 6429 control character names (Unicode "control" aliases)
const C0 = [
  'null', 'start of heading', 'start of text', 'end of text',
  'end of transmission', 'enquiry', 'acknowledge', 'bell',
  'backspace', 'character tabulation', 'line feed', 'line tabulation',
  'form feed', 'carriage return', 'shift out', 'shift in',
  'data link escape', 'device control one', 'device control two', 'device control three',
  'device control four', 'negative acknowledge', 'synchronous idle', 'end of transmission block',
  'cancel', 'end of medium', 'substitute', 'escape',
  'information separator four', 'information separator three', 'information separator two', 'information separator one',
]

const C1 = [
  'padding character', 'high octet preset', 'break permitted here', 'no break here',
  'index', 'next line', 'start of selected area', 'end of selected area',
  'character tabulation set', 'character tabulation with justification', 'line tabulation set', 'partial line forward',
  'partial line backward', 'reverse line feed', 'single shift two', 'single shift three',
  'device control string', 'private use one', 'private use two', 'set transmit state',
  'cancel character', 'message waiting', 'start of guarded area', 'end of guarded area',
  'start of string', 'single graphic character introducer', 'single character introducer', 'control sequence introducer',
  'string terminator', 'operating system command', 'privacy message', 'application program command',
]

let names: Map<number, string> | null = null

function table(): Map<number, string> {
  if (!names) {
    names = new Map()
    for (const line of UNICODE_NAME_DATA.split('\n')) {
      const sp = line.indexOf(' ')
      if (sp > 0) names.set(parseInt(line.slice(0, sp), 16), line.slice(sp + 1))
    }
    // Private-use code point the Mac OS Roman codepage uses for the Apple logo
    names.set(0xF8FF, 'apple logo')
  }
  return names
}

/** Lower-case Unicode name of a code point (e.g. 0xB6 -> "pilcrow sign"), if known. */
export function unicodeName(codePoint: number): string | undefined {
  if (codePoint < 0x20) return C0[codePoint]
  if (codePoint === 0x7F) return 'delete'
  if (codePoint >= 0x80 && codePoint < 0xA0) return C1[codePoint - 0x80]
  return table().get(codePoint)
}

/** Name of the symbol at a glyph's character code under a codepage (default: the active one). */
export function charName(charCode: number, cs: Charset = charset.value): string | undefined {
  const ch = cpToUnicode(charCode, cs)
  const cps = [...ch]
  return cps.length === 1 ? unicodeName(cps[0].codePointAt(0)!) : undefined
}
