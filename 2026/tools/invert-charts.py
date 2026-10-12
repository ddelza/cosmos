# IAU 성도(흰 바탕) → 어두운 바탕으로 반전 (암적응 보호). fetch-constellation-photos.mjs 다음에 실행
# 사용: python -I tools/invert-charts.py
import json, os, sys
from PIL import Image, ImageOps

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ids = json.load(open(os.path.join(root, 'tools', '.charts-to-invert.json'), encoding='utf-8'))
for cid in ids:
    src = os.path.join(root, 'img', 'objects', cid + '.chart.png')
    dst = os.path.join(root, 'img', 'objects', cid + '.jpg')
    if not os.path.exists(src):
        print('없음', cid); continue
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    rgb = ImageOps.invert(bg.convert('RGB'))
    rgb = rgb.point(lambda v: int(v * 0.85))  # 살짝 어둡게
    if rgb.width > 330:
        rgb = rgb.resize((330, round(rgb.height * 330 / rgb.width)), Image.LANCZOS)
    rgb.save(dst, 'JPEG', quality=86)
    os.remove(src)
print('반전', len(ids))
