from django.core.management.base import BaseCommand
from app.grids import sync_grids_to_proj, watch_grids

class Command(BaseCommand):
    requires_system_checks = []
    help = "Sync PROJ grid files from the media directory to the PROJ data directory"

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true", default=False,
                            help="After syncing, keep running and sync again whenever a worker downloads new grids")
        parser.add_argument("--interval", type=float, default=5.0,
                            help="Seconds between checks when using --watch (default: 5)")

    def handle(self, **options):
        sync_grids_to_proj()
        if options["watch"]:
            watch_grids(options["interval"])
