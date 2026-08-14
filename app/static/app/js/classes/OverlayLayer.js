import React from 'react';
import ReactDOM from 'ReactDOM';
import { _, interpolate } from './gettext';
import { colors, nextColorKey } from './OverlayColors';
import OverlayFeaturePopup from '../components/OverlayFeaturePopup';

let overlayId = 0;

export function addOverlayLayer(file, cb) {
  let maxSize = 100 * 1024 * 1024;

  if (file && file.size > maxSize) {
    let err = {};
    err.message = interpolate(_("%(file)s is bigger than %(size)s MB."), { file: file.name, size: parseInt(maxSize / 1024 / 1024) });
    cb(err);
  } else {
    let reader = new FileReader();
    reader.onload = function () {
      try {
        let geojson = JSON.parse(reader.result);
        addLayer(geojson);
      } catch (err) {
        err.message = interpolate(_("Not a proper JSON file: %(file)s"), { file: file.name });
        cb(err);
      }
    }
    reader.readAsText(file);
  }

  let addLayer = (_geojson) => {
    cb(null, buildOverlay(_geojson, file.name), _geojson);
  }
}

// Layers bound from AutoCAD external references are named
// XrefName$N$LayerName; display just the layer name part
const layerDisplayName = (name) => {
  const m = name.match(/^.+\$\d+\$(.+)$/);
  return m ? m[1] : name;
};

const childStyle = (child) => {
  const color = colors[child.colorKey].color;
  const opacity = child.parent.opacity / 100;
  return {
    color,
    fillColor: color,
    opacity: opacity,
    fillOpacity: opacity * 0.2
  };
};

export function buildOverlay(geojson, filename, opts = {}) {
  const entry = {
    id: ++overlayId,
    name: filename.replace(/\.[^/.]+$/, ""),
    loading: false,
    progress: 0,
    converting: false,
    opacity: opts.opacity !== undefined ? opts.opacity : 100,
    visible: opts.visible !== false,
    bounds: null,
    children: []
  };

  // Group features by their CAD "Layer" property (e.g. DXF conversions),
  // otherwise create a single sublayer with all features
  const features = geojson.features || [];
  const hasLayerProp = features.some(f => f.properties && f.properties.Layer !== undefined && f.properties.Layer !== null);

  let groups = {};
  if (hasLayerProp) {
    features.forEach(f => {
      const layerName = (f.properties && f.properties.Layer !== undefined && f.properties.Layer !== null) ? String(f.properties.Layer) : "0";
      (groups[layerName] = groups[layerName] || []).push(f);
    });
  } else {
    groups[entry.name] = null;
  }

  const hidden = opts.hidden || [];
  Object.keys(groups).sort().forEach(layerName => {
    const savedColor = opts.colors !== undefined ? opts.colors[layerName] : undefined;
    const child = {
      name: layerName,
      displayName: layerDisplayName(layerName),
      colorKey: colors[savedColor] !== undefined ? savedColor : nextColorKey(),
      visible: hidden.indexOf(layerName) === -1,
      parent: entry
    };
    const childGeojson = groups[layerName] !== null ? { type: "FeatureCollection", features: groups[layerName] } : geojson;

    child.layer = L.geoJson(childGeojson, {
      style: () => childStyle(child),
      //for point layers
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, Object.assign({ radius: 6 }, childStyle(child)));
      },
      onEachFeature: (feature, layer) => {
        let root = null;
        const lazyrender = () => {
          if (!root) root = document.createElement("div");
          ReactDOM.render(<OverlayFeaturePopup child={child}
            feature={feature}
            onColorChange={colorKey => updateOverlayColor(child, colorKey)} />, root);
          return root;
        };
        layer.bindPopup(L.popup({
          lazyrender,
          maxHeight: 300,
          minWidth: 220
        }));
      }
    });
    child.layer.options.bounds = child.layer.getBounds();
    entry.children.push(child);
  });

  recomputeOverlayBounds(entry);

  return entry;
}

export function recomputeOverlayBounds(entry) {
  const bounds = L.latLngBounds();
  entry.children.forEach(c => {
    if (c.layer.options.bounds.isValid()) bounds.extend(c.layer.options.bounds);
  });
  entry.bounds = bounds;
}

export function updateOverlayColor(child, colorKey) {
  child.colorKey = colorKey;
  const color = colors[colorKey].color;
  child.layer.setStyle({ color, fillColor: color });
  child.layer.fire('overlay:stylechanged');
  if (child.parent.onSync) child.parent.onSync(child.parent);
}

export function updateOverlayOpacity(entry, opacity) {
  entry.opacity = opacity;
  entry.children.forEach(child => {
    child.layer.setStyle({ opacity: opacity / 100, fillOpacity: (opacity / 100) * 0.2 });
    child.layer.fire('overlay:stylechanged');
  });
  if (entry.onSync) entry.onSync(entry);
}
