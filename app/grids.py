import logging
import os
import shutil
import time
import pyproj
from pyproj import CRS
from pyproj.transformer import TransformerGroup
from webodm import settings

proj_data_dir = os.getenv("PROJ_LIB", "/usr/share/proj")
pyproj.datadir.set_data_dir(proj_data_dir)
logger = logging.getLogger('app.logger')

def sync_grids_to_proj():
    # We store grid files in the media directory
    # and then hard link them to the proj directory
    # so that they don't need re-downloading and become
    # available for all tools
    if not os.path.isdir(settings.MEDIA_GRIDS):
        return

    for name in os.listdir(settings.MEDIA_GRIDS):
        src = os.path.join(settings.MEDIA_GRIDS, name)
        dst = os.path.join(proj_data_dir, name)

        if not os.path.isfile(src):
            continue
        if os.path.exists(dst):
            continue

        try:
            try:
                os.link(src, dst)
            except OSError:
                # Hard links can fail across filesystems
                shutil.copyfile(src, dst)
        except Exception as e:
            logger.warning(f"Cannot sync grid {src} to {dst}: {str(e)}")


def check_download_grid_for(task, max_retries=7):
    try:
        if task.epsg is not None:
            crs = CRS.from_epsg(task.epsg)
        elif task.wkt is not None:
            crs = CRS.from_wkt(task.wkt)
        else:
            return
        
        tg = TransformerGroup("EPSG:4326", crs, always_xy=True)
        if len(tg.unavailable_operations) > 0:
            if not os.path.isdir(settings.MEDIA_GRIDS):
                os.makedirs(settings.MEDIA_GRIDS, exist_ok=True)
            
            retry = 0
            while True:
                try:
                    tg.download_grids(directory=settings.MEDIA_GRIDS, verbose=True)
                    break
                except PermissionError:
                    raise
                except Exception as e:
                    retry += 1
                    if retry > max_retries:
                        raise e
                    logger.warning(f"Cannot download grids ({str(e)}), retrying... ({retry}/{max_retries})")
                    time.sleep(retry * 10)

        sync_grids_to_proj()
    except Exception as e:
        logger.warning(f"Cannot check/download grid for {str(task)}: {str(e)}")
