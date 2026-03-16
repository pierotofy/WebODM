import os
import io
import math
import hashlib
import logging

import numpy as np
from PIL import Image
from django.core.exceptions import SuspiciousFileOperation
from django.http import FileResponse, JsonResponse
from rest_framework import exceptions

from app.api.media import TaskMediaBase
from app.security import path_traversal_check

logger = logging.getLogger('app.logger')

Image.MAX_IMAGE_PIXELS = None
ANTIALIAS = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.ANTIALIAS

TILE_SIZE = 512
QUALITY = 75

FACE_LETTERS = ['f', 'b', 'u', 'd', 'l', 'r']
FACE_INDEX = {c: i for i, c in enumerate(FACE_LETTERS)}

_cache = {}


def _cache_key(filepath):
    mtime = os.path.getmtime(filepath)
    return hashlib.md5(f"{filepath}:{mtime}".encode()).hexdigest()


def _equirect_to_cube_face(img_array, face_index, cube_size):
    """Convert equirectangular image to a cube face.

    Face vertex layout matches pannellum's libpannellum ta() function.
    Coordinate system: -Z is forward, +Y is up, +X is right.
    """
    h, w = img_array.shape[:2]

    col = np.linspace(-1, 1, cube_size)
    row = np.linspace(-1, 1, cube_size)
    u, v = np.meshgrid(col, row)

    if face_index == 0:    # front (z=-1)
        x, y, z = u, -v, -np.ones_like(u)
    elif face_index == 1:  # back (z=+1)
        x, y, z = -u, -v, np.ones_like(u)
    elif face_index == 2:  # up (y=+1)
        x, y, z = u, np.ones_like(u), -v
    elif face_index == 3:  # down (y=-1)
        x, y, z = u, -np.ones_like(u), v
    elif face_index == 4:  # left (x=-1)
        x, y, z = -np.ones_like(u), -v, -u
    elif face_index == 5:  # right (x=+1)
        x, y, z = np.ones_like(u), -v, u

    lon = np.arctan2(x, -z)
    lat = np.arctan2(y, np.sqrt(x * x + z * z))

    px = np.clip((lon / (2 * np.pi) + 0.5) * w, 0, w - 1).astype(np.int32)
    py = np.clip((0.5 - lat / np.pi) * h, 0, h - 1).astype(np.int32)

    return img_array[py, px]


def _compute_params(cube_size):
    tile_size = min(TILE_SIZE, cube_size)
    levels = int(math.ceil(math.log(float(cube_size) / tile_size, 2))) + 1
    if levels >= 2 and int(cube_size / 2 ** (levels - 2)) == tile_size:
        levels -= 1
    return cube_size, tile_size, levels


def _get_cache_entry(filepath):
    key = _cache_key(filepath)
    if key in _cache:
        return _cache[key]

    img = Image.open(filepath).convert('RGB')
    orig_w = img.size[0]
    img_array = np.array(img)
    del img

    cube_size = 8 * int(orig_w / math.pi / 8)
    cube_size, tile_size, levels = _compute_params(cube_size)

    faces = []
    for i in range(6):
        face_data = _equirect_to_cube_face(img_array, i, cube_size)
        faces.append(Image.fromarray(face_data))
    del img_array

    entry = {
        'cube_size': cube_size,
        'tile_size': tile_size,
        'levels': levels,
        'faces': faces,
        'resized': {},
    }

    _cache.clear()
    _cache[key] = entry
    return entry


def _get_face_at_level(entry, face_idx, level):
    if level == entry['levels']:
        return entry['faces'][face_idx]

    if level not in entry['resized']:
        size = int(entry['cube_size'] / 2 ** (entry['levels'] - level))
        entry['resized'][level] = [
            f.resize((size, size), ANTIALIAS) for f in entry['faces']
        ]

    return entry['resized'][level][face_idx]


class TaskPanoramaTiles(TaskMediaBase):
    def get(self, request, pk=None, project_pk=None, filename=None, path=None):
        task = self.get_task(request, pk, project_pk, ('view_project',))

        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        if path == 'config.json':
            return self._serve_config(filepath, request, pk, project_pk, filename)

        return self._serve_tile(filepath, path)

    def _serve_config(self, filepath, request, pk, project_pk, filename):
        entry = _get_cache_entry(filepath)

        base_url = f"/api/projects/{project_pk}/tasks/{pk}/media/panorama/{filename}"
        tile_path = base_url + "/%l/%s%y_%x"

        config = {
            "autoLoad": True,
            "type": "multires",
            "multiRes": {
                "path": tile_path,
                "extension": "jpg",
                "tileResolution": entry['tile_size'],
                "maxLevel": entry['levels'],
                "cubeResolution": entry['cube_size'],
            }
        }

        return JsonResponse(config)

    def _serve_tile(self, filepath, path):
        parts = path.strip('/').split('/')
        if len(parts) != 2:
            raise exceptions.NotFound()

        try:
            level = int(parts[0])
        except ValueError:
            raise exceptions.NotFound()

        tile_name = parts[1]
        if tile_name.endswith('.jpg'):
            tile_name = tile_name[:-4]

        if len(tile_name) < 2:
            raise exceptions.NotFound()

        face_letter = tile_name[0]
        if face_letter not in FACE_INDEX:
            raise exceptions.NotFound()

        rest = tile_name[1:]
        coords = rest.split('_')
        if len(coords) != 2:
            raise exceptions.NotFound()

        try:
            row = int(coords[0])
            col = int(coords[1])
        except ValueError:
            raise exceptions.NotFound()

        face_idx = FACE_INDEX[face_letter]

        entry = _get_cache_entry(filepath)
        cube_size = entry['cube_size']
        tile_size = entry['tile_size']
        levels = entry['levels']

        if level < 1 or level > levels:
            raise exceptions.NotFound()

        size_at_level = int(cube_size / 2 ** (levels - level))
        tiles_at_level = int(math.ceil(float(size_at_level) / tile_size))

        if row < 0 or row >= tiles_at_level or col < 0 or col >= tiles_at_level:
            raise exceptions.NotFound()

        face = _get_face_at_level(entry, face_idx, level)

        left = col * tile_size
        upper = row * tile_size
        right = min(left + tile_size, size_at_level)
        lower = min(upper + tile_size, size_at_level)

        tile = face.crop((left, upper, right, lower))

        buf = io.BytesIO()
        tile.save(buf, format='JPEG', quality=QUALITY)
        buf.seek(0)

        response = FileResponse(buf, content_type='image/jpeg')
        response['Cache-Control'] = 'public, max-age=86400'
        return response
