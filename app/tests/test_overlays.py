import os
import gzip
import json
import time
import shutil
import zipfile
import tempfile
import subprocess

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient

from app.models import Project, Task
from app.tests.classes import BootTestCase
from webodm import settings


class TestOverlays(BootTestCase):
    def setUp(self):
        pass
    def tearDown(self):
        pass

    def test_overlays(self):
        user = User.objects.get(username="testuser")
        project = Project.objects.create(owner=user, name="overlay test")
        task = Task.objects.create(project=project)
        client = APIClient()
        client.login(username="testuser", password="test1234")

        other_client = APIClient()
        other_client.login(username="testuser2", password="test1234")

        anonymous_client = APIClient()

        # GET overlays/stamp
        res = client.get("/api/projects/{}/tasks/{}/overlays/stamp".format(project.id, task.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(abs(res.json()['stamp'] - time.time() * 1000) < 60000)

        # Generate a test GeoJSON with a single polygon feature (3 points)
        geojson = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [
                [[-91.99, 46.84], [-91.98, 46.85], [-91.97, 46.84], [-91.99, 46.84]]
            ]}}
        ]}

        if not os.path.exists(settings.MEDIA_TMP):
            os.mkdir(settings.MEDIA_TMP)
        tmpdir = tempfile.mkdtemp('_overlays', dir=settings.MEDIA_TMP)

        geojson_file = os.path.join(tmpdir, "test.geojson")
        with open(geojson_file, "w") as f:
            json.dump(geojson, f)

        ogr2ogr = shutil.which("ogr2ogr")
        self.assertIsNotNone(ogr2ogr)

        # Convert the GeoJSON to DXF (using ogr2ogr)
        dxf_file = os.path.join(tmpdir, "test.dxf")
        self.assertEqual(subprocess.run([ogr2ogr, dxf_file, geojson_file]).returncode, 0)

        # Convert the GeoJSON to Shapefile (using ogr2ogr)
        shp_file = os.path.join(tmpdir, "test.shp")
        self.assertEqual(subprocess.run([ogr2ogr, "-f", "ESRI Shapefile", shp_file, geojson_file]).returncode, 0)

        zip_file = os.path.join(tmpdir, "test.zip")
        with zipfile.ZipFile(zip_file, "w") as z:
            for ext in ("shp", "shx", "dbf", "prj"):
                z.write(os.path.join(tmpdir, "test." + ext), "test." + ext)

        def convert(c, filepath, epsg=None):
            with open(filepath, "rb") as f:
                data = {"file": f}
                if epsg is not None:
                    data["epsg"] = epsg
                return c.post("/api/projects/{}/tasks/{}/overlays/convert".format(project.id, task.id), data)

        # Test overlays/convert endpoint DXF and Shapefile
        # The result should be the same as the original GeoJSON
        for res in [convert(client, dxf_file, 4326), convert(client, zip_file)]:
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            result = res.json()
            self.assertEqual(result["type"], "FeatureCollection")
            self.assertEqual(len(result["features"]), 1)
            geom = result["features"][0]["geometry"]
            self.assertEqual(geom["type"], "Polygon")
            self.assertEqual(geom["coordinates"], geojson["features"][0]["geometry"]["coordinates"])

        # Test overlays/convert endpoint should be accessible to both logged and non-logged in users
        task.public = True
        task.save()

        self.assertEqual(convert(other_client, dxf_file, 4326).status_code, status.HTTP_200_OK)
        self.assertEqual(convert(anonymous_client, dxf_file, 4326).status_code, status.HTTP_200_OK)

        # Add a point feature (and additional layer)
        geojson["features"][0]["properties"] = {"Layer": "A"}
        geojson["features"].append({"type": "Feature", "properties": {"Layer": "B"}, "geometry": {"type": "Point", "coordinates": [-91.98, 46.84]}})
        self.assertEqual(len(geojson["features"]), 2)

        # GET overlays/sync
        overlay_file = os.path.join(tmpdir, "t$es%t.geojson")
        with open(overlay_file, "w") as f:
            json.dump(geojson, f)

        with open(overlay_file, "rb") as f:
            res = client.post("/api/projects/{}/tasks/{}/overlays/sync".format(project.id, task.id), {
                "file": f,
                "name": "t$es%t",
                "meta": json.dumps({"opacity": 100})
            })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["id"], "test")
        self.assertTrue(os.path.isfile(task.overlays_path("test.geojson.gz")))
        self.assertTrue(os.path.isfile(task.overlays_path("test.json")))

        # Verify that the task size has been updated after adding an overlay
        task.refresh_from_db()
        self.assertTrue(task.size > 0)

        # GET overlays/test.geojson endpoint
        overlay_url = "/api/projects/{}/tasks/{}/overlays/test.geojson".format(project.id, task.id)

        def get_overlay_geojson(**kwargs):
            res = client.get(overlay_url, **kwargs)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            if 'HTTP_ACCEPT_ENCODING' in kwargs:
                self.assertEqual(res.get("Content-Encoding"), "gzip")
            body = b"".join(res.streaming_content) if res.streaming else res.content
            if res.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            return json.loads(body)

        self.assertEqual(get_overlay_geojson(HTTP_ACCEPT_ENCODING="gzip"), geojson)
        self.assertEqual(get_overlay_geojson(), geojson)

        # PATCH overlays/test.geojson
        # Update meta
        stamp = int(time.time() * 1000) + 1000
        res = client.patch(overlay_url, json.dumps({
            "stamp": stamp,
            "name": "renamed",
            "meta": {"opacity": 50}
        }), content_type="application/json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()["updated"])

        with open(task.overlays_path("test.json")) as f:
            sidecar = json.load(f)
        self.assertEqual(sidecar["name"], "renamed")
        self.assertEqual(sidecar["meta"], {"opacity": 50})

        # PATCH overlays/test.geojson
        # Remove layer
        res = client.patch(overlay_url, json.dumps({
            "stamp": stamp + 1000,
            "removeLayer": "A"
        }), content_type="application/json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()["updated"])

        result = get_overlay_geojson(HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(len(result["features"]), 1)
        self.assertEqual(result["features"][0]["properties"]["Layer"], "B")

        # DELETE overlays/test.geojson with other_client should fail
        res = other_client.delete(overlay_url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(os.path.isfile(task.overlays_path("test.json")))
        self.assertTrue(os.path.isfile(task.overlays_path("test.geojson.gz")))

        # DELETE overlays/test.geojson with anonymous_client should fail
        res = anonymous_client.delete(overlay_url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # DELETE overlays/test.geojson with client should succeed
        task.refresh_from_db()
        size_before_delete = task.size
        res = client.delete(overlay_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        # After successful deletion, the sidecar, .gz files and overlays directory should have been removed
        self.assertFalse(os.path.isfile(task.overlays_path("test.json")))
        self.assertFalse(os.path.isfile(task.overlays_path("test.geojson.gz")))
        self.assertFalse(os.path.isdir(task.overlays_path()))

        # Verify that the task size has been updated after removing an overlay
        task.refresh_from_db()
        self.assertTrue(task.size < size_before_delete)

        shutil.rmtree(tmpdir)