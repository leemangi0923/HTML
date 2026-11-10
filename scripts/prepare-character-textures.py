"""Build original, seamless cloth PBR maps; no photograph or external texture input."""
from pathlib import Path
import numpy as np
from PIL import Image

out = Path(__file__).resolve().parent.parent / 'godot-workshop/assets/character'
out.mkdir(parents=True, exist_ok=True)
size = 512
v, u = np.mgrid[:size, :size] / size
warp = np.cos(2 * np.pi * 64 * u)
weft = np.cos(2 * np.pi * 64 * v)
over_under = np.cos(2 * np.pi * 32 * u) * np.cos(2 * np.pi * 32 * v)
height = 0.35 * (warp + weft) + 0.18 * over_under
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.38
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.38
normal = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255)).save(out / 'cloth-normal.png')
grain = (0.5 + 0.5 * over_under)
roughness = np.uint8((0.87 + grain * 0.10) * 255)
Image.fromarray(roughness).save(out / 'cloth-roughness.png')
print('Cloth normal and roughness maps: 512 x 512, seamless')
