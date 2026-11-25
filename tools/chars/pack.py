# 셈·사만다 PNG(tools/chars/out) → web/chars/*.webp
# 같은 캐릭터의 그림(눈 뜸·감음·LED 색)은 같은 자리로 잘라야 겹쳐 깜빡일 때 흔들리지 않는다.
# 물체 둘레를 정사각형으로 잡고 사방에 여백 6%를 둔 뒤 256px로 줄인다.
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'web', 'chars')
PAD, SIZE = 0.06, 256

def family(name):
    return 'sem' if name.startswith('sem') else 'sam'

files = sorted(glob.glob(os.path.join(HERE, 'out', '*.png')))
boxes = {}
for f in files:
    a = Image.open(f).convert('RGBA').split()[3].point(lambda v: 255 if v > 8 else 0)
    b = a.getbbox()
    k = family(os.path.basename(f))
    o = boxes.get(k)
    boxes[k] = b if not o else (min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3]))

for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    x0, y0, x1, y1 = boxes[family(name)]
    side = max(x1 - x0, y1 - y0)
    side = int(round(side * (1 + 2 * PAD)))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left, top = int(round(cx - side / 2)), int(round(cy - side / 2))
    src = Image.open(f).convert('RGBA')
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(src, (-left, -top))
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)
    print(name, 'ok')
