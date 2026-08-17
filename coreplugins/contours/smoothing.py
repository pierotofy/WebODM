# Pure numpy port of the FeaturePreservingSmoothing tool from
# WhiteboxTools (MIT license, (c) Dr. John Lindsay), a highly modified
# version of the DEM de-noising algorithm by Sun et al. (2007):
# https://github.com/jblindsay/whitebox-tools
#
# The elevation update step uses Jacobi iterations (all cells updated from the
# previous iteration's values) instead of the original's in-place row-major
# sweeps, which cannot be vectorized. Rasters are processed in tiles with a
# halo wide enough that the tiled output is identical to an untiled run.
import math
import os
import numpy as np
import rasterio
from rasterio.windows import Window
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

FILTER_SIZE = 11
TILE_SIZE = 1024

# Internal nodata sentinel; multiplying it by an exactly-zero weight yields 0
NODATA = np.float32(-3.402823e38)

# Neighbor offsets (same ordering as whitebox's dx/dy)
DX = (1, 1, 1, 0, -1, -1, -1, 0)
DY = (-1, 0, 1, 1, 1, 0, -1, -1)


def get_smoothing_params(smoothing):
    """Map the single user-facing smoothing value to the algorithm's
    parameters. At the default (2.5) these equal whitebox's defaults
    (norm_diff=15 degrees, 3 iterations)."""
    smoothing = max(0.0, min(10.0, float(smoothing)))
    norm_diff = max(0.5, min(85.0, smoothing * 6.0))
    num_iter = int(max(1, min(10, round(smoothing * 1.2))))
    return norm_diff, num_iter


def _normals(z, valid, res_x, res_y, z_factor):
    # Fitted-plane normals from 3x3 neighborhoods (Horn 1981). Normals are
    # stored as (a, b) with an implicit c=1 component. Nodata (or out of
    # bounds) neighbors take the center cell's value.
    rows, cols = z.shape
    zp = np.pad(z, 1, mode='constant', constant_values=NODATA)
    vals = []
    for n in range(8):
        nb = zp[1 + DY[n]:1 + DY[n] + rows, 1 + DX[n]:1 + DX[n] + cols]
        vals.append(np.where(nb != NODATA, nb, z))

    a = -(vals[2] - vals[4] + 2.0 * (vals[1] - vals[5]) + vals[0] - vals[6])
    a *= np.float32(z_factor / (8.0 * res_x))
    b = -(vals[6] - vals[4] + 2.0 * (vals[7] - vals[3]) + vals[0] - vals[2])
    b *= np.float32(z_factor / (8.0 * res_y))
    a[~valid] = 0
    b[~valid] = 0
    return a, b


def _unit_normals(a, b):
    inv = a * a
    inv += b * b
    inv += 1.0
    np.sqrt(inv, out=inv)
    np.reciprocal(inv, out=inv)
    return a * inv, b * inv, inv


def _weight(ua, ub, uc, uap, ubp, ucp, vp, dy, dx, r, threshold):
    # w = max(cos(angle) - threshold, 0)^2, masked by neighbor validity,
    # where cos(angle) is between the center normal and the normal at (dy, dx)
    rows, cols = ua.shape
    view = lambda p: p[r + dy:r + dy + rows, r + dx:r + dx + cols]
    w = ua * view(uap)
    w += ub * view(ubp)
    w += uc * view(ucp)
    w -= threshold
    np.maximum(w, 0, out=w)
    w *= w
    w *= view(vp)
    return w


def _smooth_normals(a, b, valid, threshold, mid):
    # Smooth the normal vector field, weighting neighbors in a
    # FILTER_SIZE x FILTER_SIZE window by angular similarity.
    #
    # cos(angle) is symmetric between cell pairs, so each offset pair
    # (d, -d) shares a single cosine computation, done over a domain
    # extended by `mid` so the reversed direction is a shifted view of it.
    # Cells in the zero padding have a zero-length pseudo normal, which
    # yields an exactly-zero weight without needing a validity mask.
    rows, cols = a.shape
    ua, ub, uc = _unit_normals(a, b)
    m2 = 2 * mid
    erows, ecols = rows + m2, cols + m2
    pad2 = lambda arr: np.pad(arr, m2, mode='constant', constant_values=0)
    pua, pub, puc = pad2(ua), pad2(ub), pad2(uc)
    pa, pb = pad2(a), pad2(b)
    all_valid = bool(valid.all())
    pv = None if all_valid else pad2(valid.astype(np.float32))

    def eview(p, dy, dx):
        return p[mid + dy:mid + dy + erows, mid + dx:mid + dx + ecols]

    def cview(p, dy, dx):
        return p[m2 + dy:m2 + dy + rows, m2 + dx:m2 + dx + cols]

    thr = np.float32(threshold)
    w0 = np.float32((1.0 - threshold) ** 2)  # self term: cos(angle) = 1
    sw = np.full_like(a, w0)
    sa = a * w0
    sb = b * w0

    d_cos = np.empty((erows, ecols), dtype=np.float32)
    t = np.empty((erows, ecols), dtype=np.float32)
    tmp = np.empty((rows, cols), dtype=np.float32)
    wbuf = None if all_valid else np.empty((rows, cols), dtype=np.float32)

    for dy in range(0, mid + 1):
        for dx in range(-mid if dy > 0 else 1, mid + 1):
            np.multiply(eview(pua, 0, 0), eview(pua, dy, dx), out=d_cos)
            np.multiply(eview(pub, 0, 0), eview(pub, dy, dx), out=t)
            d_cos += t
            np.multiply(eview(puc, 0, 0), eview(puc, dy, dx), out=t)
            d_cos += t
            d_cos -= thr
            np.maximum(d_cos, 0, out=d_cos)
            d_cos *= d_cos

            # d_cos[i, j] now holds the weight between cells (i - mid, j - mid)
            # and (i - mid + dy, j - mid + dx) of the tile
            for w_view, sdy, sdx in ((d_cos[mid:mid + rows, mid:mid + cols], dy, dx),
                                     (d_cos[mid - dy:mid - dy + rows, mid - dx:mid - dx + cols], -dy, -dx)):
                if all_valid:
                    w = w_view
                else:
                    np.multiply(w_view, cview(pv, sdy, sdx), out=wbuf)
                    w = wbuf
                sw += w
                np.multiply(cview(pa, sdy, sdx), w, out=tmp)
                sa += tmp
                np.multiply(cview(pb, sdy, sdx), w, out=tmp)
                sb += tmp

    # Where the center is valid, sw > 0 is guaranteed by the self term
    sa /= sw
    sb /= sw
    if not all_valid:
        sa[~valid] = 0
        sb[~valid] = 0
    return sa, sb


def _update_elevations(z, valid, a_s, b_s, threshold, num_iter, res_x, res_y):
    # Update elevations from the smoothed normal field: each neighbor's
    # fitted plane predicts the center's elevation, blended by angular
    # similarity weights. Weights don't depend on elevations, so they are
    # computed once and reused across iterations.
    rows, cols = z.shape
    ua, ub, uc = _unit_normals(a_s, b_s)
    pad = lambda arr, cv: np.pad(arr, 1, mode='constant', constant_values=cv)
    uap, ubp, ucp = pad(ua, 0), pad(ub, 0), pad(uc, 0)
    ap, bp = pad(a_s, 0), pad(b_s, 0)
    vp = pad(valid, False).astype(np.float32)
    thr = np.float32(threshold)

    weights = []
    sw = np.zeros_like(z)
    c = np.zeros_like(z)
    for n in range(8):
        w = _weight(ua, ub, uc, uap, ubp, ucp, vp, DY[n], DX[n], 1, thr)
        weights.append(w)
        sw += w
        # Plane offset at neighbor n evaluated at the center cell
        view = lambda p: p[1 + DY[n]:1 + DY[n] + rows, 1 + DX[n]:1 + DX[n] + cols]
        plane = view(ap) * np.float32(-DX[n] * res_x)
        plane += view(bp) * np.float32(DY[n] * res_y)
        plane *= w
        c += plane

    upd = valid & (sw > 0)
    np.maximum(sw, np.float32(1e-30), out=sw)

    out = z.copy()
    for _ in range(num_iter):
        outp = np.pad(out, 1, mode='constant', constant_values=NODATA)
        acc = np.zeros_like(z)
        for n in range(8):
            # Invalid neighbors have an exactly-zero weight
            acc += weights[n] * outp[1 + DY[n]:1 + DY[n] + rows, 1 + DX[n]:1 + DX[n] + cols]
        acc -= c
        acc /= sw
        out = np.where(upd, acc, out)
    return out


def _smooth_tile(z, valid, res_x, res_y, z_factor, threshold, num_iter):
    mid = FILTER_SIZE // 2
    with np.errstate(over='ignore', invalid='ignore'):
        a, b = _normals(z, valid, res_x, res_y, z_factor)
        a_s, b_s = _smooth_normals(a, b, valid, threshold, mid)
        del a, b
        return _update_elevations(z, valid, a_s, b_s, threshold, num_iter, res_x, res_y)


def smooth_dem(input_file, output_file, smoothing=2.5, tile_size=TILE_SIZE, max_workers=None):
    """Smooth a DEM raster with feature preserving smoothing.
    :param smoothing amount of smoothing to apply (0-10). Higher values
        produce smoother surfaces.
    """
    norm_diff, num_iter = get_smoothing_params(smoothing)
    threshold = math.cos(math.radians(norm_diff))
    halo = FILTER_SIZE // 2 + 1 + num_iter
    if max_workers is None:
        max_workers = min(4, os.cpu_count() or 1)

    with rasterio.Env(GDAL_CACHEMAX=128), rasterio.open(input_file) as src:
        rows, cols = src.height, src.width
        res_x, res_y = abs(src.transform.a), abs(src.transform.e)
        z_factor = 1.0
        if src.crs is not None and src.crs.is_geographic:
            mid_lat = (src.bounds.top + src.bounds.bottom) / 2.0
            if -90.0 <= mid_lat <= 90.0:
                z_factor = 1.0 / (111320.0 * math.cos(math.radians(mid_lat)))

        src_nodata = src.nodata
        out_nodata = src_nodata if src_nodata is not None and math.isfinite(src_nodata) else -9999
        profile = src.profile.copy()
        profile.update(dtype='float32', count=1, nodata=out_nodata,
                       compress='deflate', bigtiff='if_safer')

        windows = []
        for r0 in range(0, rows, tile_size):
            for c0 in range(0, cols, tile_size):
                windows.append((r0, c0, min(r0 + tile_size, rows), min(c0 + tile_size, cols)))

        io_lock = Lock()
        with rasterio.open(output_file, 'w', **profile) as dst:
            def process(tw):
                r0, c0, r1, c1 = tw
                rr0, cc0 = max(0, r0 - halo), max(0, c0 - halo)
                rr1, cc1 = min(rows, r1 + halo), min(cols, c1 + halo)

                with io_lock:
                    z = src.read(1, window=Window(cc0, rr0, cc1 - cc0, rr1 - rr0))
                z = z.astype(np.float32, copy=False)

                valid = np.isfinite(z)
                if src_nodata is not None and math.isfinite(src_nodata):
                    valid &= (z != np.float32(src_nodata))

                if valid.any():
                    z[~valid] = NODATA
                    sm = _smooth_tile(z, valid, res_x, res_y, z_factor, threshold, num_iter)
                    sm = sm[r0 - rr0:r0 - rr0 + (r1 - r0), c0 - cc0:c0 - cc0 + (c1 - c0)]
                    sm = np.where(valid[r0 - rr0:r0 - rr0 + (r1 - r0), c0 - cc0:c0 - cc0 + (c1 - c0)],
                                  sm, np.float32(out_nodata))
                else:
                    sm = np.full((r1 - r0, c1 - c0), out_nodata, dtype=np.float32)

                with io_lock:
                    dst.write(sm, 1, window=Window(c0, r0, c1 - c0, r1 - r0))

            if max_workers > 1 and len(windows) > 1:
                with ThreadPoolExecutor(max_workers=max_workers) as pool:
                    list(pool.map(process, windows))
            else:
                for tw in windows:
                    process(tw)

    return output_file
