"""Re-encode one downloaded thumbnail into img/objects/{id}.jpg.

Called by fetch-photos.mjs as:  python -I photo_reencode.py SRC DST [WIDTH] [QUALITY] [MAXBYTES]

- Only opens the file with Pillow and writes a JPEG; never executes anything.
- JPEG that is already small (<= MAXBYTES) and <= WIDTH px wide is copied as-is.
- Anything else (PNG / SVG-rendered PNG / GIF / big JPEG) is flattened onto black,
  resized to WIDTH px wide and saved as JPEG (quality stepped down if still big).
Prints one JSON line: {"ok":true,"w":..,"h":..,"bytes":..,"reencoded":..,"srcFormat":..}
"""
import json
import os
import shutil
import sys

from PIL import Image


def main():
    src, dst = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 330
    quality = int(sys.argv[4]) if len(sys.argv) > 4 else 82
    maxbytes = int(sys.argv[5]) if len(sys.argv) > 5 else 60000

    tmp = dst + ".part"
    with Image.open(src) as im:
        im.load()
        fmt = im.format
        size = os.path.getsize(src)
        if fmt == "JPEG" and size <= maxbytes and im.width <= width + 8 and im.mode in ("RGB", "L"):
            shutil.copyfile(src, tmp)
            w, h, reenc = im.width, im.height, False
        else:
            if getattr(im, "is_animated", False):
                im.seek(0)
            frame = im
            if frame.mode in ("RGBA", "LA", "PA") or (frame.mode == "P" and "transparency" in frame.info):
                rgba = frame.convert("RGBA")
                bg = Image.new("RGB", rgba.size, (0, 0, 0))
                bg.paste(rgba, mask=rgba.split()[-1])
                out = bg
            else:
                out = frame.convert("RGB")
            if out.width > width:
                h = max(1, round(out.height * width / out.width))
                out = out.resize((width, h), Image.LANCZOS)
            q = quality
            while True:
                out.save(tmp, "JPEG", quality=q, optimize=True, progressive=True)
                if os.path.getsize(tmp) <= maxbytes or q <= 68:
                    break
                q -= 4
            w, h, reenc = out.width, out.height, True

    # sanity check what we wrote, then move into place
    with Image.open(tmp) as chk:
        chk.verify()
    os.replace(tmp, dst)
    print(json.dumps({"ok": True, "w": w, "h": h, "bytes": os.path.getsize(dst),
                      "reencoded": reenc, "srcFormat": fmt}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # report, never crash the caller silently
        if len(sys.argv) > 2 and os.path.exists(sys.argv[2] + ".part"):
            os.remove(sys.argv[2] + ".part")
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        sys.exit(1)
