import React from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'THREE';
import '../../css/modelview/Panel.scss';
import { _, interpolate } from '../../classes/gettext';

class ProjectPanel extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired,
    hasCameras: PropTypes.bool.isRequired,
    camerasVisible: PropTypes.bool.isRequired,
    onToggleCameras: PropTypes.func.isRequired,
    onCameraScaleChange: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      selected: null,
      tab: "properties",
      cameraScale: 1,
      search: "",
      sorted: false,
      closed: {},
      renaming: null,
      menu: null,
      exportOpen: false,
      recording: false
    };
  }

  componentDidMount(){
    this.refreshInterval = setInterval(() => this.forceUpdate(), 500);
    document.addEventListener("click", this.closeMenus);
  }

  componentWillUnmount(){
    clearInterval(this.refreshInterval);
    document.removeEventListener("click", this.closeMenus);
  }

  closeMenus = () => {
    if (this.state.menu || this.state.exportOpen) this.setState({menu: null, exportOpen: false});
  }

  fmt = (n) => {
    return Potree.Utils.addCommas(n.toFixed(3));
  }

  remove = (item) => {
    const { scene } = this.props.viewer;
    if (item.type === "measure") scene.removeMeasurement(item.obj);
    else if (item.type === "volume") scene.removeVolume(item.obj);
    else if (item.type === "profile") scene.removeProfile(item.obj);
    else if (item.type === "animation") scene.removeCameraAnimation(item.obj);
    else scene.removeAnnotation(item.obj);
    if (this.state.selected === item.obj) this.setState({selected: null});
  }

  zoomTo = (item) => {
    const { viewer } = this.props;

    if (item.type === "annotation" && item.obj.hasView()){
      item.obj.moveHere(viewer.scene.getActiveCamera());
      return;
    }

    let box;
    if (item.type === "measure") box = new THREE.Box3().setFromPoints(item.obj.points.map(p => p.position));
    else if (item.type === "profile") box = new THREE.Box3().setFromPoints(item.obj.points);
    else if (item.type === "animation") box = new THREE.Box3().setFromPoints(item.obj.controlPoints.map(cp => cp.position));
    else if (item.type === "annotation") box = new THREE.Box3().setFromPoints([item.obj.position]);
    else box = item.obj.boundingBox.clone().applyMatrix4(item.obj.matrixWorld);

    if (box.isEmpty()) return;
    if (box.getSize(new THREE.Vector3()).length() === 0) box.expandByScalar(5);

    const node = new THREE.Object3D();
    node.boundingBox = box;
    viewer.zoomTo(node, 2, 500);
  }

  setVisible = (item, visible) => {
    if (item.type === "animation") item.obj.setVisible(visible);
    else item.obj.visible = visible;
  }

  download = (filename, text) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], {type: "application/octet-stream"}));
    link.download = filename;
    link.click();
  }

  folder = (id, label, items, canDelete) => {
    const open = !this.state.closed[id];
    const anyVisible = items.some(item => item.obj.visible);

    return (<div key={id} className="mv-tree-row mv-tree-folder"
                 onClick={() => this.setState({closed: Object.assign({}, this.state.closed, {[id]: open})})}>
      <i className={"fa fa-fw " + (open ? "fa-caret-down" : "fa-caret-right")}></i>
      <i className="far fa-folder fa-fw"></i>
      <span className="mv-tree-label">{label}</span>
      {canDelete && items.length > 0 ? [
      <button key="delete" type="button" className="mv-panel-btn mv-danger" title={_("Delete all")}
              onClick={e => {
                e.stopPropagation();
                if (window.confirm(_("Are you sure you want to delete all items in this folder?"))){
                  items.forEach(this.remove);
                }
              }}><i className="fa fa-trash"></i></button>,
      <button key="eye" type="button" className="mv-panel-btn" title={anyVisible ? _("Hide") : _("Show")}
              onClick={e => {
                e.stopPropagation();
                items.forEach(item => this.setVisible(item, !anyVisible));
                this.forceUpdate();
              }}><i className={anyVisible ? "far fa-eye" : "far fa-eye-slash"}></i></button>
      ] : ""}
    </div>);
  }

  itemRow = (item) => {
    const { selected, renaming } = this.state;

    return (<div key={item.obj.uuid}
         className={"mv-tree-row mv-tree-child " + (selected === item.obj ? "selected" : "")}
         onClick={() => this.setState({selected: selected === item.obj ? null : item.obj, tab: "properties"})}
         onDoubleClick={() => this.zoomTo(item)}
         onContextMenu={e => {
           e.preventDefault();
           e.stopPropagation();
           const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
           this.setState({menu: {item, x: e.clientX - rect.left, y: e.clientY - rect.top}});
         }}>
      <i className={item.icon}></i>
      {renaming === item.obj ?
      <input type="text" className="mv-tree-rename" autoFocus defaultValue={item.obj[item.nameKey]}
             onClick={e => e.stopPropagation()}
             onBlur={e => { item.obj[item.nameKey] = e.target.value || item.obj[item.nameKey]; this.setState({renaming: null}); }}
             onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); }} />
      : <span className="mv-tree-label">{item.obj[item.nameKey]}</span>}
      {selected === item.obj ?
      <button type="button" className="mv-panel-btn mv-danger" title={_("Delete")}
              onClick={e => { e.stopPropagation(); this.remove(item); }}><i className="fa fa-trash"></i></button>
      : ""}
      <button type="button" className="mv-panel-btn" title={item.obj.visible ? _("Hide") : _("Show")}
              onClick={e => { e.stopPropagation(); this.setVisible(item, !item.obj.visible); this.forceUpdate(); }}>
        <i className={item.obj.visible ? "far fa-eye" : "far fa-eye-slash"}></i>
      </button>
    </div>);
  }

  render(){
    const { viewer } = this.props;
    const { selected, tab, cameraScale, search, sorted, closed, menu, exportOpen, recording } = this.state;
    const scene = viewer.scene;
    const pc = scene.pointclouds[0];

    let measures = scene.measurements.map(obj => {
      let icon = "mv-icon mv-icon-distance";
      if (obj.kind === "deltas") icon = "mv-icon mv-icon-deltas";
      else if (obj.kind === "ground") icon = "mv-icon mv-icon-ground";
      else if (obj.kind === "perpendicular") icon = "mv-icon mv-icon-perpendicular";
      else if (obj.kind === "area-plane") icon = "mv-icon mv-icon-areaplane";
      else if (obj.showAngles) icon = "mv-icon mv-icon-angle";
      else if (obj.showCoordinates) icon = "mv-icon mv-icon-point";
      else if (obj.showCircle) icon = "mv-icon mv-icon-circle";
      else if (obj.showAzimuth) icon = "mv-icon mv-icon-azimuth";
      else if (obj.showHeight) icon = "mv-icon mv-icon-height";
      else if (obj.showArea) icon = "mv-icon mv-icon-area";
      return {obj, type: "measure", icon, nameKey: "name"};
    }).concat(
      scene.volumes.map(obj => ({obj, type: "volume", icon: obj.clip ? "mv-icon mv-icon-clipbox" : "mv-icon mv-icon-volume", nameKey: "name"})),
      scene.profiles.map(obj => ({obj, type: "profile", icon: "mv-icon mv-icon-profile", nameKey: "name"})),
      scene.cameraAnimations.map(obj => ({obj, type: "animation", icon: "mv-icon mv-icon-video", nameKey: "name"}))
    );
    let annotations = scene.annotations.descendants().map(obj => ({obj, type: "annotation", icon: obj.hasView() ? "mv-icon mv-icon-pov" : "mv-icon mv-icon-annotation", nameKey: "title"}));

    if (search){
      const matches = item => String(item.obj[item.nameKey]).toLowerCase().indexOf(search.toLowerCase()) !== -1;
      measures = measures.filter(matches);
      annotations = annotations.filter(matches);
    }
    if (sorted){
      const byName = (a, b) => String(a.obj[a.nameKey]).localeCompare(String(b.obj[b.nameKey]));
      measures.sort(byName);
      annotations.sort(byName);
    }

    const selectedItem = measures.concat(annotations).find(item => item.obj === selected);

    const conv = viewer.lengthUnitDisplay.unitspermeter / viewer.lengthUnit.unitspermeter;
    const unit = viewer.lengthUnitDisplay.code;
    const properties = [];
    let points = [];

    if (selectedItem && selectedItem.type === "measure"){
      const m = selectedItem.obj;
      points = m.points.map(p => p.position);

      if (m.kind === "deltas" && points.length === 2){
        properties.push(["ΔX", `${this.fmt((points[1].x - points[0].x) * conv)} ${unit}`]);
        properties.push(["ΔY", `${this.fmt((points[1].y - points[0].y) * conv)} ${unit}`]);
        properties.push(["ΔZ", `${this.fmt((points[1].z - points[0].z) * conv)} ${unit}`]);
      }
      if (m.kind === "ground" && points.length > 1){
        let ground = 0;
        for (let i = 1; i < points.length; i++) ground += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        properties.push([_("Ground distance"), `${this.fmt(ground * conv)} ${unit}`]);
      }
      if (m.kind === "perpendicular" && points.length === 3) properties.push([_("Perpendicular distance"), `${this.fmt(m.getPerpendicularDistance() * conv)} ${unit}`]);
      if (m.showDistances && m.kind !== "ground" && points.length > 1) properties.push([_("Total distance"), `${this.fmt(m.getTotalDistance() * conv)} ${unit}`]);
      if (m.showArea && m.kind === "area-plane" && points.length > 2) properties.push([_("Horizontal area"), `${this.fmt(m.getHorizontalArea() * conv * conv)} ${unit}²`]);
      if (m.showArea && m.kind !== "area-plane" && points.length > 2) properties.push([_("Area"), `${this.fmt(m.getArea() * conv * conv)} ${unit}²`]);
      if (m.showHeight && m.kind !== "deltas" && points.length > 1){
        const zs = points.map(p => p.z);
        properties.push([_("Height"), `${this.fmt((Math.max(...zs) - Math.min(...zs)) * conv)} ${unit}`]);
      }
      if (m.showAngles && points.length > 2){
        points.forEach((p, i) => properties.push([interpolate(_("Angle %(num)s"), {num: i + 1}), `${this.fmt(m.getAngle(i) * (180.0 / Math.PI))}°`]));
      }
      if (m.showCircle && points.length === 3){
        const radius = Potree.Utils.computeCircleCenter(points[0], points[1], points[2]).distanceTo(points[0]);
        properties.push([_("Radius"), `${this.fmt(radius * conv)} ${unit}`]);
        properties.push([_("Circumference"), `${this.fmt(2 * Math.PI * radius * conv)} ${unit}`]);
      }
      if (m.showAzimuth && points.length === 2){
        const azimuth = (Math.atan2(points[1].x - points[0].x, points[1].y - points[0].y) * (180.0 / Math.PI) + 360) % 360;
        properties.push([_("Azimuth"), `${this.fmt(azimuth)}°`]);
      }
    }else if (selectedItem && selectedItem.type === "volume"){
      properties.push([_("Volume"), `${this.fmt(selectedItem.obj.getVolume() * conv * conv * conv)} ${unit}³`]);
    }else if (selectedItem && selectedItem.type === "profile"){
      points = selectedItem.obj.points;
    }else if (selectedItem && selectedItem.type === "animation"){
      points = selectedItem.obj.controlPoints.map(cp => cp.position);
    }else if (selectedItem && selectedItem.type === "annotation"){
      points = [selectedItem.obj.position];
    }

    let pointCloudProperties = "";
    if (selected === "pointcloud" && pc){
      const material = pc.material;
      const attributes = pc.pcoGeometry.pointAttributes.attributes.map(a => a.name)
                           .filter(name => ["POSITION_CARTESIAN", "position"].indexOf(name) === -1)
                           .concat(["elevation"]);
      const box = pc.pcoGeometry.tightBoundingBox || pc.boundingBox;
      const zMin = box.min.z + pc.position.z;
      const zMax = box.max.z + pc.position.z;
      const elevation = material.elevationRange;
      const intensity = material.intensityRange;

      pointCloudProperties = (<div className="mv-panel-properties">
        <div className="mv-panel-tabs">
          <div className="mv-panel-tab active">{_("Properties")}</div>
        </div>
        <div className="mv-panel-field">
          <label>{_("Attribute")}</label>
          <select value={material.activeAttributeName}
                  onChange={e => { material.activeAttributeName = e.target.value; this.forceUpdate(); }}>
            {attributes.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {material.activeAttributeName === "elevation" ? [
        <div key="gradient" className="mv-panel-field">
          <label>{_("Gradient")}</label>
          <select value={Object.keys(Potree.Gradients).find(k => Potree.Gradients[k] === material.gradient) || ""}
                  onChange={e => { material.gradient = Potree.Gradients[e.target.value]; this.forceUpdate(); }}>
            {Object.keys(Potree.Gradients).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>,
        <div key="min" className="mv-panel-field">
          <label>{interpolate(_("Min (%(value)s)"), {value: this.fmt(elevation[0] * conv)})}</label>
          <input type="range" min={zMin} max={zMax} step={(zMax - zMin) / 200} value={elevation[0]}
                 onChange={e => { material.elevationRange = [Math.min(parseFloat(e.target.value), elevation[1]), elevation[1]]; this.forceUpdate(); }} />
        </div>,
        <div key="max" className="mv-panel-field">
          <label>{interpolate(_("Max (%(value)s)"), {value: this.fmt(elevation[1] * conv)})}</label>
          <input type="range" min={zMin} max={zMax} step={(zMax - zMin) / 200} value={elevation[1]}
                 onChange={e => { material.elevationRange = [elevation[0], Math.max(parseFloat(e.target.value), elevation[0])]; this.forceUpdate(); }} />
        </div>] : ""}

        {material.activeAttributeName === "intensity" ? [
        <div key="imin" className="mv-panel-field">
          <label>{_("Min")}</label>
          <input type="number" min="0" max="65535" value={intensity[0]}
                 onChange={e => { material.intensityRange = [parseFloat(e.target.value) || 0, intensity[1]]; this.forceUpdate(); }} />
        </div>,
        <div key="imax" className="mv-panel-field">
          <label>{_("Max")}</label>
          <input type="number" min="0" max="65535" value={intensity[1]}
                 onChange={e => { material.intensityRange = [intensity[0], parseFloat(e.target.value) || 0]; this.forceUpdate(); }} />
        </div>] : ""}

        {material.activeAttributeName === "classification" ?
        <div className="mv-panel-classes">
          {Object.keys(viewer.classifications).filter(code => code !== "DEFAULT").map(code => {
            const c = viewer.classifications[code];
            return (<label key={code}>
              <input type="checkbox" checked={c.visible}
                     onChange={e => { viewer.setClassificationVisibility(code, e.target.checked); this.forceUpdate(); }} />
              <span className="mv-class-color" style={{background: `rgb(${c.color.slice(0, 3).map(v => Math.round(v * 255)).join(",")})`}}></span>
              {_(c.name)}
            </label>);
          })}
        </div> : ""}
      </div>);
    }

    return (<div className="mv-panel">
      <div className="mv-panel-toolbar">
        <div className="mv-panel-search">
          <i className="fa fa-search"></i>
          <input type="text" placeholder={_("Search")} value={search} onChange={e => this.setState({search: e.target.value})} />
        </div>
        <button type="button" className={"mv-panel-btn " + (sorted ? "active" : "")} title={_("Sort by name")}
                onClick={() => this.setState({sorted: !sorted})}><i className="fa fa-sort-alpha-down"></i></button>
        <button type="button" className={"mv-panel-btn " + (exportOpen ? "active" : "")} title={_("Export")}
                onClick={e => { e.stopPropagation(); this.setState({exportOpen: !exportOpen, menu: null}); }}><i className="mv-icon mv-icon-export"></i></button>
        <button type="button" className="mv-panel-btn" title={_("Close")} onClick={this.props.onClose}><i className="mv-icon mv-icon-close"></i></button>
      </div>

      <div className="mv-panel-body">
        {this.folder("layers", _("Layers"), [], false)}
        {!closed.layers ? [
        <div key="pointcloud" className={"mv-tree-row mv-tree-child " + (selected === "pointcloud" ? "selected" : "")}
             onClick={() => this.setState({selected: selected === "pointcloud" ? null : "pointcloud"})}>
          <i className="fa fa-pointcloud"></i>
          <span className="mv-tree-label">{_("Point Cloud")}</span>
        </div>,
        this.props.hasCameras ?
        <div key="cameras" className={"mv-tree-row mv-tree-child " + (selected === "cameras" ? "selected" : "")}
             onClick={() => this.setState({selected: selected === "cameras" ? null : "cameras"})}>
          <i className="fa fa-camera fa-fw"></i>
          <span className="mv-tree-label">{_("Cameras")}</span>
          <button type="button" className="mv-panel-btn"
                  title={this.props.camerasVisible ? _("Hide") : _("Show")}
                  onClick={e => { e.stopPropagation(); this.props.onToggleCameras(); }}>
            <i className={this.props.camerasVisible ? "far fa-eye" : "far fa-eye-slash"}></i>
          </button>
        </div> : ""
        ] : ""}

        {this.folder("measures", _("Measures"), measures, true)}
        {!closed.measures ? measures.map(this.itemRow) : ""}

        {this.folder("annotations", _("Annotations"), annotations, true)}
        {!closed.annotations ? annotations.map(this.itemRow) : ""}
      </div>

      {selected === "cameras" ?
      <div className="mv-panel-properties">
        <div className="mv-panel-tabs">
          <div className="mv-panel-tab active">{_("Properties")}</div>
        </div>
        <div className="mv-panel-field">
          <label>{_("Size")}</label>
          <input type="range" min="0.1" max="4" step="0.1" value={cameraScale}
                 onChange={e => {
                   const value = parseFloat(e.target.value);
                   this.setState({cameraScale: value});
                   this.props.onCameraScaleChange(value);
                 }} />
        </div>
      </div> : ""}

      {pointCloudProperties}

      {selectedItem ?
      <div className="mv-panel-properties">
        <div className="mv-panel-tabs">
          <div className={"mv-panel-tab " + (tab === "properties" ? "active" : "")} onClick={() => this.setState({tab: "properties"})}>{_("Properties / Actions")}</div>
          {selectedItem.type !== "volume" ?
          <div className={"mv-panel-tab " + (tab === "points" ? "active" : "")} onClick={() => this.setState({tab: "points"})}>{_("Points")}</div>
          : ""}
        </div>

        {tab === "properties" ? <div>
          {properties.map((p, i) => <div key={i} className="mv-panel-property">
            <span>{p[0]}</span><span>{p[1]}</span>
          </div>)}

          {selectedItem.type === "volume" ?
          <div className="mv-panel-field">
            <label><input type="checkbox" checked={selectedItem.obj.clip}
                          onChange={e => { selectedItem.obj.clip = e.target.checked; this.forceUpdate(); }} /> {_("Use as clip volume")}</label>
          </div> : ""}

          {selectedItem.type === "profile" ? [
          <div key="width" className="mv-panel-field">
            <label>{interpolate(_("Width (%(unit)s)"), {unit: viewer.lengthUnit.code})}</label>
            <input type="number" min="0" step="0.1" value={selectedItem.obj.width}
                   onChange={e => { selectedItem.obj.setWidth(parseFloat(e.target.value) || 0); this.forceUpdate(); }} />
          </div>,
          <div key="show" className="mv-panel-field">
            <button type="button" className="mv-panel-action"
                    onClick={() => {
                      viewer.profileWindow.show();
                      viewer.profileWindowController.setProfile(selectedItem.obj);
                    }}><i className="mv-icon mv-icon-profile"></i> {_("Height Profile")}</button>
          </div>] : ""}

          {selectedItem.type === "animation" ? [
          <div key="duration" className="mv-panel-field">
            <label>{_("Duration")}</label>
            <input type="number" min="0.1" step="0.5" value={selectedItem.obj.duration}
                   onChange={e => { selectedItem.obj.setDuration(parseFloat(e.target.value) || 1); this.forceUpdate(); }} />
          </div>,
          <div key="time" className="mv-panel-field">
            <label>{_("Time")}</label>
            <input type="range" min="0" max="1" step="0.001" value={selectedItem.obj.t}
                   onChange={e => { selectedItem.obj.set(parseFloat(e.target.value)); this.forceUpdate(); }} />
          </div>,
          <div key="controls" className="mv-panel-controls">
            <button type="button" className="mv-panel-btn" title={_("Play")} disabled={recording}
                    onClick={() => selectedItem.obj.play()}><i className="fa fa-play"></i></button>
            <button type="button" className="mv-panel-btn" title={_("Rewind")} disabled={recording}
                    onClick={() => { selectedItem.obj.set(0); this.forceUpdate(); }}><i className="fa fa-stop"></i></button>
            <button type="button" className="mv-panel-btn mv-danger" title={_("Record movie")} disabled={recording}
                    onClick={() => {
                      const animation = selectedItem.obj;
                      this.setState({recording: true});
                      animation.setVisible(false);

                      setTimeout(() => {
                        const chunks = [];
                        const recorder = new MediaRecorder(viewer.renderer.domElement.captureStream(29.97), {mimeType: "video/webm; codecs=vp8"});
                        recorder.ondataavailable = e => {
                          chunks.push(e.data);
                          if (recorder.state === "recording") recorder.stop();
                        };
                        recorder.onstop = () => {
                          const link = document.createElement("a");
                          link.href = URL.createObjectURL(new Blob(chunks, {type: "video/webm"}));
                          link.download = "recording.webm";
                          link.click();
                          animation.setVisible(true);
                          this.setState({recording: false});
                        };
                        animation.play();
                        recorder.start(animation.duration * 1000 + 1000);
                      }, 1000);
                    }}><i className={recording ? "fa fa-circle-notch fa-spin" : "fa fa-circle"}></i></button>
          </div>] : ""}

          {selectedItem.type === "annotation" ? [
          <div key="title" className="mv-panel-field">
            <label>{_("Title")}</label>
            <input type="text" value={selectedItem.obj.title || ""}
                   onChange={e => { selectedItem.obj.title = e.target.value; this.forceUpdate(); }} />
          </div>,
          <div key="description" className="mv-panel-field">
            <label>{_("Description")}</label>
            <textarea rows="3" value={selectedItem.obj.description || ""}
                      onChange={e => { selectedItem.obj.description = e.target.value; this.forceUpdate(); }}></textarea>
          </div>,
          <div key="link" className="mv-panel-field">
            <label>{_("Link")}</label>
            <input type="text" placeholder="https://" value={selectedItem.obj.link || ""}
                   onChange={e => { selectedItem.obj.link = e.target.value; this.forceUpdate(); }} />
          </div>] : ""}

          <div className="mv-panel-field">
            <button type="button" className="mv-panel-action" onClick={() => this.zoomTo(selectedItem)}><i className="fa fa-search"></i> {_("Zoom to")}</button>
            <button type="button" className="mv-panel-action mv-danger" onClick={() => this.remove(selectedItem)}><i className="fa fa-trash"></i> {_("Delete")}</button>
          </div>
        </div> :
        <div className="mv-panel-points">
          <table>
            <thead><tr><th></th><th>x</th><th>y</th><th>z ({unit})</th>{selectedItem.type === "animation" ? <th></th> : null}</tr></thead>
            <tbody>
              {points.map((p, i) => <tr key={i}>
                <td>{i + 1}</td>
                <td>{this.fmt(p.x)}</td>
                <td>{this.fmt(p.y)}</td>
                <td>{this.fmt(p.z * conv)}</td>
                {selectedItem.type === "animation" ? <td>
                  <a href="javascript:void(0)" title={_("Add control point")}
                     onClick={() => { selectedItem.obj.createControlPoint(i + 1); this.forceUpdate(); }}><i className="fa fa-plus"></i></a>
                  {points.length > 2 ?
                  <a href="javascript:void(0)" title={_("Remove control point")} className="mv-danger"
                     onClick={() => { selectedItem.obj.removeControlPoint(selectedItem.obj.controlPoints[i]); this.forceUpdate(); }}> <i className="fa fa-times"></i></a>
                  : ""}
                </td> : null}
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div> : ""}

      {menu ?
      <div className="mv-context-menu" style={{left: menu.x, top: menu.y}}>
        <div onClick={() => { this.setVisible(menu.item, !menu.item.obj.visible); this.forceUpdate(); }}><i className={"fa-fw " + (menu.item.obj.visible ? "far fa-eye-slash" : "far fa-eye")}></i> {menu.item.obj.visible ? _("Hide") : _("Show")}</div>
        <div onClick={() => this.zoomTo(menu.item)}><i className="fa fa-search fa-fw"></i> {_("Zoom to")}</div>
        <div onClick={() => this.setState({renaming: menu.item.obj})}><i className="fa fa-pen fa-fw"></i> {_("Rename")}</div>
        <div onClick={() => this.remove(menu.item)}><i className="fa fa-trash fa-fw"></i> {_("Delete")}</div>
      </div> : ""}

      {exportOpen ?
      <div className="mv-context-menu mv-export-menu">
        <div onClick={() => this.download("measurements.geojson", Potree.GeoJSONExporter.toString([...scene.measurements, ...scene.profiles, ...scene.volumes]))}>GeoJSON</div>
        <div onClick={() => this.download("measurements.dxf", Potree.DXFExporter.toString([...scene.measurements, ...scene.profiles, ...scene.volumes]))}>DXF</div>
        <div onClick={() => this.download("scene.json", JSON.stringify(Potree.saveProject(viewer), null, "\t"))}>{_("Potree scene")}</div>
      </div> : ""}
    </div>);
  }
}

export default ProjectPanel;
