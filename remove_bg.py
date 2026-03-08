"""
Remove white backgrounds from Saiko assets using edge flood-fill.
Fills outward from image borders — preserves white fur inside the subject.
"""
from PIL import Image
import numpy as np
from collections import deque

ASSETS = [
    "packages/desktop/public/assets/saiko-logo.png",
    "packages/desktop/public/assets/saiko-face.png",
    "packages/desktop/public/assets/saiko-fullbody.png",
    "packages/desktop/public/assets/saiko-fullbody-alt.png",
]

WHITE_THRESHOLD = 240  # pixels brighter than this on all channels = background candidate

def flood_fill_from_edges(arr: np.ndarray) -> np.ndarray:
    """BFS flood-fill from all edge pixels, marking white-ish pixels as transparent."""
    h, w = arr.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    # Seed from all 4 edges
    for x in range(w):
        for y in [0, h - 1]:
            if all(arr[y, x, :3] >= WHITE_THRESHOLD):
                queue.append((y, x))
                visited[y, x] = True
    for y in range(h):
        for x in [0, w - 1]:
            if all(arr[y, x, :3] >= WHITE_THRESHOLD):
                if not visited[y, x]:
                    queue.append((y, x))
                    visited[y, x] = True

    while queue:
        y, x = queue.popleft()
        arr[y, x, 3] = 0  # make transparent
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                if all(arr[ny, nx, :3] >= WHITE_THRESHOLD):
                    visited[ny, nx] = True
                    queue.append((ny, nx))
    return arr

for path in ASSETS:
    try:
        img = Image.open(path).convert("RGBA")
        arr = np.array(img, dtype=np.uint8)
        arr = flood_fill_from_edges(arr)
        result = Image.fromarray(arr)
        out = path.replace(".png", "-transparent.png").replace(".jpg", "-transparent.png")
        result.save(out)
        print(f"OK {path} -> {out}")
    except Exception as e:
        print(f"FAIL {path}: {e}")
