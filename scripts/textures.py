# art/raw (Codex photographs, the Blender panorama) -> public/tex: tiling colour maps, normal maps, the light gobo.
# usage: python3 scripts/textures.py
#
# Tiling: each photograph is made seamless by cross-fading a band at its right/bottom edge into its left/top edge,
# with the blend's contrast restored so the band does not look washed out (a variance-preserving blend).
# Colour: the crust and crumb are graded so their medians match colours sampled from photographs of real
# Nagasaki castella (Fukusaya, Bunmeido and others), not what the image model happened to paint.
import os, shutil
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RAW = os.path.join(ROOT, 'art/raw')
OUT = os.path.join(ROOT, 'public/tex')
os.makedirs(OUT, exist_ok=True)

def load(name):
    return np.asarray(Image.open(os.path.join(RAW, name + '.png')).convert('RGB')).astype(np.float32) / 255.0

def save(a, name, q=88):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    p = os.path.join(OUT, name)
    if name.endswith('.jpg'):
        im.save(p, quality=q, optimize=True, progressive=True)
    else:
        im.save(p, optimize=True)
    print('wrote', name, im.size, os.path.getsize(p) // 1024, 'KB')

def seamless(a, frac=0.16):
    """Wrap-continuous in both axes: blend a band from the far edge into the near edge, keep the variance."""
    for axis in (1, 0):
        n = a.shape[axis]
        b = int(n * frac)
        keep = n - b
        w = np.linspace(0, 1, b, dtype=np.float32)
        shape = [1, 1, 1]
        shape[axis] = b
        w = w.reshape(shape)
        head = np.take(a, range(0, b), axis=axis)
        tail = np.take(a, range(keep, n), axis=axis)
        mean = a.mean(axis=(0, 1), keepdims=True)
        blend = head * w + tail * (1 - w)
        blend = mean + (blend - mean) / np.sqrt(w * w + (1 - w) ** 2)
        body = np.take(a, range(b, keep), axis=axis)
        a = np.concatenate([blend, body], axis=axis)
    return a

def resize(a, size):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0

def grade(a, target_hex, strength=1.0):
    """Scale each channel (in linear light) so the image's median hits the target colour."""
    lin = a ** 2.2
    t = np.array([int(target_hex[i:i + 2], 16) / 255.0 for i in (1, 3, 5)], np.float32) ** 2.2
    med = np.median(lin.reshape(-1, 3), axis=0)
    k = (t / np.maximum(med, 1e-4)) ** strength
    return np.clip(lin * k, 0, 1) ** (1 / 2.2)

def normal_map(a, strength, blur=0.0):
    """Tangent-space normals from the luminance read as height (dark pores are low), wrapping at the edges."""
    h = a @ np.array([0.299, 0.587, 0.114], np.float32)
    if blur:
        h = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255.0
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    n = np.stack([-dx * strength, dy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def hexmed(a):
    m = np.median(a.reshape(-1, 3), axis=0)
    return '#%02x%02x%02x' % tuple(int(v * 255) for v in m)

# the cut crumb: honey yellow, fine. Sampled from a lit Fukusaya slice: #f2cf66
crumb = seamless(grade(load('crumb'), '#f3d36c'))
crumb = resize(crumb, (1024, 1024))
# the photograph's pores are faint: a cut castella shows them clearly, darker in their depths
m = crumb.mean(axis=(0, 1), keepdims=True)
crumb = np.clip(m + (crumb - m) * 2.1, 0, 1)
save(crumb, 'crumb.jpg')
save(normal_map(crumb, 7.0, 0.5), 'crumb_n.jpg', 92)
print('  crumb median', hexmed(crumb))

# the top crust: a smooth, satin, deep caramel brown. Sampled: #814220, #724b35, #602107
crust = seamless(grade(load('crust'), '#7a4122'))
crust = resize(crust, (1024, 1024))
save(crust, 'crust.jpg')
save(normal_map(crust, 5.0, 1.2), 'crust_n.jpg', 92)
print('  crust median', hexmed(crust))

# the bottom: dark reddish brown, set with zarame crystals
bottom = seamless(grade(load('bottom'), '#5e2a14', 0.7))
bottom = resize(bottom, (1024, 1024))
save(bottom, 'bottom.jpg')
save(normal_map(bottom, 6.0, 1.0), 'bottom_n.jpg', 92)

# the table linen and the washi sheet, tiling
save(resize(seamless(load('linen')), (1024, 1024)), 'linen.jpg', 84)
save(resize(seamless(load('washi')), (1024, 1024)), 'washi.jpg', 84)

# the hinoki board: one photograph across the whole board, no tiling
board = load('board')
bl = board.mean(axis=2, keepdims=True)
board = bl + (board - bl) * 0.7  # hinoki is a pale, quiet cream
save(resize(board, (1536, 1024)), 'board.jpg', 86)

# the light through the maple outside the window: a soft, single-channel gobo, tiling so it can drift
leaves = load('leaves').mean(axis=2, keepdims=True).repeat(3, 2)
leaves = seamless(leaves, 0.2)
leaves = resize(leaves, (1024, 1024))
lo, hi = np.percentile(leaves, 2), np.percentile(leaves, 99.5)
leaves = np.clip((leaves - lo) / (hi - lo), 0, 1)
# the shade of a leaf is never black: skylight still reaches it
leaves = 0.3 + 0.7 * leaves
save(leaves, 'leaves.jpg', 86)

# the wall behind, out of focus
bd = Image.open(os.path.join(RAW, 'backdrop.png')).convert('RGB').resize((1536, 1024), Image.LANCZOS)
bd.save(os.path.join(OUT, 'backdrop.webp'), quality=82, method=6)
print('wrote backdrop.webp')

shutil.copyfile(os.path.join(RAW, 'room.hdr'), os.path.join(OUT, 'room.hdr'))
print('copied room.hdr')
