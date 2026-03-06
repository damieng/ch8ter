export interface SampleText {
  name: string
  text: string
}

export interface SampleGroup {
  group: string
  items: SampleText[]
}

const PANGRAMS = [
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump!',
  'Sphinx of black quartz, judge my vow.',
  'Jackdaws love my big sphinx of quartz.',
  'The five boxing wizards jump quickly.',
]

export const sampleTexts: SampleGroup[] = [
  {
    group: 'Pangrams',
    items: [
      { name: 'Pangrams', text: PANGRAMS.join('\n\n') },
    ],
  },
  {
    group: 'Character sets',
    items: [
      {
        name: 'Full set',
        text: ' !"#$%&\'()*+,-./0123456789:;<=>?\n@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\n`abcdefghijklmnopqrstuvwxyz{|}~',
      },
    ],
  },
  {
    group: 'Text adventures',
    items: [
      {
        name: 'Colossal Cave',
        text: 'You are standing at the end of a road before a small brick building. Around you is a forest. A small stream flows out of the building and down a gully.\n\n> GO NORTH\n\nYou are in the forest. The trees are too thick to see very far.\n\n> INVENTORY\n\nYou are carrying:\n  A brass lantern\n  A small bottle of water\n  Food rations',
      },
      {
        name: 'Zork-style',
        text: 'West of House\nYou are standing in an open field west of a white house, with a boarded front door.\nThere is a small mailbox here.\n\n> OPEN MAILBOX\n\nOpening the small mailbox reveals a leaflet.\n\n> READ LEAFLET\n\nWELCOME TO ADVENTURE!\nYour quest begins here.',
      },
      {
        name: 'Dungeon',
        text: 'The Cavern of Shadows\nDamp walls glisten in the torchlight. A narrow passage leads north. To the east, a heavy iron door stands ajar. You can hear water dripping somewhere in the darkness.\n\nHP: 14/20  Gold: 37  Level: 3\n\n> SEARCH ROOM\n\nYou find a rusty key hidden beneath a loose stone.',
      },
    ],
  },
  {
    group: 'Code',
    items: [
      {
        name: 'BASIC listing',
        text: '10 REM ** HELLO WORLD **\n20 PRINT "What is your name?"\n30 INPUT n$\n40 PRINT "Hello, ";n$;"!"\n50 FOR i=1 TO 10\n60 PRINT i;" ";i*i\n70 NEXT i\n80 IF n$="ZX" THEN GOTO 20\n90 PRINT "Goodbye!"\n100 STOP',
      },
      {
        name: 'C program',
        text: '#include <stdio.h>\n\nint main(void) {\n    int i, sum = 0;\n    printf("Enter numbers:\\n");\n    for (i = 0; i < 10; i++) {\n        int n;\n        scanf("%d", &n);\n        sum += n;\n    }\n    printf("Total: %d\\n", sum);\n    printf("Average: %d\\n", sum/10);\n    return 0;\n}',
      },
      {
        name: 'Pascal program',
        text: 'program Triangle;\nvar\n  base, height: real;\n  area: real;\nbegin\n  WriteLn(\'Triangle area calculator\');\n  Write(\'Base: \');\n  ReadLn(base);\n  Write(\'Height: \');\n  ReadLn(height);\n  area := (base * height) / 2.0;\n  WriteLn(\'Area = \', area:0:2);\nend.',
      },
      {
        name: 'Z80 assembly',
        text: '; Clear screen routine\nclear_screen:\n    ld hl, $4000    ; Screen start\n    ld de, $4001\n    ld bc, $17FF    ; Screen length\n    ld (hl), 0\n    ldir\n    ret\n\n; Print string @ HL\nprint_str:\n    ld a, (hl)\n    or a\n    ret z\n    rst $10\n    inc hl\n    jr @print_str',
      },
      {
        name: '6502 assembly',
        text: '; Print message to screen\n        *= $C000\n\nPRINT   LDX #$00\nLOOP    LDA MSG,X\n        BEQ DONE\n        JSR $FFD2       ; CHROUT\n        INX\n        BNE LOOP\nDONE    RTS\n\nMSG     .TEXT "READY."\n        .BYTE $0D,$00\n\n; Delay routine\nDELAY   LDY #$FF\nOUTER   LDX #$FF\nINNER   DEX\n        BNE INNER\n        DEY\n        BNE OUTER\n        RTS',
      },
    ],
  },
  {
    group: 'Literature',
    items: [
      {
        name: 'Dracula (Bram Stoker)',
        text: '3 May. Bistritz. Left Munich at 8:35 P.M. on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late.\n\nBuda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.\n\nThe impression I had was that we were leaving the West and entering the East.',
      },
      {
        name: 'Frankenstein (M. Shelley)',
        text: 'It was on a dreary night of November that I beheld the accomplishment of my toils. With an anxiety that almost amounted to agony, I collected the instruments of life around me, that I might infuse a spark of being into the lifeless thing that lay at my feet.\n\nI saw the dull yellow eye of the creature open; it breathed hard, and a convulsive motion agitated its limbs.\n\nHow can I describe my emotions at this catastrophe, or how delineate the wretch whom with such infinite pains and care I had endeavoured to form?',
      },
      {
        name: 'Alice in Wonderland',
        text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "and what is the use of a book," thought Alice "without pictures or conversations?"\n\nSo she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
      },
    ],
  },
  {
    group: 'Games',
    items: [
      {
        name: 'Intro screen',
        text: '================================\n\n***     CRYSTAL  CAVERNS     ***\n\n================================\n\n  1. Start new game\n  2. Continue saved game\n  3. Difficulty: NORMAL\n  4. Sound: ON\n  5. Controls: KEYBOARD\n\n  0. Begin adventure!\n\n--------------------------------\n  A game by Pixel Forge Studios\n  (c) 1986 Pixel Forge Ltd.\n================================',
      },
      {
        name: 'High scores',
        text: '  ** HIGH SCORES **\n\n1. ACE ...... 99,950\n2. BOB ...... 87,200\n3. CAT ...... 76,100\n4. DAN ...... 65,300\n5. EVE ...... 54,800\n6. FAY ...... 43,600\n7. GUS ...... 32,400\n8. HAL ...... 21,000\n9. IVY ...... 10,500\n10 JAY ......  5,250',
      },
      {
        name: 'RPG status',
        text: '================================\n  HERO STATUS      Floor: 7\n================================\nName:  Sir Aldric   Class: Knight\nHP:    142/180      MP:    35/50\nSTR: 18  DEX: 12  INT: 10\nGold: 1,247    EXP: 8,420\n--------------------------------\n  INVENTORY\n  Iron Sword (+12 ATK)\n  Chain Mail (+8 DEF)\n  Healing Potion x3\n  Dungeon Map\n================================',
      },
    ],
  },
]
