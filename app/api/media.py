import os
import re
import mimetypes

from rest_framework import status, exceptions, parsers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app import models
from .common import get_and_check_project, check_project_perms
from app.security import path_traversal_check
from django.core.exceptions import ObjectDoesNotExist, SuspiciousFileOperation, ValidationError
from django.http import FileResponse
from django.utils.translation import gettext_lazy as _
from webodm import settings

MAX_MEDIA_FILE_SIZE = 128 * 1024 * 1024 * 1024  # 128 GB


class TaskMediaBase(APIView):
    queryset = models.Task.objects.all().select_related('project')
    permission_classes = (AllowAny,)

    def get_task(self, request, pk, project_pk, perms=('view_project',)):
        try:
            task = self.queryset.get(pk=pk, project=project_pk)
        except (ObjectDoesNotExist, ValidationError):
            raise exceptions.NotFound()

        if not (task.public or task.project.public):
            check_project_perms(request, task.project, perms)
        elif perms != ('view_project',):
            check_project_perms(request, task.project, perms)

        return task


class TaskMediaUpload(TaskMediaBase):
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)

    def post(self, request, pk=None, project_pk=None):
        task = self.get_task(request, pk, project_pk, ('change_project',))

        files = [f for flist in request.FILES.lists() for f in flist[1]]
        if not files:
            raise exceptions.ValidationError(detail=_("No files uploaded"))

        chunk_index = request.data.get('dzchunkindex')
        dz_uuid = request.data.get('dzuuid')
        total_chunk_count = request.data.get('dztotalchunkcount')

        chunked = (len(files) == 1
                   and chunk_index is not None
                   and dz_uuid is not None
                   and total_chunk_count is not None)

        media_dir = task.media_directory_path()
        os.makedirs(media_dir, exist_ok=True)

        uploaded = {}

        for f in files:
            safe_name = models.Task.sanitize_filename(f.name)
            ext = os.path.splitext(safe_name)[1].lower()
            if ext not in models.Task.MEDIA_EXTENSIONS:
                continue

            if chunked:
                try:
                    ci = int(chunk_index)
                    tc = int(total_chunk_count)
                except ValueError:
                    raise exceptions.ValidationError(detail=_("Invalid chunk parameters"))

                clean_uuid = re.sub(r'[^0-9a-zA-Z-]', '', dz_uuid)
                tmp_path = os.path.join(settings.FILE_UPLOAD_TEMP_DIR, f"{clean_uuid}.media_upload")

                if ci == 0 and os.path.isfile(tmp_path):
                    os.remove(tmp_path)

                with open(tmp_path, 'ab') as fd:
                    for chunk in f.chunks():
                        fd.write(chunk)

                if ci + 1 < tc:
                    return Response({'uploading': True}, status=status.HTTP_200_OK)

                if os.path.getsize(tmp_path) > MAX_MEDIA_FILE_SIZE:
                    os.remove(tmp_path)
                    raise exceptions.ValidationError(
                        detail=_("File exceeds maximum allowed size of 128 GB"))

                dst = os.path.join(media_dir, safe_name)
                if os.path.isfile(dst):
                    os.remove(dst)
                os.rename(tmp_path, dst)
                uploaded[safe_name] = os.path.getsize(dst)
            else:
                if f.size > MAX_MEDIA_FILE_SIZE:
                    raise exceptions.ValidationError(
                        detail=_("File exceeds maximum allowed size of 128 GB"))

                dst = os.path.join(media_dir, safe_name)
                with open(dst, 'wb+') as fd:
                    for chunk in f.chunks():
                        fd.write(chunk)
                uploaded[safe_name] = os.path.getsize(dst)

        task.update_media_field(commit=True)
        task.update_size(commit=True)

        return Response({
            'success': True,
            'uploaded': uploaded,
            'media': task.media,
        }, status=status.HTTP_200_OK)


class TaskMediaManage(TaskMediaBase):
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    def get(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_task(request, pk, project_pk, ('view_project',))
        if not task.media:
            raise exceptions.NotFound()

        entry = None
        for e in task.media:
            if e['filename'] == filename:
                entry = e
                break
        if entry is None:
            raise exceptions.NotFound()

        return Response(entry, status=status.HTTP_200_OK)

    def patch(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_task(request, pk, project_pk, ('change_project',))
        if not task.media:
            raise exceptions.NotFound()

        found = False
        for entry in task.media:
            if entry['filename'] == filename:
                if 'description' in request.data:
                    entry['description'] = str(request.data['description'])[:1024]
                found = True
                break

        if not found:
            raise exceptions.NotFound()

        task.save()
        return Response({'success': True, 'media': task.media}, status=status.HTTP_200_OK)

    def delete(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_task(request, pk, project_pk, ('change_project',))

        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        os.remove(filepath)
        task.update_media_field(commit=True)
        task.update_size(commit=True)

        return Response({
            'success': True,
            'media': task.media,
        }, status=status.HTTP_200_OK)


class TaskMediaDownload(TaskMediaBase):
    def get(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_task(request, pk, project_pk, ('view_project',))

        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        content_type = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'

        thumb = request.GET.get('thumbnail')
        if thumb is not None:
            ext = os.path.splitext(filepath)[1].lower()
            if ext in models.Task.PHOTO_EXTENSIONS:
                try:
                    from PIL import Image
                    import io
                    size = int(thumb) if thumb else 256
                    size = min(max(size, 32), 1024)
                    with Image.open(filepath) as im:
                        im.thumbnail((size, size))
                        buf = io.BytesIO()
                        fmt = 'JPEG'
                        im.save(buf, format=fmt)
                        buf.seek(0)
                        return FileResponse(buf, content_type='image/jpeg')
                except Exception:
                    pass

        response = FileResponse(open(filepath, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename={filename}'
        response['Content-Length'] = os.path.getsize(filepath)
        return response
