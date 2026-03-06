import os
import shutil

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient
from app import pending_actions

import worker
from app.models import Project
from app.models import Task
from app.tests.classes import BootTransactionTestCase
from app.tests.utils import clear_test_media_root
from nodeodm import status_codes
from webodm import settings


TEST_RSULTS_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)),
    "..", "..", "nodeodm", "external", "NodeODM", "tests", "processing_results"
)

def orthophoto_path():
    return os.path.join(TEST_RSULTS_DIR, "odm_orthophoto", "odm_orthophoto.tif")

def dsm_path():
    return os.path.join(TEST_RSULTS_DIR, "odm_dem", "dsm.tif")

def dtm_path():
    return os.path.join(TEST_RSULTS_DIR, "odm_dem", "dtm.tif")

def laz_path():
    return os.path.join(TEST_RSULTS_DIR, "odm_georeferencing", "odm_georeferenced_model.laz")

def glb_path():
    return os.path.join(TEST_RSULTS_DIR, "odm_texturing", "odm_textured_model_geo.glb")


class TestApiTaskExternalImport(BootTransactionTestCase):
    def setUp(self):
        super().setUp()
        clear_test_media_root()


    def test_external_task_import(self):
        client = APIClient()
        client.login(username="testuser", password="test1234")

        user = User.objects.get(username="testuser")
        another_user = User.objects.get(username="testuser2")
        self.assertFalse(user.is_superuser)

        project = Project.objects.create(
            owner=user,
            name="test external import"
        )
        another_project = Project.objects.create(
            owner=user,
            name="another project"
        )

        # Test endpoint security
        res = client.post("/api/projects/{}/tasks/import/external/init".format(another_project.id))
        self.assertTrue(res.status_code, status.HTTP_404_NOT_FOUND)
        res = client.post("/api/projects/{}/tasks/import/external/upload".format(another_project.id))
        self.assertTrue(res.status_code, status.HTTP_404_NOT_FOUND)
        res = client.post("/api/projects/{}/tasks/import/external/commit".format(another_project.id))
        self.assertTrue(res.status_code, status.HTTP_404_NOT_FOUND)

        # Import with file upload method
        assets = {
            'orthophoto': orthophoto_path(),
            'dsm': dsm_path(),
            'dtm': dtm_path(),
            'pointcloud': laz_path(),
            'texturedmodel': glb_path(),
        }

        dest_assets = {
            'orthophoto': "orthophoto.tif",
            'dsm': "dsm.tif",
            'dtm': "dtm.tif",
            'pointcloud': "georeferenced_model.laz",
            'texturedmodel': "textured_model.glb",
        }

        swap_param = {
            'orthophoto': ('dsm', True),
            'dsm': ('pointcloud', False),
            'dtm': ('pointcloud', False),
            'pointcloud': ('texturedmodel', False),
            'texturedmodel': ('pointcloud', False),
        }

        for test_asset_swap in [False, True]:
            for asset_type in assets:
                asset_file = assets[asset_type]
                upload_file = open(asset_file, 'rb')

                res = client.post("/api/projects/{}/tasks/import/external/init".format(project.id))
                self.assertTrue(res.status_code, status.HTTP_200_OK)
                uuid = res.data['uuid']
                self.assertTrue(uuid, str)

                # Try to upload wrong asset type
                res = client.post("/api/projects/{}/tasks/import/external/upload".format(project.id), {
                    "uuid": uuid,
                    "file": [upload_file]
                }, format="multipart")
                self.assertTrue(res.status_code, status.HTTP_400_BAD_REQUEST)
                upload_file.seek(0)

                # Try invalid UUIDs
                for invalid_uuid in ["invalid", "62b5f00b-c225-4779-b7e2-b666ff2b97f6", ""]:
                    res = client.post("/api/projects/{}/tasks/import/external/upload".format(project.id), {
                        "uuid": invalid_uuid,
                        asset_type: [upload_file]
                    }, format="multipart")
                    self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                    upload_file.seek(0)

                # Test file validation by swapping parameters
                if test_asset_swap:
                    asset_type_swapped, valid = swap_param[asset_type]
                    res = client.post("/api/projects/{}/tasks/import/external/upload".format(project.id), {
                        'uuid': uuid,
                        asset_type_swapped: [upload_file]
                    }, format="multipart")
                    upload_file.seek(0)

                    if valid:
                        # Extension matches, but will fail later
                        self.assertEqual(res.status_code, status.HTTP_200_OK)
                    else:
                        # Extension does not match
                        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                    
                    # Commit should fail validation
                    res = client.post("/api/projects/{}/tasks/import/external/commit".format(project.id), {
                        "uuid": uuid,
                    })
                    self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

                    # Skip rest of checks
                    continue

                # Valid asset type
                res = client.post("/api/projects/{}/tasks/import/external/upload".format(project.id), {
                    'uuid': uuid,
                    asset_type: [upload_file]
                }, format="multipart")
                self.assertEqual(res.status_code, status.HTTP_200_OK)

                # Verify file has been uploaded
                dest_asset = dest_assets[asset_type]
                uploaded_asset_file = os.path.join(settings.FILE_UPLOAD_TEMP_DIR, f"external-import-{uuid}", dest_asset)
                self.assertTrue(os.path.isfile(uploaded_asset_file))
                upload_file.close()

                self.assertTrue(res.data['uploaded'])
                self.assertTrue(res.data['done'])
                self.assertEqual(res.data['asset'], dest_asset)
                
                # Try commit with invalid UUID
                for invalid_uuid in ["invalid", "62b5f00b-c225-4779-b7e2-b666ff2b97f6", ""]:
                    res = client.post("/api/projects/{}/tasks/import/external/commit".format(project.id), {
                        "uuid": invalid_uuid,
                    })
                    self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

                # Valid commit
                res = client.post("/api/projects/{}/tasks/import/external/commit".format(project.id), {
                    "uuid": uuid,
                })
                self.assertEqual(res.status_code, status.HTTP_201_CREATED)

                # Properties are OK
                self.assertTrue(isinstance(res.data['id'], str))
                self.assertEqual(res.data['import_url'], "file://external")
                self.assertEqual(res.data['status'], status_codes.RUNNING)
                self.assertEqual(res.data['pending_action'], pending_actions.IMPORT)

                # Process
                worker.tasks.process_pending_tasks()
                
                # Task has completed import
                task = Task.objects.get(pk=res.data['id'])
                self.assertEqual(task.status, status_codes.COMPLETED)
                self.assertIsNone(task.pending_action)
                
                # Task assets are where they should be
                task_asset = task.get_asset_download_path(dest_asset)
                self.assertTrue(os.path.isfile(task_asset))

                # Uploaded file was moved
                self.assertFalse(os.path.isfile(uploaded_asset_file))

                # Tmp folder was deleted
                self.assertFalse(os.path.isdir(os.path.dirname(uploaded_asset_file)))

                # Parent of tmp folder is still there (just checking...)
                self.assertTrue(os.path.isdir(os.path.abspath(os.path.join(os.path.dirname(uploaded_asset_file), ".."))))
            
        # Cannot commit without uploading anything
        res = client.post("/api/projects/{}/tasks/import/external/init".format(project.id))
        self.assertTrue(res.status_code, status.HTTP_200_OK)
        uuid = res.data['uuid']
        self.assertTrue(uuid, str)

        res = client.post("/api/projects/{}/tasks/import/external/commit".format(project.id), {
            'uuid': uuid
        })
        self.assertTrue(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(uuid, str)


        