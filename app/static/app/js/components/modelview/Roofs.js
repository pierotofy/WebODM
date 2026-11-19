import * as THREE from 'THREE';
import { _, interpolate } from '../../classes/gettext';

const AROUND = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

class Roofs{
  constructor(viewer, onInsert){
    this.viewer = viewer;
    this.onInsert = onInsert;
    this.active = false;
    this.manual = null;
    this.dragged = null;
    this.updated = 0;

    viewer.addEventListener("update", this.update);
    viewer.renderer.domElement.addEventListener("mousedown", this.handleMouseDown, true);
    viewer.renderer.domElement.addEventListener("mouseup", this.handleMouseUp, true);
  }

  dispose(){
    this.stop();
    this.viewer.removeEventListener("update", this.update);
    this.viewer.renderer.domElement.removeEventListener("mousedown", this.handleMouseDown, true);
    this.viewer.renderer.domElement.removeEventListener("mouseup", this.handleMouseUp, true);
  }

  start(){
    this.active = true;
    this.manual = null;
    this.viewer.renderer.domElement.style.cursor = "crosshair";
  }

  stop(){
    if (this.manual && this.manual.points.length < 3) this.viewer.scene.removeMeasurement(this.manual);
    this.manual = null;
    this.active = false;
    this.viewer.renderer.domElement.style.cursor = "";
  }

  reach(point){
    const camera = this.viewer.scene.getActiveCamera();
    const height = this.viewer.renderer.domElement.clientHeight;
    if (camera.isPerspectiveCamera) return 10 * 2 * camera.position.distanceTo(point) * Math.tan(camera.fov * Math.PI / 360) / height;
    return 10 * (camera.top - camera.bottom) / camera.zoom / height;
  }

  snap(point, face, tolerance){
    let best = null, distance = tolerance;
    const others = this.viewer.scene.measurements.filter(m => m.kind === "roof" && m !== face && m.points.length >= 2);

    for (const other of others){
      for (const p of other.points){
        if (p.position.distanceTo(point) <= distance){
          distance = p.position.distanceTo(point);
          best = p.position.clone();
        }
      }
    }
    if (best) return best;

    for (const other of others){
      other.points.forEach((p, i) => {
        if (!other.closed && i === other.points.length - 1) return;
        const onEdge = new THREE.Line3(p.position, other.points[(i + 1) % other.points.length].position).closestPointToPoint(point, true, new THREE.Vector3());
        if (onEdge.distanceTo(point) <= distance){
          distance = onEdge.distanceTo(point);
          best = onEdge;
        }
      });
    }
    return best;
  }

  plane(points, cx, cy, cz){
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (let i = 0; i < points.length; i += 3){
      const x = points[i] - cx, y = points[i + 1] - cy, z = points[i + 2] - cz;
      xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
    }
    const trace = xx + yy + zz;
    let n = [0.3, 0.2, 1];
    for (let i = 0; i < 60; i++){
      const x = (trace - xx) * n[0] - xy * n[1] - xz * n[2];
      const y = -xy * n[0] + (trace - yy) * n[1] - yz * n[2];
      const z = -xz * n[0] - yz * n[1] + (trace - zz) * n[2];
      const length = Math.hypot(x, y, z) || 1;
      n = [x / length, y / length, z / length];
    }
    return n[2] < 0 ? [-n[0], -n[1], -n[2]] : n;
  }

  detect(origin){
    const reach = 40;
    const cloud = [];
    for (const pointcloud of this.viewer.scene.pointclouds){
      if (!pointcloud.visible) continue;
      for (const node of pointcloud.visibleNodes){
        const attribute = node.geometryNode.geometry && node.geometryNode.geometry.attributes.position;
        if (!attribute || !node.sceneNode) continue;
        const e = node.sceneNode.matrixWorld.elements;
        const array = attribute.array;
        for (let i = 0; i < array.length; i += 3){
          const x = e[0] * array[i] + e[4] * array[i + 1] + e[8] * array[i + 2] + e[12] - origin.x;
          const y = e[1] * array[i] + e[5] * array[i + 1] + e[9] * array[i + 2] + e[13] - origin.y;
          if (x < -reach || x >= reach || y < -reach || y >= reach) continue;
          cloud.push(x, y, e[2] * array[i] + e[6] * array[i + 1] + e[10] * array[i + 2] + e[14] - origin.z);
        }
      }
    }

    let seed = [];
    let radius = 0.3;
    for (; radius <= 3 && seed.length < 36; radius *= 1.5){
      seed = [];
      for (let i = 0; i < cloud.length; i += 3){
        if (cloud[i] * cloud[i] + cloud[i + 1] * cloud[i + 1] + cloud[i + 2] * cloud[i + 2] <= radius * radius) seed.push(cloud[i], cloud[i + 1], cloud[i + 2]);
      }
    }
    if (seed.length < 18) return null;

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < seed.length; i += 3){ cx += seed[i]; cy += seed[i + 1]; cz += seed[i + 2]; }
    cx /= seed.length / 3; cy /= seed.length / 3; cz /= seed.length / 3;
    let normal = this.plane(seed, cx, cy, cz);
    if (normal[2] < 0.2) return null;

    const spacing = Math.sqrt(Math.PI * (radius / 1.5) * (radius / 1.5) / (seed.length / 3));
    const cell = Math.min(Math.max(2 * spacing, 0.1), 1);
    const need = Math.max(1, Math.floor(0.25 * (cell / spacing) * (cell / spacing)));
    let tolerance = 0.15;
    const size = Math.ceil(2 * reach / cell);
    const start = Math.floor(reach / cell) * size + Math.floor(reach / cell);
    let region = null;

    for (let pass = 0; pass < 3; pass++){
      const inside = new Uint16Array(size * size), beside = new Uint16Array(size * size);
      for (let i = 0; i < cloud.length; i += 3){
        const distance = Math.abs(normal[0] * (cloud[i] - cx) + normal[1] * (cloud[i + 1] - cy) + normal[2] * (cloud[i + 2] - cz));
        const k = Math.floor((cloud[i + 1] + reach) / cell) * size + Math.floor((cloud[i] + reach) / cell);
        if (distance <= tolerance) inside[k]++;
        else if (distance <= 3 * tolerance) beside[k]++;
      }

      let first = start;
      if (!(inside[first] >= need && inside[first] >= beside[first])){
        first = -1;
        for (const [dc, dr] of AROUND){
          const k = start + dr * size + dc;
          if (inside[k] >= need && inside[k] >= beside[k]) first = k;
        }
        if (first < 0) return null;
      }

      region = new Uint8Array(size * size);
      const queue = [first];
      region[first] = 1;
      for (let q = 0; q < queue.length; q++){
        const c = queue[q] % size, r = (queue[q] - c) / size;
        for (let d = 0; d < 8; d += 2){
          const nc = c + AROUND[d][0], nr = r + AROUND[d][1];
          if (nc < 0 || nc >= size || nr < 0 || nr >= size) continue;
          const k = nr * size + nc;
          if (region[k] || !(inside[k] >= need && inside[k] >= beside[k])) continue;
          region[k] = 1;
          queue.push(k);
        }
      }
      if (queue.length < 4) return null;

      const kept = [];
      let spread = 0;
      for (let i = 0; i < cloud.length; i += 3){
        const k = Math.floor((cloud[i + 1] + reach) / cell) * size + Math.floor((cloud[i] + reach) / cell);
        if (!region[k]) continue;
        const distance = normal[0] * (cloud[i] - cx) + normal[1] * (cloud[i + 1] - cy) + normal[2] * (cloud[i + 2] - cz);
        if (Math.abs(distance) > tolerance) continue;
        kept.push(cloud[i], cloud[i + 1], cloud[i + 2]);
        spread += distance * distance;
      }
      if (pass > 0) tolerance = Math.min(Math.max(2.5 * Math.sqrt(spread / (kept.length / 3)), 0.05), 0.15);
      cx = 0; cy = 0; cz = 0;
      for (let i = 0; i < kept.length; i += 3){ cx += kept[i]; cy += kept[i + 1]; cz += kept[i + 2]; }
      cx /= kept.length / 3; cy /= kept.length / 3; cz /= kept.length / 3;
      normal = this.plane(kept, cx, cy, cz);
      if (normal[2] < 0.2) return null;
    }

    let begin = 0;
    while (!region[begin]) begin++;
    const outline = [];
    let current = begin, heading = 0;
    for (let step = 0; step < 4 * size * size; step++){
      outline.push([(current % size + 0.5) * cell - reach, (Math.floor(current / size) + 0.5) * cell - reach]);
      let next = -1;
      for (let turn = 0; turn < 8; turn++){
        const d = (heading + 5 + turn) % 8;
        const c = current % size + AROUND[d][0], r = Math.floor(current / size) + AROUND[d][1];
        if (c < 0 || c >= size || r < 0 || r >= size || !region[r * size + c]) continue;
        next = r * size + c;
        heading = d;
        break;
      }
      if (next < 0 || (next === begin && step > 0)) break;
      current = next;
    }
    if (outline.length < 3) return null;

    let far = 0;
    outline.forEach((p, i) => { if (Math.hypot(p[0] - outline[0][0], p[1] - outline[0][1]) > Math.hypot(outline[far][0] - outline[0][0], outline[far][1] - outline[0][1])) far = i; });

    let corners = [];
    for (let slack = 1.2 * cell; ; slack *= 1.5){
      const keep = new Uint8Array(outline.length + 1);
      keep[0] = keep[far] = keep[outline.length] = 1;
      const stack = [[0, far], [far, outline.length]];
      while (stack.length){
        const [a, b] = stack.pop();
        const pa = outline[a], pb = outline[b % outline.length];
        const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
        let worst = 0, index = -1;
        for (let i = a + 1; i < b; i++){
          const distance = Math.abs((pb[0] - pa[0]) * (pa[1] - outline[i][1]) - (pa[0] - outline[i][0]) * (pb[1] - pa[1])) / length;
          if (distance > worst){ worst = distance; index = i; }
        }
        if (worst > slack){
          keep[index] = 1;
          stack.push([a, index], [index, b]);
        }
      }
      corners = outline.filter((p, i) => keep[i]);
      if (corners.length <= 12) break;
    }
    for (let i = 0; corners.length > 3 && i < corners.length; ){
      const before = corners[(i + corners.length - 1) % corners.length], p = corners[i], after = corners[(i + 1) % corners.length];
      const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      if (Math.abs((after[0] - before[0]) * (before[1] - p[1]) - (before[0] - p[0]) * (after[1] - before[1])) / length < 1.5 * cell){
        corners.splice(i, 1);
        i = 0;
      }else i++;
    }
    if (corners.length < 3) return null;

    return corners.map(p => new THREE.Vector3(origin.x + p[0], origin.y + p[1], origin.z + cz - (normal[0] * (p[0] - cx) + normal[1] * (p[1] - cy)) / normal[2]));
  }

  handleMouseDown = (e) => {
    this.down = {x: e.clientX, y: e.clientY, busy: !!this.viewer.inputHandler.drag};
  }

  handleMouseUp = (e) => {
    if (!this.active || !this.down) return;
    const viewer = this.viewer;

    if (this.down.busy){
      this.stop();
      return;
    }
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4) return;
    if (e.button === 2){
      this.stop();
      return;
    }
    if (e.button !== 0 || (viewer.inputHandler.drag && viewer.inputHandler.drag.object)) return;

    const hit = Potree.Utils.getMousePointCloudIntersection(viewer.inputHandler.mouse, viewer.scene.getActiveCamera(), viewer, viewer.scene.pointclouds, {pickClipped: true});
    if (!hit) return;

    let corners = [this.snap(hit.location, this.manual, this.reach(hit.location)) || hit.location];
    if (!e.shiftKey){
      this.manual = null;
      corners = this.detect(hit.location);
      if (!corners) return;
      corners = corners.map(p => this.snap(p, null, 0.5) || p).filter((p, i, list) => p.distanceTo(list[(i + 1) % list.length]) > 0.01);
      if (corners.length < 3) return;
    }

    if (!e.shiftKey || !this.manual){
      const face = new Potree.Measure();
      face.closed = true;
      face.showDistances = true;
      face.showArea = true;
      face.kind = "roof";
      face.name = interpolate(_("Roof face %(num)s"), {num: viewer.scene.measurements.filter(m => m.kind === "roof").length + 1});
      corners.forEach(p => face.addMarker(p));
      viewer.scene.addMeasurement(face);
      if (e.shiftKey) this.manual = face;
      this.onInsert(face);
    }else this.manual.addMarker(corners[0]);
  }

  update = () => {
    const drag = this.viewer.inputHandler.drag;
    const held = drag && drag.object && drag.object.parent && drag.object.parent.kind === "roof" ? drag.object : null;
    if (held) this.dragged = {face: held.parent, index: held.parent.spheres.indexOf(held)};
    if (this.dragged && this.dragged.index >= 0 && this.dragged.index < this.dragged.face.points.length){
      const position = this.dragged.face.points[this.dragged.index].position;
      const snapped = this.snap(position, this.dragged.face, this.reach(position));
      if (snapped && snapped.distanceTo(position) > 0) this.dragged.face.setPosition(this.dragged.index, snapped);
    }
    if (!held) this.dragged = null;

    const now = performance.now();
    if (now - this.updated < 300) return;
    this.updated = now;

    const faces = this.viewer.scene.measurements.filter(m => m.kind === "roof" && m.points.length >= 3);
    const names = {ridge: _("Ridge"), hip: _("Hip"), valley: _("Valley"), rake: _("Rake"), eave: _("Eave")};

    for (const face of faces){
      const points = face.points.map(p => p.position);
      const count = points.length;
      const normal = new THREE.Vector3();
      const centre = new THREE.Vector3();
      points.forEach((p, i) => {
        const n = points[(i + 1) % count];
        normal.x += (p.y - n.y) * (p.z + n.z);
        normal.y += (p.z - n.z) * (p.x + n.x);
        normal.z += (p.x - n.x) * (p.y + n.y);
        centre.add(p);
      });
      centre.divideScalar(count);
      normal.normalize();
      if (normal.z < 0) normal.negate();

      const flat = Math.hypot(normal.x, normal.y);
      const slope = normal.z > 1e-6 ? flat / normal.z : Infinity;
      const middle = (Math.min(...points.map(p => p.z)) + Math.max(...points.map(p => p.z))) / 2;

      face.roof = {
        area: face.getArea(), slope, normal, centre,
        edges: points.map((a, i) => {
          const b = points[(i + 1) % count];
          const length = a.distanceTo(b);
          const run = Math.hypot(b.x - a.x, b.y - a.y);
          let type = "rake";

          if (slope < 0.03) type = "eave";
          else if (Math.abs(a.z - b.z) < 0.1 * length) type = (a.z + b.z) / 2 > middle ? "ridge" : "eave";
          else if (Math.abs((b.x - a.x) * normal.x + (b.y - a.y) * normal.y) < 0.94 * run * flat){
            const low = a.z < b.z ? a : b, high = a.z < b.z ? b : a;
            const other = a.z < b.z ? points[(i + count - 1) % count] : points[(i + 2) % count];
            type = (high.x - low.x) * (other.x - low.x) + (high.y - low.y) * (other.y - low.y) > 0 ? "hip" : "valley";
          }
          return {a, b, length, type, shared: false, label: names[type]};
        })
      };
    }

    const links = faces.map(() => []);
    faces.forEach((face, i) => {
      for (let j = i + 1; j < faces.length; j++){
        const other = faces[j];
        for (const e1 of face.roof.edges){
          for (const e2 of other.roof.edges){
            const short = e1.length <= e2.length ? e1 : e2, long = e1.length <= e2.length ? e2 : e1;
            const line = new THREE.Line3(long.a, long.b);
            if (line.closestPointToPoint(short.a, true, new THREE.Vector3()).distanceTo(short.a) > 0.1 ||
                line.closestPointToPoint(short.b, true, new THREE.Vector3()).distanceTo(short.b) > 0.1) continue;

            if (links[i].indexOf(j) === -1){
              links[i].push(j);
              links[j].push(i);
            }

            let type = "ridge";
            if (Math.abs(long.a.z - long.b.z) >= 0.1 * long.length){
              const mid = long.a.clone().add(long.b).multiplyScalar(0.5);
              type = other.roof.normal.dot(face.roof.centre.clone().sub(mid)) < 0 ? "hip" : "valley";
            }
            e1.type = e2.type = type;
            e1.label = e2.label = names[type];
            long.shared = true;
            short.shared = "skip";
          }
        }
      }
    });

    faces.forEach((face, i) => {
      const group = [i];
      for (let k = 0; k < group.length; k++){
        links[group[k]].forEach(j => { if (group.indexOf(j) === -1) group.push(j); });
      }

      const totals = {faces: group.length, area: 0, ridge: 0, hip: 0, valley: 0, rake: 0, eave: 0};
      const pitches = {};
      group.forEach(j => {
        const roof = faces[j].roof;
        totals.area += roof.area;
        const pitch = Math.round(roof.slope * 12);
        pitches[pitch] = (pitches[pitch] || 0) + roof.area;
        roof.edges.forEach(e => { if (e.shared !== "skip") totals[e.type] += e.length; });
      });
      totals.pitch = +Object.keys(pitches).sort((a, b) => pitches[b] - pitches[a])[0];
      face.roof.totals = totals;
    });
  }
}

export default Roofs;
