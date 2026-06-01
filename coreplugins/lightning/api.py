import os
import logging
from app.models import Task
from app.plugins.views import TaskView
from rest_framework.response import Response
from rest_framework import exceptions, serializers

logger = logging.getLogger('app.logger')


def get_resources(task, assets, customAssets):
    print(assets, customAssets)
    if assets not in ["all", "backup", "custom"]:
        raise exceptions.ValidationError({"assets": "Invalid"})
    if assets == "custom":
        INCLUDE_ALWAYS = ["cameras.json", "shots.geojson", "ground_control_points.geojson"]
        if not isinstance(customAssets, list):
            raise exceptions.ValidationError({"customAssets": "Invalid"})
        
        if len(customAssets) > 0:
            customAssets = list(set(customAssets) | set(INCLUDE_ALWAYS))
    else:
        customAssets = []
    
    resources = []
    if assets == "all":
        resources.append(task.assets_path())
    elif assets == "backup":
        resources.append(task.task_path())
    elif assets == "custom":
        for asset in customAssets:
            file = task.get_asset_download_path(asset)
            if os.path.isfile(file):
                resources.append(file)

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

class GetTaskSize(TaskView):
    def post(self, request, pk):
        task = self.get_and_check_task(request, pk)
        serializer = TaskSizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resources = get_resources(task, serializer['assets'].value, serializer['customAssets'].value)

        return Response({'size': get_size_bytes(resources)})


