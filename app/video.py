import subprocess
import numpy as np
import logging

logger = logging.getLogger('app.logger')

def extract_jpeg_bytes_from_video(video_path, width=256, timestamp="00:00:01", quality=4):
    command = [
        'ffmpeg',
        '-ss', timestamp,
        '-i', video_path,
        '-vf', f'scale={width}:-1',
        '-frames:v', '1',
        '-f', 'image2',
        '-vcodec', 'mjpeg',
        '-q:v', str(quality), # Quality scale (1-31)
        '-loglevel', 'quiet',
        'pipe:1', # output to stdout
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    try:
        outbytes, err = process.communicate(timeout=15)
    except Exception as e:
        process.kill()
        outbytes, err = process.communicate()
        logger.warning(f"Error: ffmpeg error while reading {video_path}: {str(e)}")
        return None

    if not outbytes:
        return None
    
    return outbytes
