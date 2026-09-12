"""User-approved alpha extraction; preserve all pixels inside the black contour."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parents[1]
qa = root / 'artifacts/astra-qa/rabbit-repair'
preview = Image.new('RGB', (1200, 600), '#ff0033')
for index, name in enumerate(('low', 'mid', 'high')):
    source = Image.open(qa / f'head-135-{name}-raw.png').convert('RGB')
    # The opaque outline is much darker than either square of the baked backdrop.
    barrier = source.convert('L').point(lambda value: 0 if value < 65 else 255)
    ImageDraw.floodfill(barrier, (0, 0), 128, thresh=0)
    alpha = barrier.point(lambda value: 0 if value == 128 else 255)
    box = alpha.getbbox()
    assert box and box[0] > 0 and box[1] > 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(.45))
    result = source.convert('RGBA')
    result.putalpha(alpha)
    # Keep margin around all ink; never trim to the black outline itself.
    box = (max(0,box[0]-20), max(0,box[1]-20), min(source.width,box[2]+20), min(source.height,box[3]+20))
    result = result.crop(box)
    result.save(root / f'public/assets/rabbit-head-135-{name}.png')
    thumb = result.copy()
    thumb.thumbnail((370, 540))
    preview.paste(thumb, (index*400+(400-thumb.width)//2, 30), thumb)
    print(name, result.size, result.getchannel('A').getextrema())
preview.save(qa / 'heads-alpha-preview.png')
