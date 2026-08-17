import os

from rest_framework import status
from rest_framework.response import Response
from app.plugins.views import TaskView, CheckTask, GetTaskResult
from app.plugins.worker import run_function_async
from django.utils.translation import gettext_lazy as _

class ContoursException(Exception):
    pass

def calc_contours(dem, epsg, interval, output_format, simplify, zfactor = 1, smoothing = 2.5, contour_type = "line", crop = None, task_name = None):
    import os
    import subprocess
    import tempfile
    import shutil
    import glob
    import json
    import re
    import importlib.util
    from webodm import settings
    from django.contrib.gis.geos import GEOSGeometry
    from app.geoutils import get_rasterio_to_meters_factor
    
    ext = ""
    if output_format == "GeoJSON":
        ext = "json"
    elif output_format == "GPKG":
        ext = "gpkg"
    elif output_format == "DXF":
        ext = "dxf"
    elif output_format == "ESRI Shapefile":
        ext = "shp"
    MIN_CONTOUR_LENGTH = 10

    tmpdir = os.path.join(settings.MEDIA_TMP, os.path.basename(tempfile.mkdtemp('_contours', dir=settings.MEDIA_TMP)))
    gdal_contour_bin = shutil.which("gdal_contour")
    ogr2ogr_bin = shutil.which("ogr2ogr")
    gdalwarp_bin = shutil.which("gdalwarp")

    if gdal_contour_bin is None:
        return {'error': 'Cannot find gdal_contour'}
    if ogr2ogr_bin is None:
        return {'error': 'Cannot find ogr2ogr'}
    if gdalwarp_bin is None and crop is not None:
        return {'error': 'Cannot find gdalwarp'}
    
    to_meter = get_rasterio_to_meters_factor(dem)
    interval /= to_meter
    simplify /= to_meter
    MIN_CONTOUR_LENGTH /= to_meter
    zfactor *= to_meter

    # Make a VRT with the crop area
    if crop is not None:
        crop_geojson = os.path.join(tmpdir, "crop.geojson")
        dem_vrt = os.path.join(tmpdir, "dem.vrt")
        with open(crop_geojson, "w", encoding="utf-8") as f:
            f.write(GEOSGeometry(crop).geojson)
        p = subprocess.Popen([gdalwarp_bin, "-cutline", crop_geojson,
                '--config', 'GDALWARP_DENSIFY_CUTLINE', 'NO', 
                '-crop_to_cutline', '-dstnodata', '-9999', '-of', 'VRT',
                dem, dem_vrt], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = p.communicate()
        out = out.decode('utf-8').strip()
        err = err.decode('utf-8').strip()
        if p.returncode != 0:
            return {'error': f'Error calling gdalwarp: {str(err)}'}

        dem = dem_vrt

    # Smooth the input surface before computing contours
    if smoothing > 0:
        spec = importlib.util.spec_from_file_location("contours_smoothing",
                os.path.join(settings.BASE_DIR, "coreplugins", "contours", "smoothing.py"))
        contours_smoothing = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(contours_smoothing)

        smoothed_dem = os.path.join(tmpdir, "smoothed.tif")
        try:
            contours_smoothing.smooth_dem(dem, smoothed_dem, smoothing=smoothing)
            dem = smoothed_dem
        except Exception as e:
            return {'error': f'Error smoothing DEM: {str(e)}'}

    contours_file = f"contours.gpkg"
    if contour_type == "fill":
        contour_args = ["-p", "-amin", "amin", "-amax", "amax"]
    else:
        contour_args = ["-a", "level", "-3d"]
    p = subprocess.Popen([gdal_contour_bin, "-q"] + contour_args + ["-f", "GPKG", "-i", str(interval), dem, contours_file], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate()

    out = out.decode('utf-8').strip()
    err = err.decode('utf-8').strip()
    success = p.returncode == 0

    if not success:
        return {'error': f'Error calling gdal_contour: {str(err)}'}

    output_basename = "output"
    if task_name is not None:
        output_basename = re.sub(r'[^0-9a-zA-Z-_]+', '', task_name.replace(" ", "-").replace("/", "-")) + ("-" if task_name else "") + "contours"
        output_basename = re.sub(r'-[-]+', '-', output_basename)

    if contour_type == "fill":
        sql = f"SELECT ID, ROUND(amin * {zfactor}, 5) AS level, ROUND(amax * {zfactor}, 5) AS level_max, GEOM FROM contour"
    else:
        sql = f"SELECT ID, ROUND(level * {zfactor}, 5) AS level, GeomFromGML(AsGML(ATM_Transform(GEOM, ATM_Scale(ATM_Create(), 1, 1, {zfactor})), 10)) as GEOM FROM contour WHERE ST_Length(GEOM) >= {MIN_CONTOUR_LENGTH}"

    outfile = os.path.join(tmpdir, f"{output_basename}.{ext}")
    p = subprocess.Popen([ogr2ogr_bin, outfile, contours_file, "-simplify", str(simplify), "-f", output_format, "-t_srs", f"EPSG:{epsg}", "-nln", "contours",
                            "-dialect", "sqlite", "-sql", sql], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate()

    out = out.decode('utf-8').strip()
    err = err.decode('utf-8').strip()
    success = p.returncode == 0

    if not success:
        return {'error': f'Error calling ogr2ogr: {str(err)}'}
    
    if not os.path.isfile(outfile):
        return {'error': f'Cannot find output file: {outfile}'}
    
    if output_format == "ESRI Shapefile":
        ext="zip"
        shp_dir = os.path.join(tmpdir, "contours")
        os.makedirs(shp_dir)
        contour_files = glob.glob(os.path.join(tmpdir, f"{output_basename}.*"))
        for cf in contour_files:
            shutil.move(cf, shp_dir)

        shutil.make_archive(os.path.join(tmpdir, output_basename), 'zip', shp_dir)
        outfile = os.path.join(tmpdir, f"{output_basename}.{ext}")

    return {'file': outfile}


class TaskContoursGenerate(TaskView):
    def post(self, request, pk=None):
        task = self.get_and_check_task(request, pk)

        layer = request.data.get('layer', None)
        if layer == 'DSM' and task.dsm_extent is None:
            return Response({'error': _('No DSM layer is available.')})
        elif layer == 'DTM' and task.dtm_extent is None:
            return Response({'error': _('No DTM layer is available.')})

        try:
            if layer == 'DSM':
                dem = os.path.abspath(task.get_asset_download_path("dsm.tif"))
            elif layer == 'DTM':
                dem = os.path.abspath(task.get_asset_download_path("dtm.tif"))
            else:
                raise ContoursException('{} is not a valid layer.'.format(layer))

            epsg = int(request.data.get('epsg', '3857'))
            interval = float(request.data.get('interval', 1))
            format = request.data.get('format', 'GPKG')
            supported_formats = ['GPKG', 'ESRI Shapefile', 'DXF', 'GeoJSON']
            if not format in supported_formats:
                raise ContoursException("Invalid format {} (must be one of: {})".format(format, ",".join(supported_formats)))
            simplify = float(request.data.get('simplify', 0.01))
            zfactor = float(request.data.get('zfactor', 1))
            smoothing = max(0.0, min(10.0, float(request.data.get('smoothing', 2.5))))
            contour_type = request.data.get('type', 'line')
            if not contour_type in ['line', 'fill']:
                raise ContoursException("Invalid type {} (must be one of: line,fill)".format(contour_type))

            celery_task_id = run_function_async(calc_contours, dem, epsg, interval, format, simplify, zfactor, smoothing, contour_type, task.crop.wkt if task.crop is not None else None, task.name).task_id
            return Response({'celery_task_id': celery_task_id}, status=status.HTTP_200_OK)
        except ContoursException as e:
            return Response({'error': str(e)}, status=status.HTTP_200_OK)


class TaskContoursDownload(GetTaskResult):
    pass
