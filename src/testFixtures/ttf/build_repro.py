"""Build two minimal bitmap-only TrueType fonts from scratch (CC0, no third-party data).

tvg-bitmap-only-apple.ttf     Apple layout: sfnt tag 'true', bhed/bloc/bdat, no head/hhea/hmtx/glyf/loca
tvg-bitmap-only-opentype.ttf  OpenType layout: head/hhea/hmtx + EBLC/EBDT, no glyf/loca
"""
import io
import struct
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import TTFont

OUT = sys.argv[1]
FAMILY = 'TVG Bitmap Repro'

ART = {
    '.notdef': [
        '################', '#..............#', '#..............#', '#..............#',
        '#..............#', '#..............#', '#..............#', '#..............#',
        '#..............#', '#..............#', '#..............#', '#..............#',
        '#..............#', '#..............#', '#..............#', '################',
    ],
    'space': ['.' * 16] * 16,
    'A': [
        '................', '.......##.......', '......####......', '.....##..##.....',
        '....##....##....', '....##....##....', '...##......##...', '...##......##...',
        '...##########...', '..############..', '..##........##..', '.##..........##.',
        '.##..........##.', '##............##', '##............##', '................',
    ],
    'B': [
        '................', '..#########.....', '..##......##....', '..##.......##...',
        '..##.......##...', '..##......##....', '..#########.....', '..##########....',
        '..##.......###..', '..##........##..', '..##........##..', '..##........##..',
        '..##.......###..', '..###########...', '..##########....', '................',
    ],
}
ORDER = ['.notdef', 'space', 'A', 'B']


def bits(rows):
    # Image format 5: bit-aligned, row-major, MSB first, no row padding.
    flat = ''.join(rows)
    data = bytearray(len(flat) // 8)
    for i, ch in enumerate(flat):
        if ch == '#':
            data[i // 8] |= 0x80 >> (i % 8)
    return bytes(data)


def bitmap_xml():
    metrics = ''.join(
        f'<{k} value="{v}"/>'
        for k, v in [('height', 16), ('width', 16), ('horiBearingX', 0), ('horiBearingY', 14),
                     ('horiAdvance', 16), ('vertBearingX', -8), ('vertBearingY', 0), ('vertAdvance', 16)])
    line = lambda asc, desc: ''.join(
        f'<{k} value="{v}"/>'
        for k, v in [('ascender', asc), ('descender', desc), ('widthMax', 16), ('caretSlopeNumerator', 0),
                     ('caretSlopeDenominator', 0), ('caretOffset', 0), ('minOriginSB', 0), ('minAdvanceSB', 0),
                     ('maxBeforeBL', asc), ('minAfterBL', desc), ('pad1', 0), ('pad2', 0)])
    locs = ''.join(f'<glyphLoc id="{i}" name="{n}"/>' for i, n in enumerate(ORDER))
    glyphs = ''.join(
        f'<ebdt_bitmap_format_5 name="{n}"><rawimagedata>{bits(ART[n]).hex()}</rawimagedata></ebdt_bitmap_format_5>'
        for n in ORDER)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<ttFont>
<EBDT><header version="2.0"/><strikedata index="0">{glyphs}</strikedata></EBDT>
<EBLC><header version="2.0"/><strike index="0"><bitmapSizeTable>
<sbitLineMetrics direction="hori">{line(14, -2)}</sbitLineMetrics>
<sbitLineMetrics direction="vert">{line(8, -8)}</sbitLineMetrics>
<colorRef value="0"/><startGlyphIndex value="0"/><endGlyphIndex value="{len(ORDER) - 1}"/>
<ppemX value="16"/><ppemY value="16"/><bitDepth value="1"/><flags value="1"/>
</bitmapSizeTable>
<eblc_index_sub_table_2 imageFormat="5" firstGlyphIndex="0" lastGlyphIndex="{len(ORDER) - 1}">
<imageSize value="32"/><BigGlyphMetrics>{metrics}</BigGlyphMetrics>{locs}
</eblc_index_sub_table_2></strike></EBLC>
</ttFont>'''


fb = FontBuilder(unitsPerEm=16, isTTF=True)
fb.setupGlyphOrder(ORDER)
fb.setupCharacterMap({0x20: 'space', 0x41: 'A', 0x42: 'B'})
fb.setupHorizontalMetrics({g: (16, 0) for g in ORDER})
fb.setupHorizontalHeader(ascent=14, descent=-2)
fb.setupNameTable({
    'familyName': FAMILY,
    'styleName': 'Regular',
    'copyright': 'Dedicated to the public domain under CC0 1.0',
    'licenseDescription': 'CC0 1.0 Universal. No rights reserved.',
    'description': 'Minimal bitmap-only test font (embedded 16 ppem 1-bit strike, no outlines).',
})
fb.setupOS2(sTypoAscender=14, sTypoDescender=-2, usWinAscent=14, usWinDescent=2)
fb.setupPost()
fb.setupMaxp()
xml = io.StringIO(bitmap_xml())
fb.font.importXML(xml)
buf = io.BytesIO()
fb.font.save(buf)
opentype = buf.getvalue()
open(f'{OUT}/tvg-bitmap-only-opentype.ttf', 'wb').write(opentype)

# Apple layout: same table bytes, renamed the way bitmap-only Apple fonts store them.
src = TTFont(io.BytesIO(opentype))
rename = {'head': 'bhed', 'EBLC': 'bloc', 'EBDT': 'bdat'}
drop = {'hhea', 'hmtx'}
tables = {rename.get(t, t): src.reader[t] for t in src.reader.keys() if t not in drop}


def checksum(data):
    data += b'\0' * (-len(data) % 4)
    return sum(struct.unpack(f'>{len(data) // 4}I', data)) & 0xFFFFFFFF


tags = sorted(tables)
n = len(tags)
es = max(i for i in range(16) if 2 ** i <= n)
header = struct.pack('>4sHHHH', b'true', n, 16 * 2 ** es, es, 16 * n - 16 * 2 ** es)
offset = 12 + 16 * n
records, body = b'', b''
for t in tags:
    data = tables[t]
    if t == 'bhed':
        data = data[:8] + b'\0\0\0\0' + data[12:]
        tables[t] = data
    records += struct.pack('>4sIII', t.encode(), checksum(data), offset + len(body), len(data))
    body += data + b'\0' * (-len(data) % 4)
apple = bytearray(header + records + body)
adj = (0xB1B0AFBA - checksum(bytes(apple))) & 0xFFFFFFFF
bhed_at = struct.unpack('>I', apple[12 + 16 * tags.index('bhed') + 8: 12 + 16 * tags.index('bhed') + 12])[0]
struct.pack_into('>I', apple, bhed_at + 8, adj)
open(f'{OUT}/tvg-bitmap-only-apple.ttf', 'wb').write(bytes(apple))

for name in ('tvg-bitmap-only-opentype.ttf', 'tvg-bitmap-only-apple.ttf'):
    b = open(f'{OUT}/{name}', 'rb').read()
    cnt = struct.unpack('>H', b[4:6])[0]
    tags_ = [b[12 + 16 * i:16 + 16 * i].decode() for i in range(cnt)]
    print(name, len(b), 'bytes', b[:4], tags_)
