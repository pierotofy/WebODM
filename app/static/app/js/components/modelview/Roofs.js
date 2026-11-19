import * as THREE from 'THREE';

class Roofs{
  constructor(viewer){
    this.viewer = viewer;
    this.dragged = null;

    viewer.addEventListener("update", this.update);
  }

  dispose(){
    this.viewer.removeEventListener("update", this.update);
  }

  update = () => {
    const viewer = this.viewer;
    const faces = viewer.scene.measurements.filter(m => m.kind === "roof");
    const drag = viewer.inputHandler.drag;
    const held = drag && drag.object && drag.object.parent && drag.object.parent.kind === "roof" ? {face: drag.object.parent, index: drag.object.parent.spheres.indexOf(drag.object)} : null;
    const camera = viewer.scene.getActiveCamera();
    const height = viewer.renderer.domElement.clientHeight;

    for (const item of [this.dragged, held]){
      if (!item || item.index < 0 || item.index >= item.face.points.length) continue;

      const point = item.face.points[item.index].position;
      const others = faces.filter(m => m !== item.face && m.points.length >= 2);
      let best = null;
      let distance = camera.isPerspectiveCamera ?
        10 * 2 * camera.position.distanceTo(point) * Math.tan(camera.fov * Math.PI / 360) / height :
        10 * (camera.top - camera.bottom) / camera.zoom / height;

      for (const other of others){
        for (const p of other.points){
          if (p.position.distanceTo(point) <= distance){
            distance = p.position.distanceTo(point);
            best = p.position.clone();
          }
        }
      }

      if (!best){
        for (const other of others){
          other.points.forEach((p, i) => {
            const onEdge = new THREE.Line3(p.position, other.points[(i + 1) % other.points.length].position).closestPointToPoint(point, true, new THREE.Vector3());
            if (onEdge.distanceTo(point) <= distance){
              distance = onEdge.distanceTo(point);
              best = onEdge;
            }
          });
        }
      }

      if (best && best.distanceTo(point) > 1e-6) item.face.setPosition(item.index, best);
    }
    this.dragged = held;

    for (const face of faces){
      if (face.open && !(held && held.face === face) && !(viewer.inputHandler.paused && viewer.inputHandler.paused.parent === face)){
        face.open = false;
        face.showDistances = true;
        face.showArea = true;
      }

      if (face.points.length < 3){
        face.roof = null;
        continue;
      }

      const points = face.points.map(p => p.position);
      let x = 0, y = 0, z = 0;
      points.forEach((p, i) => {
        const n = points[(i + 1) % points.length];
        x += (p.y - n.y) * (p.z + n.z);
        y += (p.z - n.z) * (p.x + n.x);
        z += (p.x - n.x) * (p.y + n.y);
      });
      face.roof = {slope: Math.abs(z) > 1e-9 ? Math.hypot(x, y) / Math.abs(z) : Infinity};
    }
  }
}

export default Roofs;
