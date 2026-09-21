"""Profile photo: face-aware square crop for resume page + chainlit avatar.

Input: any jpg/png/webp. Output: /data/avatar/avatar.jpg (512x512, face centered)
chainlit avatar served from /data is mounted into containers at /data; the
public avatar file is copied to app/public-static/avatar.jpg by the uploader
(nginx serves /avatar.jpg statically) and also referenced in the admin chat.
"""
import base64
import os

import cv2
import numpy as np
from PIL import Image

AVATAR_DIR = os.environ.get("AVATAR_DIR", "/data/avatar")
AVATAR_PATH = os.path.join(AVATAR_DIR, "avatar.jpg")
STATIC_AVATAR = "/static/avatar.jpg"  # bind-mounted public-static in containers
# chainlit serves /avatars/<author>.<ext> from /srv/public (custom_public mount) as chat avatar
CHAT_AVATAR_DIR = "/srv/public/avatars"
CASCADE = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

os.makedirs(AVATAR_DIR, exist_ok=True)
try:
    os.makedirs(CHAT_AVATAR_DIR, exist_ok=True)
except OSError:
    CHAT_AVATAR_DIR = None


def _detect_face(img_bgr: np.ndarray):
    """Return largest face box (x, y, w, h) or None."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    detector = cv2.CascadeClassifier(CASCADE)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if len(faces) == 0:
        return None
    return max(faces, key=lambda f: f[2] * f[3])


def make_avatar(image_bytes: bytes) -> dict:
    """Crop to square with face centered, resize 512x512, save & sync static copy."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "无法解析图片，请上传 jpg/png/webp 格式"}
    h, w = img.shape[:2]
    face = _detect_face(img)

    # Square crop window
    side = min(h, w)
    if face is not None:
        fx, fy, fw, fh = face
        # Face should occupy ~62% of the frame height, centered slightly above middle
        side = int(max(fw, fh) / 0.62)
        side = max(120, min(side, min(h, w) * 2))
        cx, cy = fx + fw // 2, fy + int(fh * 0.45)
    else:
        # No face found: center-top heuristic (typical portrait composition)
        cx, cy = w // 2, int(h * 0.38)

    x0 = max(0, min(w - side, cx - side // 2))
    y0 = max(0, min(h - side, cy - side // 2))
    crop = img[y0 : y0 + side, x0 : x0 + side]

    # If crop ran out of image (side larger than image), pad symmetric
    ch, cw = crop.shape[:2]
    side2 = max(ch, cw)
    if ch != cw or cw != side2:
        canvas = np.zeros((side2, side2, 3), dtype=np.uint8)
        canvas[:ch, :cw] = crop
        crop = canvas

    avatar = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", avatar, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        return {"error": "图片编码失败"}
    with open(AVATAR_PATH, "wb") as f:
        f.write(buf.tobytes())
    static_ok = _write(buf.tobytes(), STATIC_AVATAR)
    # chat avatar for both chainlit sides. Chainlit's /avatars/<id> route transforms
    # the author name (config.ui.name, here "候选人 Agent") via
    # lower().replace(' ','_').replace('.','_') → "候选人_agent" — match that, and
    # also write "assistant" as a fallback alias.
    chat_ok = bool(CHAT_AVATAR_DIR)
    if chat_ok:
        from chainlit.config import config as cl_config
        aid = cl_config.ui.name.strip().lower().replace(" ", "_").replace(".", "_")
        chat_ok = _write(buf.tobytes(), os.path.join(CHAT_AVATAR_DIR, f"{aid}.jpg"))
        _write(buf.tobytes(), os.path.join(CHAT_AVATAR_DIR, "assistant.jpg"))
    return {
        "saved": AVATAR_PATH,
        "face_detected": face is not None,
        "size": 512,
        "static_synced": static_ok,
        "chat_avatar_synced": chat_ok,
    }


def _write(data: bytes, path: str) -> bool:
    try:
        with open(path, "wb") as f:
            f.write(data)
        return True
    except OSError:
        return False


def avatar_bytes_b64() -> str:
    with open(AVATAR_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode()


def has_avatar() -> bool:
    return os.path.exists(AVATAR_PATH)
