from app.plugins import MountPoint
from app.plugins import PluginBase

from .api import TaskColmapExport

class Plugin(PluginBase):
    def api_mount_points(self):
        return [
            MountPoint('task/(?P<pk>[^/.]+)/colmap$', TaskColmapExport.as_view()),
        ]
