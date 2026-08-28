from django.core.management.base import BaseCommand
from app.grids import sync_grids_to_proj

class Command(BaseCommand):
    requires_system_checks = []
    help = "Sync PROJ grid files from the media directory to the PROJ data directory"

    def handle(self, **options):
        sync_grids_to_proj()
