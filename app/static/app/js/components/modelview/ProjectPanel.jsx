import React from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'THREE';
import '../../css/modelview/Panel.scss';
import { _, interpolate } from '../../classes/gettext';

class ProjectPanel extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired,
    title: PropTypes.string.isRequired,
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
      measuresOpen: true,
      layersOpen: true,
      renaming: null,
      menu: null
    };
  }

  componentDidMount(){
    this.refreshInterval = setInterval(() => this.forceUpdate(), 500);
    document.addEventListener("click", this.closeMenu);
  }

  componentWillUnmount(){
    clearInterval(this.refreshInterval);
    document.removeEventListener("click", this.closeMenu);
  }

  closeMenu = () => {
    if (this.state.menu) this.setState({menu: null});
  }

  fmt = (n) => {
    return Potree.Utils.addCommas(n.toFixed(3));
  }

  remove = (item) => {
    const { scene } = this.props.viewer;
    if (item.type === "measure") scene.removeMeasurement(item.obj);
    else if (item.type === "volume") scene.removeVolume(item.obj);
    else scene.removeProfile(item.obj);
    if (this.state.selected === item.obj) this.setState({selected: null});
  }

  zoomTo = (item) => {
    let box;
    if (item.type === "measure") box = new THREE.Box3().setFromPoints(item.obj.points.map(p => p.position));
    else if (item.type === "profile") box = new THREE.Box3().setFromPoints(item.obj.points);
    else box = item.obj.boundingBox.clone().applyMatrix4(item.obj.matrixWorld);

    if (box.isEmpty()) return;
    if (box.getSize(new THREE.Vector3()).length() === 0) box.expandByScalar(5);

    const node = new THREE.Object3D();
    node.boundingBox = box;
    this.props.viewer.zoomTo(node, 2, 500);
  }

  toggleVisible = (item) => {
    item.obj.visible = !item.obj.visible;
    this.forceUpdate();
  }

  render(){
    const { viewer } = this.props;
    const { selected, tab, cameraScale, search, sorted, measuresOpen, layersOpen, renaming, menu } = this.state;
    const scene = viewer.scene;

    let items = scene.measurements.map(obj => {
      let icon = "mv-icon mv-icon-distance";
      if (obj.showAngles) icon = "mv-icon mv-icon-angle";
      else if (obj.showCoordinates) icon = "mv-icon mv-icon-point";
      else if (obj.showCircle) icon = "mv-icon mv-icon-circle";
      else if (obj.showAzimuth) icon = "mv-icon mv-icon-azimuth";
      else if (obj.showHeight) icon = "mv-icon mv-icon-height";
      else if (obj.showArea) icon = "mv-icon mv-icon-area";
      return {obj, type: "measure", icon};
    }).concat(
      scene.volumes.filter(obj => !obj.clip).map(obj => ({obj, type: "volume", icon: "mv-icon mv-icon-volume"})),
      scene.profiles.map(obj => ({obj, type: "profile", icon: "mv-icon mv-icon-profile"}))
    );

    if (search) items = items.filter(item => item.obj.name.toLowerCase().indexOf(search.toLowerCase()) !== -1);
    if (sorted) items.sort((a, b) => a.obj.name.localeCompare(b.obj.name));

    const selectedItem = items.find(item => item.obj === selected);

    const conv = viewer.lengthUnitDisplay.unitspermeter / viewer.lengthUnit.unitspermeter;
    const unit = viewer.lengthUnitDisplay.code;
    const properties = [];
    let points = [];

    if (selectedItem && selectedItem.type === "measure"){
      const m = selectedItem.obj;
      points = m.points.map(p => p.position);

      if (m.showDistances && points.length > 1) properties.push([_("Total distance"), `${this.fmt(m.getTotalDistance() * conv)} ${unit}`]);
      if (m.showArea && points.length > 2) properties.push([_("Area"), `${this.fmt(m.getArea() * conv * conv)} ${unit}²`]);
      if (m.showHeight && points.length > 1){
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
    }

    const anyVisible = items.some(item => item.obj.visible);

    return (<div className="mv-panel">
      <div className="mv-panel-header">
        <div className="mv-panel-title" title={this.props.title}>{this.props.title}</div>
        <button type="button" className="mv-panel-btn" title={_("Close")} onClick={this.props.onClose}><i className="fa fa-times"></i></button>
      </div>

      <div className="mv-panel-toolbar">
        <div className="mv-panel-search">
          <i className="fa fa-search"></i>
          <input type="text" placeholder={_("Search")} value={search} onChange={e => this.setState({search: e.target.value})} />
        </div>
        <button type="button" className={"mv-panel-btn " + (sorted ? "active" : "")} title={_("Sort by name")}
                onClick={() => this.setState({sorted: !sorted})}><i className="fa fa-sort-alpha-down"></i></button>
      </div>

      <div className="mv-panel-body">
        {this.props.hasCameras ? [
        <div key="layers" className="mv-tree-row mv-tree-folder" onClick={() => this.setState({layersOpen: !layersOpen})}>
          <i className={"fa fa-fw " + (layersOpen ? "fa-caret-down" : "fa-caret-right")}></i>
          <i className="far fa-folder fa-fw"></i>
          <span className="mv-tree-label">{_("Layers")}</span>
        </div>,
        layersOpen ?
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

        <div className="mv-tree-row mv-tree-folder" onClick={() => this.setState({measuresOpen: !measuresOpen})}>
          <i className={"fa fa-fw " + (measuresOpen ? "fa-caret-down" : "fa-caret-right")}></i>
          <i className="far fa-folder fa-fw"></i>
          <span className="mv-tree-label">{_("Measures")}</span>
          {items.length > 0 ? [
          <button key="delete" type="button" className="mv-panel-btn mv-danger" title={_("Delete all")}
                  onClick={e => {
                    e.stopPropagation();
                    if (window.confirm(_("Are you sure you want to delete all measures?"))){
                      items.forEach(this.remove);
                    }
                  }}><i className="fa fa-trash"></i></button>,
          <button key="eye" type="button" className="mv-panel-btn" title={anyVisible ? _("Hide") : _("Show")}
                  onClick={e => {
                    e.stopPropagation();
                    items.forEach(item => { item.obj.visible = !anyVisible; });
                    this.forceUpdate();
                  }}><i className={anyVisible ? "far fa-eye" : "far fa-eye-slash"}></i></button>
          ] : ""}
        </div>

        {measuresOpen ? items.map(item =>
        <div key={item.obj.uuid}
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
          <input type="text" className="mv-tree-rename" autoFocus defaultValue={item.obj.name}
                 onClick={e => e.stopPropagation()}
                 onBlur={e => { item.obj.name = e.target.value || item.obj.name; this.setState({renaming: null}); }}
                 onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); }} />
          : <span className="mv-tree-label">{item.obj.name}</span>}
          {selected === item.obj ?
          <button type="button" className="mv-panel-btn mv-danger" title={_("Delete")}
                  onClick={e => { e.stopPropagation(); this.remove(item); }}><i className="fa fa-trash"></i></button>
          : ""}
          <button type="button" className="mv-panel-btn" title={item.obj.visible ? _("Hide") : _("Show")}
                  onClick={e => { e.stopPropagation(); this.toggleVisible(item); }}>
            <i className={item.obj.visible ? "far fa-eye" : "far fa-eye-slash"}></i>
          </button>
        </div>) : ""}
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
                    }}><i className="fa fa-chart-area"></i> {_("Show 2D Profile")}</button>
          </div>] : ""}

          <div className="mv-panel-field">
            <button type="button" className="mv-panel-action" onClick={() => this.zoomTo(selectedItem)}><i className="fa fa-search"></i> {_("Zoom to")}</button>
            <button type="button" className="mv-panel-action mv-danger" onClick={() => this.remove(selectedItem)}><i className="fa fa-trash"></i> {_("Delete")}</button>
          </div>
        </div> :
        <div className="mv-panel-points">
          <table>
            <thead><tr><th></th><th>x</th><th>y</th><th>z ({unit})</th></tr></thead>
            <tbody>
              {points.map((p, i) => <tr key={i}>
                <td>{i + 1}</td>
                <td>{this.fmt(p.x)}</td>
                <td>{this.fmt(p.y)}</td>
                <td>{this.fmt(p.z * conv)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div> : ""}

      {menu ?
      <div className="mv-context-menu" style={{left: menu.x, top: menu.y}}>
        <div onClick={() => this.toggleVisible(menu.item)}><i className={"fa-fw " + (menu.item.obj.visible ? "far fa-eye-slash" : "far fa-eye")}></i> {menu.item.obj.visible ? _("Hide") : _("Show")}</div>
        <div onClick={() => this.zoomTo(menu.item)}><i className="fa fa-search fa-fw"></i> {_("Zoom to")}</div>
        <div onClick={() => this.setState({renaming: menu.item.obj})}><i className="fa fa-pen fa-fw"></i> {_("Rename")}</div>
        <div onClick={() => this.remove(menu.item)}><i className="fa fa-trash fa-fw"></i> {_("Delete")}</div>
      </div> : ""}
    </div>);
  }
}

export default ProjectPanel;
