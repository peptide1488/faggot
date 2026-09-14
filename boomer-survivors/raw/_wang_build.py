"""Build sprites/wang_lawn.png (1x16 strip in WANG_KEYS order NW,NE,SW,SE; L=mowed U=tall) from a PixelLab topdown tileset."""
import sys, json, urllib.request
from PIL import Image
tid, size = sys.argv[1], int(sys.argv[2])
meta=json.load(open(f'raw/pl_wang64/meta.json'))
td=meta['tileset_data']; sheet=Image.open('raw/pl_wang64/sheet.png').convert('RGBA')
KEYS=['LLLL','LLLU','LLUL','LLUU','LULL','LULU','LUUL','LUUU','ULLL','ULLU','ULUL','ULUU','UULL','UULU','UUUL','UUUU']
by={}
for t in td['tiles']:
    c=t['corners']; key=''.join('L' if c[k]=='lower' else 'U' for k in ('NW','NE','SW','SE')); b=t['bounding_box']
    by[key]=sheet.crop((b['x'],b['y'],b['x']+b['width'],b['y']+b['height']))
out=Image.new('RGBA',(size*16,size))
for i,k in enumerate(KEYS): out.paste(by[k],(i*size,0))
out.save('sprites/wang_lawn.png'); print('strip', out.size, 'keys', len(by))
