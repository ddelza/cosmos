# 딥스카이 사진 겹치기용 자료: Stellarium의 nebulae/default 사진 중 밤하늘 관측 도우미 목록에 있는 천체 것만 골라 줄인다.
#   python tools/build_dso_images.py ["C:/.../Stellarium"]
# 만드는 것
#   data/dso/<이름>.jpg — 긴 변 최대 640px(크게 보이는 천체는 1024px), 검은 바탕이라 화면에서 '더하기'로 겹쳐 그림
#   data/dso.json      — { 천체id: [{ f: 파일, w: [[적경°, 적위°] × 4](J2000 네 모서리), t: [[u, v] × 4] }] }
# 좌표는 Stellarium nebulae/default/textures.json의 worldCoords·textureCoords를 그대로 옮긴 것(방향·크기가 실제 하늘과 같음).
# 사진 저작권은 사진마다 다름 — textures.json의 imageCredits를 data/dso.json의 credit에 함께 적는다.
import json, math, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STEL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Stellarium')
SRC = os.path.join(STEL, 'nebulae', 'default')
OUT = os.path.join(ROOT, 'data', 'dso')

raw = open(os.path.join(SRC, 'textures.json'), encoding='utf-8').read()
tex = json.loads(re.sub(r'[\x00-\x1f]', ' ', raw))          # 문자열 안 탭 문자 때문에 엄격한 파서가 실패함
tiles = []
def walk(node):
    for t in node.get('subTiles', []):
        if 'imageUrl' in t and 'worldCoords' in t: tiles.append(t)
        walk(t)
walk(tex)

def vec(ra, de):
    ra, de = math.radians(ra), math.radians(de)
    return (math.cos(de) * math.cos(ra), math.cos(de) * math.sin(ra), math.sin(de))
def ang(a, b): return math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(a, b))))))

for t in tiles:
    c = [vec(*p) for q in t['worldCoords'] for p in q]
    m = [sum(p[i] for p in c) / len(c) for i in range(3)]; n = math.sqrt(sum(x * x for x in m)); t['_cen'] = [x / n for x in m]
    t['_half'] = max(ang(p, t['_cen']) for p in c)

cat = json.load(open(os.path.join(ROOT, '..', '2026', 'data', 'catalog.json'), encoding='utf-8'))
out, used, miss = {}, {}, []
for o in cat:
    if o.get('ra') is None or o.get('type') == 'star': continue
    p = vec(o['ra'] * 15, o['dec']); size = (o.get('sizeArcmin') or 10) / 60
    best, bd = None, 1e9
    for t in tiles:
        d = ang(p, t['_cen'])
        # 천체가 사진 안쪽에 있고, 사진이 너무 넓지 않을 것(바너드 고리처럼 별자리만 한 사진은 제외). 중심에 가깝고 작은 사진을 우선.
        if d < t['_half'] * 0.8 and t['_half'] < max(size * 4, 3):
            score = d / t['_half'] + t['_half'] * 0.05
            if score < bd: best, bd = t, score
    if not best: miss.append(o['id']); continue
    name = os.path.splitext(best['imageUrl'])[0] + '.jpg'
    if name not in used:
        im = Image.open(os.path.join(SRC, best['imageUrl'])).convert('RGB')
        mx = 1024 if best['_half'] > 0.6 else 640
        if max(im.size) > mx: im.thumbnail((mx, mx), Image.LANCZOS)
        # 화면에 '더하기'로 겹치므로: 바탕의 옅은 잡광을 빼고(검은 점 올림), 가장자리를 검게 흐려 네모 테두리가 안 보이게 한다
        from PIL import ImageChops, ImageDraw, ImageFilter
        im = im.point(lambda v: max(0, int((v - 10) * 255 / 245)))
        w, h = im.size; e = int(min(w, h) * 0.1)
        mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rectangle([e, e, w - 1 - e, h - 1 - e], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(e / 2))
        im = ImageChops.multiply(im, Image.merge('RGB', (mask, mask, mask)))
        os.makedirs(OUT, exist_ok=True)
        im.save(os.path.join(OUT, name), 'JPEG', quality=84, optimize=True, progressive=True)
        used[name] = 1
    cr = best.get('imageCredits') or {}
    out[o['id']] = [{'f': name, 'w': q, 't': best['textureCoords'][k] if k < len(best['textureCoords']) else [[0, 0], [1, 0], [1, 1], [0, 1]],
                     'credit': cr.get('short') or cr.get('Short') or ''} for k, q in enumerate(best['worldCoords'])]

json.dump(out, open(os.path.join(ROOT, 'data', 'dso.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('사진', len(used), '장 · 천체', len(out), '개 · 합계', round(size / 1e6, 1), 'MB')
print('사진 없음:', ' '.join(miss))
