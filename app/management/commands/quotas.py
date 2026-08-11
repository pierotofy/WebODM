from django.core.management.base import BaseCommand
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce

from app.models import Profile

class Command(BaseCommand):
    help = 'Print profiles that have a storage quota'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--top', type=int, required=False, help='Limit output to the top N profiles by used quota')
        super(Command, self).add_arguments(parser)

    def handle(self, **options):
        top = options.get('top')
        if top is not None and top <= 0:
            print('--top must be a positive integer')
            return

        profiles = Profile.objects.filter(quota__gt=-1) \
                                  .select_related('user') \
                                  .annotate(used=Coalesce(Sum('user__project__task__size'), Value(0.0))) \
                                  .order_by('-used')
        if top is not None:
            profiles = profiles[:top]

        for p in profiles:
            used = p.used
            percentage = (used / p.quota * 100) if p.quota > 0 else 0
            print(f"{p.id} - {p.user} - {used / 1000:.2f}/{p.quota / 1000:.2f} GB - {percentage:.1f}%")
