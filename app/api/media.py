import os
import re
import mimetypes
import shutil
from PIL import Image
import io

from django.core.exceptions import ObjectDoesNotExist, SuspiciousFileOperation, ValidationError
from django.db import transaction
from django.http import FileResponse
from django.utils.translation import gettext_lazy as _
from rest_framework import status, exceptions, parsers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.files.uploadedfile import InMemoryUploadedFile

from app import models
from app.api.tasks import flatten_files, TaskNestedView
from .common import get_and_check_project, check_project_perms
from app.security import path_traversal_check, sanitize_filename
from webodm import settings

MAX_MEDIA_FILE_SIZE = 128 * 1024 * 1024 * 1024  # 128 GB


class TaskMediaBase(TaskNestedView):
    @staticmethod
    def _lock_task(task_pk):
        return models.Task.objects.select_for_update().get(pk=task_pk)


class TaskMediaUpload(TaskMediaBase):
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)

    def post(self, request, pk=None, project_pk=None):
        task = self.get_and_check_task(request, pk)
        check_project_perms(request, task.project, perms=("change_project", ))
        

        files = flatten_files(request.FILES)
        if len(files) == 0:
            raise exceptions.ValidationError(detail=_("No files uploaded"))

        chunk_info = None
        chunk_index = request.data.get('dzchunkindex')
        uuid = request.data.get('dzuuid') 
        total_chunk_count = request.data.get('dztotalchunkcount', None)
        if len(files) == 1 and chunk_index is not None and uuid is not None and total_chunk_count is not None:
            byte_offset = request.data.get('dzchunkbyteoffset', 0)
            try:
                chunk_index = int(chunk_index)
                byte_offset = int(byte_offset)
                total_chunk_count = int(total_chunk_count)
            except ValueError:
                raise exceptions.ValidationError(detail="chunkIndex is not an int")
            
            chunk_info = {
                'uuid': re.sub('[^0-9a-zA-Z-]+', "", uuid),
                'chunk_index': chunk_index,
                'byte_offset': byte_offset,
                'total_chunk_count': total_chunk_count,
                'tmp_upload_file': os.path.join(settings.FILE_UPLOAD_TEMP_DIR, f"{uuid}.upload")
            }

        # 50% of the time, raise an exception
        # import random
        # if random.random() < 0.5:
        #     import time
        #     time.sleep(10)
        #     return Response('', status=524)
        #     raise exceptions.ValidationError(detail=_("Random upload failure for testing"))

        uploaded = {}
        for file in files:
            name = file.name
            if name is None:
                continue
            safe_name = sanitize_filename(name)
            ext = os.path.splitext(safe_name)[1].lower()
            if ext not in models.Task.MEDIA_EXTENSIONS:
                continue

            media_dir = task.media_directory_path()
            if not os.path.exists(media_dir):
                os.makedirs(media_dir, exist_ok=True)

            if chunk_info is not None:
                if os.path.isfile(chunk_info['tmp_upload_file']) and chunk_info['chunk_index'] == 0:
                    os.unlink(chunk_info['tmp_upload_file'])
                
                with open(chunk_info['tmp_upload_file'], 'ab') as fd:
                    fd.seek(chunk_info['byte_offset'])
                    if isinstance(file, InMemoryUploadedFile):
                        for chunk in file.chunks():
                            fd.write(chunk)
                    else:
                        with open(file.temporary_file_path(), 'rb') as f:
                            shutil.copyfileobj(f, fd)
                
                if chunk_info['chunk_index'] + 1 < chunk_info['total_chunk_count']:
                    continue # will wait for next chunk

            dst_path = task.media_directory_path(safe_name)

            if chunk_info is not None:
                if chunk_info['tmp_upload_file'] is not None and os.path.isfile(chunk_info['tmp_upload_file']):
                    shutil.move(chunk_info['tmp_upload_file'], dst_path)
            else:
                with open(dst_path, 'wb+') as fd:
                    if isinstance(file, InMemoryUploadedFile):
                        for chunk in file.chunks():
                            fd.write(chunk)
                    else:
                        with open(file.temporary_file_path(), 'rb') as f:
                            shutil.copyfileobj(f, fd)
            
            fsize = os.path.getsize(dst_path)
            if fsize > MAX_MEDIA_FILE_SIZE:
                os.unlink(tmp_path)
                raise exceptions.ValidationError(detail=_("File exceeds maximum allowed size"))
            uploaded[name] = fsize

        if len(uploaded) > 0:
            with transaction.atomic():
                task = self._lock_task(task.pk)
                existing = {e['filename']: e for e in task.media}
                for name in uploaded:
                    fp = os.path.join(media_dir, name)
                    entry = task.build_media_entry(fp)
                    if entry is not None:
                        existing[name] = entry
                entries = list(existing.values())
                entries.sort(key=lambda e: (
                    task.MEDIA_TYPE_ORDER.get(e['type'], 99),
                    e['filename'].lower(),
                ))
                task.media = entries
                task.update_size()
                task.save()

        return Response({'success': True, 'uploaded': uploaded, 'media': task.media}, status=status.HTTP_200_OK)


class TaskMediaManage(TaskMediaBase):
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    def get(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_and_check_task(request, pk)
        if not task.media:
            raise exceptions.NotFound()

        for e in task.media:
            if e['filename'] == filename:
                return Response(e, status=status.HTTP_200_OK)

        raise exceptions.NotFound()

    def patch(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_and_check_task(request, pk)
        check_project_perms(request, task.project, perms=("change_project", ))
        
        with transaction.atomic():
            task = self._lock_task(task.pk)
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
        task = self.get_and_check_task(request, pk)
        check_project_perms(request, task.project, perms=("change_project", ))
        
        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        os.remove(filepath)

        with transaction.atomic():
            task = self._lock_task(task.pk)
            task.media = [e for e in task.media if e['filename'] != filename]
            task.save()

        task.update_size(commit=True)

        return Response({
            'success': True,
            'media': task.media,
        }, status=status.HTTP_200_OK)


class TaskMediaDownload(TaskMediaBase):
    def get(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_and_check_task(request, pk)

        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        content_type = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
        response = FileResponse(open(filepath, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename={filename}'
        response['Content-Length'] = os.path.getsize(filepath)
        return response

class TaskMediaThumbnail(TaskMediaBase):
    def get(self, request, pk=None, project_pk=None, filename=None):
        task = self.get_and_check_task(request, pk)

        media_dir = task.media_directory_path()
        filepath = os.path.join(media_dir, filename)

        try:
            filepath = path_traversal_check(filepath, media_dir)
        except SuspiciousFileOperation:
            raise exceptions.NotFound()

        if not os.path.isfile(filepath):
            raise exceptions.NotFound()

        thumb_size = request.GET.get('size', 256)
        try:
            thumb_size = min(1024, max(1, int(thumb_size)))
        except:
            raise exceptions.ValidationError(detail="Invalid thumb size")
            
        ext = os.path.splitext(filepath)[1].lower()
        print(ext)
        if ext in models.Task.PHOTO_EXTENSIONS:
            try:
                with Image.open(filepath) as im:
                    im.thumbnail((thumb_size, thumb_size))
                    buf = io.BytesIO()
                    fmt = 'JPEG'
                    im.save(buf, format=fmt)
                    buf.seek(0)
                    return FileResponse(buf, content_type='image/jpeg')
            except Exception:
                raise exceptions.ValidationError(detail="Thumbnail not supported for this media type")
        else:
            raise exceptions.ValidationError(detail="Thumbnail not available")