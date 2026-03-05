export interface FontTemplate {
  name: string
  file: string
}

export const fontTemplates: FontTemplate[] = [
  { name: 'ZX Spectrum', file: 'Spectrum.ch8' },
  { name: 'BBC Micro', file: 'BBC Micro.ch8' },
  { name: 'Commodore 64', file: 'Commodore 64.ch8' },
  { name: 'Atari 8-bit', file: 'Atari 8-bit.ch8' },
  { name: 'Amstrad CPC', file: 'Amstrad CPC.ch8' },
  { name: 'IBM CGA', file: 'IBM CGA.ch8' },
  { name: 'MSX', file: 'MSX 1.ch8' },
  { name: 'Amiga Topaz v1', file: 'Amiga Topaz v1.ch8' },
  { name: 'Amiga Topaz v2', file: 'Amiga Topaz v2.ch8' },
  { name: 'SAM Coupe', file: 'SAM Coupe.ch8' },
]
