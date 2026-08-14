from app.plugins import PluginBase, Menu, MountPoint
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Sum
from django.utils.translation import gettext as _
from guardian.shortcuts import get_objects_for_user

from app.models import Project, Task

# Page size is fixed (not user-configurable) to keep the endpoint predictable and cache-friendly.
PAGE_SIZE = 20

# Whitelist of columns that can be used for sorting, mapped to their corresponding
# Task queryset field. This avoids exposing arbitrary/internal field names to clients.
ORDER_FIELDS = {
    'project': 'project__name',
    'owner': 'project__owner__username',
    'task': 'name',
    'status': 'status',
    'images': 'images_count',
    'size': 'size',
}
DEFAULT_ORDER_FIELD = 'project'


class Plugin(PluginBase):
    def main_menu(self):
        return [Menu(_("Task Manager"), self.public_url(""), "fa fa-hdd fa-fw")]

    def app_mount_points(self):
        @login_required
        def index_view(request):
            return render(request, self.template_path("index.html"), {
                'title': _("Task Manager")
            })

        @login_required
        def tasks_view(request):
            ordering = request.GET.get('ordering', DEFAULT_ORDER_FIELD)
            descending = ordering.startswith('-')
            field_key = ordering[1:] if descending else ordering
            order_field = ORDER_FIELDS.get(field_key, ORDER_FIELDS[DEFAULT_ORDER_FIELD])
            if descending:
                order_field = '-' + order_field

            viewable_projects = get_objects_for_user(request.user, 'view_project', Project,
                                                      accept_global_perms=False)
            deletable_project_ids = set(get_objects_for_user(request.user, 'delete_project', viewable_projects,
                                                               accept_global_perms=False)
                                         .values_list('id', flat=True))

            tasks = Task.objects.filter(project__in=viewable_projects) \
                .select_related('project', 'project__owner') \
                .order_by(order_field, 'id')

            total_size = tasks.aggregate(total=Sum('size'))['total'] or 0

            paginator = Paginator(tasks, PAGE_SIZE)
            page = paginator.get_page(request.GET.get('page', 1))

            results = []
            for task in page.object_list:
                project = task.project
                owner = project.owner
                can_delete = project.id in deletable_project_ids
                can_compact = can_delete and task.status == 40 and not task.compacted

                results.append({
                    'task_id': task.id,
                    'task_name': task.name,
                    'status': task.status,
                    'images_count': task.images_count,
                    'size': task.size,
                    'compacted': task.compacted,
                    'project_id': project.id,
                    'project_name': project.name,
                    'owner_name': owner.get_full_name() or owner.username,
                    'can_delete': can_delete,
                    'can_compact': can_compact,
                })

            return JsonResponse({
                'count': paginator.count,
                'page': page.number,
                'num_pages': paginator.num_pages,
                'page_size': PAGE_SIZE,
                'total_size': total_size,
                'results': results,
            })

        return [
            MountPoint('$', index_view),
            MountPoint('tasks$', tasks_view),
            # more mount points here ...
        ]

    def include_js_files(self):
        return ['main.js']

    def include_css_files(self):
        return ['style.css']

