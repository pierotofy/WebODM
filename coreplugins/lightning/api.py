import os
import logging
from app.models import Task
from app.plugins.views import TaskView
from app.plugins.worker import run_function_async
from rest_framework.response import Response
from rest_framework import exceptions, serializers, status

logger = logging.getLogger('app.logger')


def get_resources(task, assets, custom_assets):
    if assets not in ["all", "backup", "custom"]:
        raise exceptions.ValidationError({"assets": "Invalid"})
    if assets == "custom":
        INCLUDE_ALWAYS = ["cameras.json", "shots.geojson", "ground_control_points.geojson"]
        if not isinstance(custom_assets, list):
            raise exceptions.ValidationError({"custom_assets": "Invalid"})
        
        if len(custom_assets) > 0:
            custom_assets = list(set(custom_assets) | set(INCLUDE_ALWAYS))
    else:
        custom_assets = []
    
    resources = []
    if assets == "all":
        resources.append(task.assets_path())
    elif assets == "backup":
        resources.append(task.task_path())
    elif assets == "custom":
        for asset in custom_assets:
            file = task.get_asset_download_path(asset)
            if os.path.isfile(file):
                resources.append(file)
            
            # Include EPT folder if available
            if asset == "georeferenced_model.laz":
                ept_dir = task.assets_path("entwine_pointcloud")
                if os.path.isdir(ept_dir):
                    resources.append(ept_dir)
            
            # Include entire texturing folder (GLB + OBJ)
            if asset == "textured_model.zip":
                tex_dir = task.assets_path("odm_texturing")
                if os.path.isdir(tex_dir):
                    resources.append(tex_dir)

    return resources

def get_size_bytes(resources):
    total_bytes = 0

    for res in resources:
        try:
            if os.path.isdir(res):
                for dirpath, _, filenames in os.walk(res):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        if not os.path.islink(fp):
                            total_bytes += os.path.getsize(fp)
            elif os.path.isfile(res):
                total_bytes += os.path.getsize(res)
        except Exception as e:
            logger.warn("Cannot get size: {}".format(str(e)))

    return total_bytes

class TaskSizeSerializer(serializers.Serializer):
    assets = serializers.CharField(help_text="One of: [all,backup,custom]")
    customAssets = serializers.JSONField(help_text="List of custom assets", default=[])

class ShareTaskSerializer(TaskSizeSerializer):
    project = serializers.CharField(help_text="Remote project ID or empty", default="", allow_blank=True)
    cloudUrl = serializers.CharField(help_text="Cloud URL or empty", default="")
    cloudToken = serializers.CharField(help_text="Cloud token or empty", default="")
    
class GetTaskSize(TaskView):
    def post(self, request, pk):
        task = self.get_and_check_task(request, pk)
        serializer = TaskSizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resources = get_resources(task, serializer['assets'].value, serializer['customAssets'].value)

        return Response({'size': get_size_bytes(resources)})

def share_task(project, cloud_token, cloud_url, resources):
    return "http://192.168.2.253:8000"

class ShareTask(TaskView):
    def post(self, request, pk):
        task = self.get_and_check_task(request, pk)
        serializer = ShareTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resources = get_resources(task, serializer['assets'].value, serializer['customAssets'].value)

        try:
            project = int(serializer['project'].value) if serializer['project'].value != "" else None
        except ValueError:
            project = None
        
        cloud_token = serializer['cloudToken'].value
        cloud_url = serializer['cloudUrl'].value
        
        if not cloud_token:
            raise exceptions.ValidationError({"cloudToken": "Missing parameter"})
        if not cloud_url:
            raise exceptions.ValidationError({"cloudUrl": "Missing parameter"})
        
        try: 
            celery_task_id = run_function_async(share_task, project=project, cloud_token=cloud_token, cloud_url=cloud_url, resources=resources).task_id
            return Response({'celery_task_id': celery_task_id}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_200_OK)

