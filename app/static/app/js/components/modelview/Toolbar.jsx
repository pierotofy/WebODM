import React from 'react';
import PropTypes from 'prop-types';
import '../../css/modelview/Toolbar.scss';
import { _ } from '../../classes/gettext';

class Toolbar extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired,
    modelType: PropTypes.string.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      open: null
    };
  }

  measure = (args) => {
    this.props.viewer.measuringTool.startInsertion(args);
  }

  setAttribute = (name) => {
    this.props.viewer.scene.pointclouds.forEach(pc => {
      pc.material.activeAttributeName = name;
    });
  }

  activeAttribute = () => {
    const pc = this.props.viewer.scene.pointclouds[0];
    return pc ? pc.material.activeAttributeName : "";
  }

  render(){
    const { viewer, modelType } = this.props;
    const { open } = this.state;
    const pc = viewer.scene.pointclouds[0];
    const fp = viewer.fpControls;

    const groups = [
      {
        id: "navigation", icon: "fa fa-location-arrow", title: _("Navigation"),
        items: [
          { icon: "fa fa-mouse-pointer", title: _("Orbit"),
            active: viewer.controls === viewer.orbitControls,
            onClick: () => viewer.setControls(viewer.orbitControls) },
          { icon: "fa fa-paper-plane", title: _("Fly"),
            active: viewer.controls === fp && !fp.lockElevation,
            onClick: () => { viewer.setControls(fp); fp.lockElevation = false; } },
          { icon: "fa fa-walking", title: _("Walk"),
            active: viewer.controls === fp && fp.lockElevation,
            onClick: () => { viewer.setControls(fp); fp.lockElevation = true; } },
          { icon: "fa fa-globe", title: _("Earth"),
            active: viewer.controls === viewer.earthControls,
            onClick: () => viewer.setControls(viewer.earthControls) }
        ]
      },
      {
        id: "viewpoint", icon: "fa fa-expand-arrows-alt", title: _("Viewpoint"),
        onClick: () => viewer.fitToScreen()
      },
      { separator: true },
      {
        id: "display", icon: "fa fa-paint-brush", title: _("Display"),
        items: [
          { icon: "fa fa-binoculars", title: _("Orthographic"),
            active: viewer.scene.cameraMode === Potree.CameraMode.ORTHOGRAPHIC,
            onClick: () => viewer.setCameraMode(viewer.scene.cameraMode === Potree.CameraMode.ORTHOGRAPHIC ? Potree.CameraMode.PERSPECTIVE : Potree.CameraMode.ORTHOGRAPHIC) },
          { icon: "fa fa-palette", title: _("RGBA"),
            active: this.activeAttribute() === "rgba",
            onClick: () => this.setAttribute("rgba") },
          { icon: "fa fa-highlighter", title: _("Intensity"),
            active: this.activeAttribute() === "intensity",
            onClick: () => this.setAttribute("intensity") },
          { icon: "fa fa-chart-area", title: _("Elevation"),
            active: this.activeAttribute() === "elevation",
            onClick: () => this.setAttribute("elevation") },
          { icon: "fa fa-ruler-combined", title: _("Adaptive"),
            active: !!pc && pc.material.pointSizeType === Potree.PointSizeType.ADAPTIVE,
            onClick: () => viewer.scene.pointclouds.forEach(p => {
              p.material.pointSizeType = p.material.pointSizeType === Potree.PointSizeType.ADAPTIVE ? Potree.PointSizeType.FIXED : Potree.PointSizeType.ADAPTIVE;
            }) },
          { icon: "fa fa-sun", title: _("Eye-Dome Lighting (EDL)"),
            active: viewer.useEDL,
            disabled: modelType !== "cloud",
            onClick: () => viewer.setEDLEnabled(!viewer.useEDL) }
        ]
      },
      {
        id: "measures", icon: "mv-icon mv-icon-distance", title: _("Measures"),
        items: [
          { icon: "mv-icon mv-icon-distance", title: _("Distance"),
            onClick: () => this.measure({showDistances: true, showArea: false, closed: false, name: _("Distance")}) },
          { icon: "fa fa-ruler-vertical", title: _("Height"),
            onClick: () => this.measure({showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: _("Height")}) },
          { icon: "mv-icon mv-icon-point", title: _("Point"),
            onClick: () => this.measure({showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: _("Point")}) },
          { icon: "mv-icon mv-icon-angle", title: _("Angle"),
            onClick: () => this.measure({showDistances: false, showAngles: true, showArea: false, closed: true, maxMarkers: 3, name: _("Angle")}) },
          { icon: "far fa-circle", title: _("Circle"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: true, showEdges: false, closed: false, maxMarkers: 3, name: _("Circle")}) },
          { icon: "fa fa-compass", title: _("Azimuth"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: false, showEdges: false, showAzimuth: true, closed: false, maxMarkers: 2, name: _("Azimuth")}) },
          { icon: "fa fa-vector-square", title: _("Surface area"),
            onClick: () => this.measure({showDistances: true, showArea: true, closed: true, name: _("Area")}) },
          { icon: "fa fa-cube", title: _("Volume"),
            onClick: () => viewer.volumeTool.startInsertion() },
          { icon: "fa fa-globe-americas", title: _("Sphere volume"),
            onClick: () => viewer.volumeTool.startInsertion({type: Potree.SphereVolume}) }
        ]
      },
      {
        id: "tools", icon: "fa fa-search", title: _("Tools"),
        items: [
          { icon: "fa fa-chart-area", title: _("Height profile"),
            onClick: () => {
              const profile = viewer.profileTool.startInsertion();
              viewer.profileWindow.show();
              viewer.profileWindowController.setProfile(profile);
            } }
        ]
      }
    ];

    const openGroup = groups.find(g => g.id === open);

    return (<div className="mv-toolbar-container">
      <div className="mv-toolbar">
        {groups.map((g, i) => g.separator ?
          <div key={i} className="mv-toolbar-separator"></div> :
          <button key={g.id} type="button" title={g.title}
                  className={"mv-toolbar-btn " + (open === g.id ? "active" : "")}
                  onClick={() => {
                    if (g.items) this.setState({open: open === g.id ? null : g.id});
                    else g.onClick();
                  }}>
            <i className={g.icon}></i>
          </button>
        )}
      </div>
      {openGroup ? <div className="mv-toolbar mv-toolbar-sub">
        {openGroup.items.map((item, i) =>
          <button key={i} type="button" title={item.title}
                  disabled={!!item.disabled}
                  className={"mv-toolbar-btn " + (item.active ? "active" : "")}
                  onClick={() => { item.onClick(); this.forceUpdate(); }}>
            <i className={item.icon}></i>
          </button>
        )}
      </div> : ""}
    </div>);
  }
}

export default Toolbar;
