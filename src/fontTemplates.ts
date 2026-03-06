import type { Charset } from './store'

export interface FontTemplate {
  name: string
  file: string
  charset: Charset
}

export const fontTemplates: FontTemplate[] = [
  { name: 'ZX Spectrum', file: 'Spectrum.ch8', charset: 'zx' },
  { name: 'BBC Micro', file: 'BBC Micro.ch8', charset: 'bbc' },
  { name: 'Commodore 64', file: 'Commodore 64.ch8', charset: 'c64' },
  { name: 'Atari 8-bit', file: 'Atari 8-bit.ch8', charset: 'atari' },
  { name: 'Amstrad CPC', file: 'Amstrad CPC.ch8', charset: 'cpc' },
  { name: 'IBM CGA', file: 'IBM CGA.ch8', charset: 'cga' },
  { name: 'MSX', file: 'MSX 1.ch8', charset: 'msx' },
  { name: 'Amiga Topaz v1', file: 'Amiga Topaz v1.ch8', charset: 'amiga' },
  { name: 'Amiga Topaz v2', file: 'Amiga Topaz v2.ch8', charset: 'amiga' },
  { name: 'SAM Coupe', file: 'SAM Coupe.ch8', charset: 'sam' },
]
