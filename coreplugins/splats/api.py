from django.http import StreamingHttpResponse
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from app.api.common import get_asset_download_filename
from app.plugins.views import TaskView

from . import colmap

class TaskColmapExport(TaskView):
    def get(self, request, pk=None):
        """
        Generates a COLMAP export (binary format) of a task,
        including images, camera poses and a sparse point cloud
        """
        task = self.get_and_check_task(request, pk)

        try:
            image_size = int(request.GET.get('image_size', '0'))
        except ValueError:
            raise exceptions.ValidationError(detail=_("Invalid image_size parameter"))
        if not (image_size == 0 or image_size >= 16):
            raise exceptions.ValidationError(detail=_("Invalid image_size parameter"))

        try:
            sample = float(request.GET.get('sample', '1'))
        except ValueError:
            raise exceptions.ValidationError(detail=_("Invalid sample parameter"))
        if not (0 <= sample <= 100000):
            raise exceptions.ValidationError(detail=_("Invalid sample parameter"))

        try:
            stream = colmap.export_stream(task, image_size=image_size, sample=sample)
        except FileNotFoundError:
            raise exceptions.NotFound(_("Asset does not exist"))
        except colmap.ColmapExportError as e:
            raise exceptions.ValidationError(detail=str(e))

        download_filename = request.GET.get('filename', get_asset_download_filename(task, "colmap.zip"))

        response = StreamingHttpResponse(stream, content_type="application/zip")
        response['Content-Disposition'] = "attachment; filename={}".format(download_filename)
        return response
