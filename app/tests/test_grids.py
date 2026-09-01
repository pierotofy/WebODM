import os
import shutil
import tempfile

import pyproj
from pyproj import CRS
from django.contrib.auth.models import User

from app.models import Project, Task
from app import grids
from webodm import settings
from .classes import BootTestCase


class TestGrids(BootTestCase):
    def setUp(self):
        pass

    def tearDown(self):
        pass

    def test_grids(self):
        user = User.objects.get(username="testuser")
        project = Project.objects.create(owner=user, name="test grids")

        OSGB_GRID = "uk_os_OSTN15_NTv2_OSGBtoETRS.tif"
        proj_dir = pyproj.datadir.get_data_dir()

        self.assertEqual(proj_dir, os.getenv("PROJ_LIB", "/usr/share/proj"))

        # Make sure the grid file is not present before starting
        g = os.path.join(proj_dir, OSGB_GRID)
        if os.path.isfile(g):
            os.unlink(g)

        if os.path.isdir(settings.MEDIA_GRIDS):
            shutil.rmtree(settings.MEDIA_GRIDS)

        # Create a new task in the database with a WKT for UTM zone 16N
        task = Task.objects.create(project=project, name="UTM", wkt=CRS.from_epsg(32616).to_wkt())

        # Calling check_download_grid_for should not download any new grid
        grids.check_download_grid_for(task)
        self.assertFalse(os.path.isdir(settings.MEDIA_GRIDS))
        self.assertFalse(os.path.isfile(os.path.join(proj_dir, OSGB_GRID)))

        # Create another task with an EPSG of 27700 which requires a grid
        task = Task.objects.create(project=project, name="OSGB", epsg=27700)

        # Calling check_download_grid_for should download the grid
        # in PROJ_LIB and MEDIA_GRIDS
        grids.check_download_grid_for(task, max_retries=5)
        self.assertTrue(os.path.isfile(os.path.join(settings.MEDIA_GRIDS, OSGB_GRID)))
        self.assertTrue(os.path.isfile(os.path.join(proj_dir, OSGB_GRID)))

        # After removing the grid from PROJ_LIB,
        # calling sync_grids_to_proj should restore it
        os.unlink(os.path.join(proj_dir, OSGB_GRID))
        grids.sync_grids_to_proj()
        self.assertTrue(os.path.isfile(os.path.join(proj_dir, OSGB_GRID)))

        # After removing the grid from both PROJ_LIB and MEDIA_GRIDS,
        # calling sync_grids_to_proj should NOT restore it
        os.unlink(os.path.join(proj_dir, OSGB_GRID))
        os.unlink(os.path.join(settings.MEDIA_GRIDS, OSGB_GRID))
        grids.sync_grids_to_proj()
        self.assertFalse(os.path.isfile(os.path.join(proj_dir, OSGB_GRID)))

        
