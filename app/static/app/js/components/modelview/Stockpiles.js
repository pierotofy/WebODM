import * as THREE from 'THREE';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

class Stockpiles{
  constructor(viewer){
    this.viewer = viewer;
    this.items = [];
    viewer.addEventListener("update", this.update);
  }

  dispose(){
    this.viewer.removeEventListener("update", this.update);
    this.items.forEach(m => {
      if (m.stockpileState.group) this.viewer.measuringTool.scene.remove(m.stockpileState.group);
      m.stockpileState = null;
    });
    this.items = [];
  }

  components(cols, rows, test){
    const seen = new Uint8Array(cols * rows);
    const list = [];
    for (let i = 0; i < seen.length; i++){
      if (seen[i] || !test(i)) continue;
      const cells = [i];
      seen[i] = 1;
      for (let k = 0; k < cells.length; k++){
        const c = cells[k] % cols, r = (cells[k] - c) / cols;
        for (const [dc, dr] of N4){
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const n = nr * cols + nc;
          if (seen[n] || !test(n)) continue;
          seen[n] = 1;
          cells.push(n);
        }
      }
      list.push(cells);
    }
    return list;
  }

  update = () => {
    const viewer = this.viewer;
    const scene = viewer.scene;
    const now = performance.now();

    this.items = this.items.filter(m => {
      if (scene.measurements.indexOf(m) !== -1) return true;
      if (m.stockpileState.group) viewer.measuringTool.scene.remove(m.stockpileState.group);
      m.stockpileState = null;
      return false;
    });

    for (const m of scene.measurements){
      if (m.kind !== "stockpile") continue;
      if (!m.stockpile) m.stockpile = {mode: "stockpile", base: "ground", limitHeight: false, heightMin: null, heightMax: null, cellSize: null, showVolume: true, showBase: true};
      if (!m.stockpileState){
        m.stockpileState = {key: "", changed: 0, request: null, group: null};
        this.items.push(m);
      }

      const st = m.stockpileState;
      const o = m.stockpile;
      const clouds = scene.pointclouds.filter(pc => pc.visible);
      const heightMin = o.limitHeight && Number.isFinite(o.heightMin) ? o.heightMin : null;
      const heightMax = o.limitHeight && Number.isFinite(o.heightMax) ? o.heightMax : null;
      const key = JSON.stringify([m.points.map(p => p.position.toArray()), o.mode, o.base, heightMin, heightMax, o.cellSize, clouds.length]);

      if (key !== st.key){
        st.key = key;
        st.changed = now;
        st.request = null;
        m.stockpileResult = m.points.length >= 3 ? {state: "pending"} : null;
        m.stockpileNet = null;
      }

      if (st.group){
        st.group.children[0].visible = m.visible && o.showBase;
        st.group.children[1].visible = m.visible && o.showVolume;
      }

      if (st.changed && now - st.changed > 300 && !viewer.inputHandler.drag && !viewer.inputHandler.paused){
        st.changed = 0;
        if (st.group){
          viewer.measuringTool.scene.remove(st.group);
          st.group = null;
        }
        if (m.points.length < 3) continue;

        const verts = m.points.map(p => p.position);
        const n = verts.length;
        let error = null;

        const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
        for (let i = 0; i < n && !error; i++){
          for (let j = i + 2; j < n; j++){
            if (i === 0 && j === n - 1) continue;
            const a = verts[i], b = verts[i + 1], c = verts[j], d = verts[(j + 1) % n];
            if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0){
              error = "intersect";
              break;
            }
          }
        }

        const minX = Math.min(...verts.map(v => v.x)), maxX = Math.max(...verts.map(v => v.x));
        const minY = Math.min(...verts.map(v => v.y)), maxY = Math.max(...verts.map(v => v.y));
        const origin = {x: minX, y: minY, z: verts.reduce((sum, v) => sum + v.z, 0) / n};
        const local = verts.map(v => ({x: v.x - origin.x, y: v.y - origin.y, z: v.z - origin.z}));
        const width = maxX - minX, depth = maxY - minY;

        let cell = Math.max(Math.max(width, depth) / 32, 0.05);
        let limited = false;
        if (o.cellSize > 0){
          cell = Math.max(o.cellSize, 0.05, Math.max(width, depth) / 2048, Math.sqrt(width * depth / 262144));
          while (Math.max(1, Math.round(width / cell)) * Math.max(1, Math.round(depth / cell)) > 262144 ||
                 Math.max(Math.round(width / cell), Math.round(depth / cell)) > 2048) cell *= 1.01;
          limited = cell > o.cellSize;
        }
        const cols = Math.max(1, Math.round(width / cell)), rows = Math.max(1, Math.round(depth / cell));
        const cw = width / cols, cd = depth / rows;

        let area = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) area += local[j].x * local[i].y - local[i].x * local[j].y;
        area = Math.abs(area / 2);

        const footprint = new Uint8Array(cols * rows);
        let cells = 0;
        if (!error && area > 0 && area >= cw * cd){
          for (let r = 0; r < rows; r++){
            for (let c = 0; c < cols; c++){
              const x = (c + 0.5) * cw, y = (r + 0.5) * cd;
              let inside = false;
              for (let i = 0, j = n - 1; i < n; j = i++){
                const a = local[i], b = local[j];
                if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
              }
              if (inside){
                footprint[r * cols + c] = 1;
                cells++;
              }
            }
          }
        }
        if (!error && cells === 0) error = "small";

        let baseAt = null;
        let vertexBase = local.map(v => v.z);
        if (!error && o.base === "lowest"){
          const z = Math.min(...local.map(v => v.z));
          baseAt = () => z;
          vertexBase = local.map(() => z);
        }else if (!error && o.base === "plane"){
          const mx = local.reduce((sum, v) => sum + v.x, 0) / n;
          const my = local.reduce((sum, v) => sum + v.y, 0) / n;
          const mz = local.reduce((sum, v) => sum + v.z, 0) / n;
          let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
          for (const v of local){
            const dx = v.x - mx, dy = v.y - my, dz = v.z - mz;
            sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
          }
          const det = sxx * syy - sxy * sxy;
          if (!(det > 1e-9 * sxx * syy)) error = "base";
          else{
            const a = (sxz * syy - syz * sxy) / det, b = (syz * sxx - sxz * sxy) / det, c = mz - a * mx - b * my;
            baseAt = (x, y) => a * x + b * y + c;
            vertexBase = local.map(v => baseAt(v.x, v.y));
          }
        }else if (!error){
          const triangles = THREE.ShapeUtils.triangulateShape(local.map(v => new THREE.Vector2(v.x, v.y)), []).map(t => t.map(i => local[i]));
          baseAt = (x, y) => {
            let best = -Infinity, z = NaN;
            for (const [a, b, c] of triangles){
              const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
              if (det === 0) continue;
              const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
              const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det;
              const wc = 1 - wa - wb;
              const low = Math.min(wa, wb, wc);
              if (low > best){
                best = low;
                z = wa * a.z + wb * b.z + wc * c.z;
              }
            }
            return z;
          };
        }

        const baseHeights = new Float64Array(cols * rows);
        if (!error){
          for (let r = 0; r < rows; r++){
            for (let c = 0; c < cols; c++) baseHeights[r * cols + c] = baseAt((c + 0.5) * cw, (r + 0.5) * cd);
          }
          if (!baseHeights.every(Number.isFinite)) error = "base";
        }

        const zs = local.map(v => v.z).concat(vertexBase);
        const lo = Math.min(...zs), hi = Math.max(...zs);
        const reach = Math.max(5, 0.5 * Math.max(cols * cw, rows * cd));
        let zMin = o.mode === "excavation" ? lo - reach : lo - 1;
        let zMax = o.mode === "excavation" ? hi + 1 : hi + reach;
        if (heightMin !== null) zMin = heightMin - origin.z;
        if (heightMax !== null) zMax = heightMax - origin.z;
        if (!error && !(zMin < zMax)) error = "window";
        if (!error && clouds.length === 0) error = "nopoints";

        if (error){
          m.stockpileResult = {state: "error", error};
          continue;
        }

        st.request = {
          origin, cols, rows, cw, cd, footprint, cells, baseAt, baseHeights, zMin, zMax, cell, limited,
          count: new Uint32Array(cols * rows),
          max: new Float32Array(cols * rows).fill(NaN), max2: new Float32Array(cols * rows).fill(NaN),
          min: new Float32Array(cols * rows).fill(NaN), min2: new Float32Array(cols * rows).fill(NaN),
          box: {minX, maxX, minY, maxY, minZ: origin.z + zMin, maxZ: origin.z + zMax},
          queue: clouds.map(pc => ({
            pc, node: pc.pcoGeometry.root,
            level: Math.max(Math.ceil(Math.log2(pc.pcoGeometry.spacing) - Math.log2(Math.min(cw, cd) / 4) - 1e-9), 0)
          }))
        };
      }

      const q = st.request;
      if (!q) continue;

      for (let i = 0; i < q.queue.length && performance.now() - now < 12; ){
        const {pc, node, level} = q.queue[i];
        if (!node.loaded){
          node.load();
          i++;
          continue;
        }
        q.queue.splice(i, 1);

        const position = node.geometry && node.geometry.attributes.position;
        if (position){
          const e = pc.matrixWorld.elements;
          const bx = node.boundingBox.min.x, by = node.boundingBox.min.y, bz = node.boundingBox.min.z;
          const array = position.array;
          const w = q.cols * q.cw, d = q.rows * q.cd;

          for (let k = 0; k < array.length; k += 3){
            const px = array[k] + bx, py = array[k + 1] + by, pz = array[k + 2] + bz;
            const x = e[0] * px + e[4] * py + e[8] * pz + e[12] - q.origin.x;
            const y = e[1] * px + e[5] * py + e[9] * pz + e[13] - q.origin.y;
            const z = e[2] * px + e[6] * py + e[10] * pz + e[14] - q.origin.z;
            if (x < 0 || x >= w || y < 0 || y >= d || z < q.zMin || z > q.zMax) continue;

            const cell = Math.min(Math.floor(y / q.cd), q.rows - 1) * q.cols + Math.min(Math.floor(x / q.cw), q.cols - 1);
            if (!q.footprint[cell]) continue;

            if (q.count[cell] === 0){
              q.max[cell] = z;
              q.min[cell] = z;
            }else{
              if (z > q.max[cell]){
                q.max2[cell] = q.max[cell];
                q.max[cell] = z;
              }else if (isNaN(q.max2[cell]) || z > q.max2[cell]) q.max2[cell] = z;

              if (z < q.min[cell]){
                q.min2[cell] = q.min[cell];
                q.min[cell] = z;
              }else if (isNaN(q.min2[cell]) || z < q.min2[cell]) q.min2[cell] = z;
            }
            q.count[cell]++;
          }
        }

        if (node.getLevel() < level){
          for (let k = 0; k < 8; k++){
            const child = node.children[k];
            if (!child) continue;
            const box = child.boundingBox.clone().applyMatrix4(pc.matrixWorld);
            if (box.max.x < q.box.minX || box.min.x > q.box.maxX || box.max.y < q.box.minY || box.min.y > q.box.maxY ||
                box.max.z < q.box.minZ || box.min.z > q.box.maxZ) continue;
            q.queue.push({pc, node: child, level});
          }
        }
      }

      if (q.queue.length > 0) continue;
      st.request = null;

      const { cols, rows, cw, cd, footprint, baseHeights } = q;
      const total = cols * rows;
      const larger = Math.max(cw, cd);
      const sign = o.mode === "excavation" ? -1 : 1;

      const raw = new Float64Array(total).fill(NaN);
      for (let i = 0; i < total; i++){
        if (q.count[i] >= 3) raw[i] = o.mode === "excavation" ? q.min2[i] : q.max2[i];
      }

      const measured = Float64Array.from(raw);
      let covered = 0;
      for (let i = 0; i < total; i++){
        if (isNaN(raw[i])) continue;
        covered++;

        const c = i % cols, r = (i - c) / cols;
        const around = [];
        for (const [dc, dr] of N8){
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || isNaN(raw[nr * cols + nc])) continue;
          around.push(raw[nr * cols + nc]);
        }
        if (around.length === 0) continue;

        around.sort((a, b) => a - b);
        const half = around.length >> 1;
        const median = around.length % 2 === 1 ? around[half] : (around[half - 1] + around[half]) / 2;
        if (sign * (raw[i] - median) > 1.5 * larger) measured[i] = median;
      }

      const steps = new Float64Array(total).fill(Infinity);
      const reached = [];
      for (let i = 0; i < total; i++){
        if (footprint[i] && !isNaN(measured[i])){
          steps[i] = 0;
          reached.push(i);
        }
      }
      for (let k = 0; k < reached.length; k++){
        const c = reached[k] % cols, r = (reached[k] - c) / cols;
        for (const [dc, dr] of N8){
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const j = nr * cols + nc;
          if (!footprint[j] || steps[j] !== Infinity) continue;
          steps[j] = steps[reached[k]] + 1;
          reached.push(j);
        }
      }

      const small = new Uint8Array(total);
      for (const hole of this.components(cols, rows, i => footprint[i] === 1 && isNaN(measured[i]))){
        let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
        for (const i of hole){
          const c = i % cols, r = (i - c) / cols;
          c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
        }
        if (Math.max((c1 - c0 + 1) * cw, (r1 - r0 + 1) * cd) <= 2) hole.forEach(i => { small[i] = 1; });
      }

      const surface = Float64Array.from(measured);
      const fillable = this.components(cols, rows, i => footprint[i] === 1 && isNaN(measured[i]) && (steps[i] * larger <= 1 || (steps[i] === 1 && small[i] === 1)));
      const sweeps = Math.max(1, Math.floor(4e6 / Math.max(fillable.reduce((sum, hole) => sum + hole.length, 0), 1)));
      const slot = new Int32Array(total).fill(-1);

      for (const hole of fillable){
        const size = hole.length;
        const sum = new Float64Array(size), known = new Uint8Array(size), degree = new Uint8Array(size);
        const links = new Int32Array(size * 4).fill(-1);
        let low = Infinity, high = -Infinity, edges = 0;
        let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;

        hole.forEach((i, k) => { slot[i] = k; });
        hole.forEach((i, k) => {
          const c = i % cols, r = (i - c) / cols;
          c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
          let next = k * 4;
          for (const [dc, dr] of N4){
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const j = nr * cols + nc;
            if (!footprint[j] || (slot[j] < 0 && isNaN(measured[j]))) continue;
            degree[k]++;
            if (slot[j] >= 0){
              links[next++] = slot[j];
              continue;
            }
            sum[k] += measured[j];
            known[k]++;
            low = Math.min(low, measured[j]);
            high = Math.max(high, measured[j]);
            edges++;
          }
        });
        hole.forEach(i => { slot[i] = -1; });
        if (edges === 0) continue;

        const span = Math.max(c1 - c0, r1 - r0) + 1;
        const limit = Math.min(4 * span * span, sweeps);
        const tolerance = 1e-6 * Math.max(high - low, Number.EPSILON);
        const values = new Float64Array(size).fill(NaN);
        const order = [];
        for (let k = 0; k < size; k++){
          if (known[k]){
            values[k] = sum[k] / known[k];
            order.push(k);
          }
        }
        for (let p = 0; p < order.length; p++){
          for (let e = order[p] * 4; e < order[p] * 4 + 4 && links[e] >= 0; e++){
            if (isNaN(values[links[e]])){
              values[links[e]] = values[order[p]];
              order.push(links[e]);
            }
          }
        }
        for (let sweep = 0; sweep < limit; sweep++){
          let change = 0;
          for (let k = 0; k < size; k++){
            let v = sum[k];
            for (let e = k * 4; e < k * 4 + 4 && links[e] >= 0; e++) v += values[links[e]];
            v /= degree[k];
            change = Math.max(change, Math.abs(v - values[k]));
            values[k] = v;
          }
          if (change <= tolerance) break;
        }
        hole.forEach((i, k) => { surface[i] = values[k]; });
      }

      const gaps = this.components(cols, rows, i => footprint[i] === 1 && isNaN(surface[i]));

      let cut = 0, fill = 0, maxDelta = 0, top = -Infinity;
      for (let i = 0; i < total; i++){
        if (isNaN(surface[i])) continue;
        const delta = surface[i] - baseHeights[i];
        if (delta > 0) cut += delta;
        else fill -= delta;
        maxDelta = Math.max(maxDelta, Math.abs(delta));
        top = Math.max(top, surface[i]);
      }
      cut *= cw * cd;
      fill *= cw * cd;

      m.stockpileResult = {
        state: "done", cut, fill, net: cut - fill, maxDelta,
        coverage: covered / q.cells,
        gaps: gaps.length,
        gapArea: gaps.reduce((sum, hole) => sum + hole.length, 0) * cw * cd,
        cell: q.cell, limited: q.limited
      };
      m.stockpileNet = cut - fill;
      m.stockpileAltitude = top === -Infinity ? null : q.origin.z + top + 0.5;

      const stride = Math.max(1, Math.ceil(Math.sqrt(q.cells / 20000)));
      const basePositions = [], positions = [], colors = [];
      for (let r = 0; r < rows; r += stride){
        for (let c = 0; c < cols; c += stride){
          const i = r * cols + c;
          if (!footprint[i]) continue;

          const x0 = c * cw, x1 = Math.min(cols, c + stride) * cw, y0 = r * cd, y1 = Math.min(rows, r + stride) * cd;
          const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
          corners.forEach((p, k) => {
            const n = corners[(k + 1) % 4];
            basePositions.push(p[0], p[1], q.baseAt(p[0], p[1]), n[0], n[1], q.baseAt(n[0], n[1]));
          });

          if (isNaN(surface[i])) continue;
          const delta = surface[i] - baseHeights[i];
          let color = [0.2, 0.25, 0.33];
          if (Math.abs(delta) > 0.05){
            const t = maxDelta > 0 ? Math.min(1, Math.abs(delta) / maxDelta) : 1;
            const from = delta > 0 ? [1, 0.72, 0.2] : [0.35, 0.9, 1];
            const to = delta > 0 ? [0.86, 0.1, 0.1] : [0.1, 0.25, 0.9];
            color = from.map((v, k) => v + (to[k] - v) * t);
          }
          corners.forEach((p, k) => {
            const n = corners[(k + 1) % 4];
            positions.push(p[0], p[1], surface[i], n[0], n[1], surface[i], p[0], p[1], baseHeights[i], p[0], p[1], surface[i]);
            colors.push(...color, ...color, ...color, ...color);
          });
        }
      }

      const baseGeometry = new THREE.BufferGeometry();
      baseGeometry.setAttribute("position", new THREE.Float32BufferAttribute(basePositions, 3));
      const volumeGeometry = new THREE.BufferGeometry();
      volumeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      volumeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

      st.group = new THREE.Group();
      st.group.position.set(q.origin.x, q.origin.y, q.origin.z);
      st.group.add(new THREE.LineSegments(baseGeometry, new THREE.LineBasicMaterial({color: 0xb4c4d4, transparent: true, opacity: 0.6, depthTest: false})));
      st.group.add(new THREE.LineSegments(volumeGeometry, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.9, depthTest: false})));
      st.group.children[0].visible = m.visible && o.showBase;
      st.group.children[1].visible = m.visible && o.showVolume;
      viewer.measuringTool.scene.add(st.group);
    }
  }
}

export default Stockpiles;
