import os
import json
import shutil
import subprocess
import tempfile

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils.translation import gettext_lazy as _
from rest_framework import status, exceptions, parsers
from rest_framework.response import Response

from app.api.tasks import flatten_files, TaskNestedView
from webodm import settings

MAX_OVERLAY_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


class TaskOverlayConvert(TaskNestedView):
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)

    def post(self, request, pk=None, project_pk=None):
        """
        Convert an uploaded DXF file or zipped shapefile to GeoJSON (EPSG:4326)
        using ogr2ogr. For DXF files (which carry no CRS) the source SRS is taken
        from the EPSG parameter (defaults to the task's EPSG). For zipped shapefiles
        the embedded .prj is used, unless an EPSG parameter is explicitly provided.
        The conversion is stateless (nothing is stored with the task).
        """
        task = self.get_and_check_task(request, pk)

        files = flatten_files(request.FILES)
        if len(files) != 1:
            raise exceptions.ValidationError(detail=_("Missing file"))

        file = files[0]
        is_dxf = file.name.lower().endswith(".dxf")
        is_zip = file.name.lower().endswith(".zip")
        if not is_dxf and not is_zip:
            raise exceptions.ValidationError(detail=_("Not a DXF or zipped shapefile: %(file)s") % {'file': file.name})
        if file.size > MAX_OVERLAY_FILE_SIZE:
            raise exceptions.ValidationError(detail=_("%(file)s is bigger than 5 MB.") % {'file': file.name})

        epsg = request.data.get('epsg')
        if epsg is None and is_dxf:
            epsg = task.epsg
        if epsg is not None:
            try:
                epsg = int(epsg)
            except (TypeError, ValueError):
                raise exceptions.ValidationError(detail=_("Invalid EPSG code"))
        elif is_dxf:
            raise exceptions.ValidationError(detail=_("Invalid EPSG code"))

        ogr2ogr_bin = shutil.which("ogr2ogr")
        if ogr2ogr_bin is None:
            return Response({'error': "Cannot find ogr2ogr"}, status=status.HTTP_400_BAD_REQUEST)

        tmpdir = tempfile.mkdtemp('_overlay', dir=settings.MEDIA_TMP)
        try:
            infile = os.path.join(tmpdir, "input.dxf" if is_dxf else "input.zip")
            with open(infile, 'wb') as fd:
                if isinstance(file, InMemoryUploadedFile):
                    for chunk in file.chunks():
                        fd.write(chunk)
                else:
                    with open(file.temporary_file_path(), 'rb') as f:
                        shutil.copyfileobj(f, fd)

            src = infile if is_dxf else "/vsizip/{}".format(infile)
            args = [ogr2ogr_bin, "-f", "GeoJSON", "-t_srs", "EPSG:4326"]
            if epsg is not None:
                args += ["-s_srs", "EPSG:{}".format(epsg)]

            outfile = os.path.join(tmpdir, "output.geojson")
            p = subprocess.Popen(args + [outfile, src],
                                 cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, err = p.communicate()
            if p.returncode != 0:
                return Response({'error': _("Cannot convert %(file)s: %(reason)s") % {'file': file.name, 'reason': err.decode('utf-8').strip()}},
                                status=status.HTTP_400_BAD_REQUEST)

            try:
                with open(outfile, 'r', encoding='utf-8') as f:
                    geojson = json.load(f)
            except (IOError, json.JSONDecodeError):
                return Response({'error': _("Cannot convert %(file)s: %(reason)s") % {'file': file.name, 'reason': "invalid output"}},
                                status=status.HTTP_400_BAD_REQUEST)

            return Response(geojson, status=status.HTTP_200_OK)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
