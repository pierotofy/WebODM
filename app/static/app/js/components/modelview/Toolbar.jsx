import React from 'react';
import PropTypes from 'prop-types';
import '../../css/modelview/Toolbar.scss';
import '../../css/modelview/Icons.scss';
import { _ } from '../../classes/gettext';

class Toolbar extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired,
    modelType: PropTypes.string.isRequired,
    panel: PropTypes.string,
    onTogglePanel: PropTypes.func.isRequired
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
        id: "navigation", icon: "mv-icon mv-icon-navigation", title: _("Navigation"),
        items: [
          { icon: "mv-icon mv-icon-orbit", title: _("Orbit"),
            active: viewer.controls === viewer.orbitControls,
            onClick: () => viewer.setControls(viewer.orbitControls) },
          { icon: "mv-icon mv-icon-fly", title: _("Fly"),
            active: viewer.controls === fp && !fp.lockElevation,
            onClick: () => { viewer.setControls(fp); fp.lockElevation = false; } },
          { icon: "mv-icon mv-icon-walk", title: _("Walk"),
            active: viewer.controls === fp && fp.lockElevation,
            onClick: () => { viewer.setControls(fp); fp.lockElevation = true; } },
          { icon: "mv-icon mv-icon-earth", title: _("Earth"),
            active: viewer.controls === viewer.earthControls,
            onClick: () => viewer.setControls(viewer.earthControls) }
        ]
      },
      {
        id: "viewpoint", icon: "mv-icon mv-icon-viewpoint", title: _("Viewpoint"),
        onClick: () => viewer.fitToScreen()
      },
      { separator: true },
      {
        id: "display", icon: "mv-icon mv-icon-display", title: _("Display"),
        items: [
          { icon: "mv-icon mv-icon-ortho", title: _("Orthographic"),
            active: viewer.scene.cameraMode === Potree.CameraMode.ORTHOGRAPHIC,
            onClick: () => viewer.setCameraMode(viewer.scene.cameraMode === Potree.CameraMode.ORTHOGRAPHIC ? Potree.CameraMode.PERSPECTIVE : Potree.CameraMode.ORTHOGRAPHIC) },
          { icon: "mv-icon mv-icon-rgba", title: _("RGBA"),
            active: this.activeAttribute() === "rgba",
            onClick: () => this.setAttribute("rgba") },
          { icon: "mv-icon mv-icon-intensity", title: _("Intensity"),
            active: this.activeAttribute() === "intensity",
            onClick: () => this.setAttribute("intensity") },
          { icon: "mv-icon mv-icon-elevation", title: _("Elevation"),
            active: this.activeAttribute() === "elevation",
            onClick: () => this.setAttribute("elevation") },
          { icon: "mv-icon mv-icon-adaptive", title: _("Adaptive"),
            active: !!pc && pc.material.pointSizeType === Potree.PointSizeType.ADAPTIVE,
            onClick: () => viewer.scene.pointclouds.forEach(p => {
              p.material.pointSizeType = p.material.pointSizeType === Potree.PointSizeType.ADAPTIVE ? Potree.PointSizeType.FIXED : Potree.PointSizeType.ADAPTIVE;
            }) },
          { icon: "mv-icon mv-icon-xray", title: _("X-ray"),
            active: !!pc && pc.material.opacity < 1,
            disabled: modelType !== "cloud",
            onClick: () => {
              const xray = pc.material.opacity < 1;
              viewer.scene.pointclouds.forEach(p => { p.material.opacity = xray ? 1 : 0.15; });
              viewer.setEDLEnabled(xray);
            } },
          { icon: "mv-icon mv-icon-edl", title: _("Eye-Dome Lighting (EDL)"),
            active: viewer.useEDL,
            disabled: modelType !== "cloud",
            onClick: () => {
              viewer.scene.pointclouds.forEach(p => { p.material.opacity = 1; });
              viewer.setEDLEnabled(!viewer.useEDL);
            } }
        ]
      },
      {
        id: "measures", icon: "mv-icon mv-icon-distance", title: _("Measures"),
        items: [
          { icon: "mv-icon mv-icon-distance", title: _("Distance"),
            onClick: () => this.measure({showDistances: true, showArea: false, closed: false, name: _("Distance")}) },
          { icon: "mv-icon mv-icon-height", title: _("Height"),
            onClick: () => this.measure({showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: _("Height")}) },
          { icon: "mv-icon mv-icon-point", title: _("Point"),
            onClick: () => this.measure({showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: _("Point")}) },
          { icon: "mv-icon mv-icon-angle", title: _("Angle"),
            onClick: () => this.measure({showDistances: false, showAngles: true, showArea: false, closed: true, maxMarkers: 3, name: _("Angle")}) },
          { icon: "mv-icon mv-icon-circle", title: _("Circle"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: true, showEdges: false, closed: false, maxMarkers: 3, name: _("Circle")}) },
          { icon: "mv-icon mv-icon-azimuth", title: _("Azimuth"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: false, showEdges: false, showAzimuth: true, closed: false, maxMarkers: 2, name: _("Azimuth")}) },
          { icon: "mv-icon mv-icon-area", title: _("Surface area"),
            onClick: () => this.measure({showDistances: true, showArea: true, closed: true, name: _("Area")}) },
          { icon: "mv-icon mv-icon-volume", title: _("Volume"),
            onClick: () => viewer.volumeTool.startInsertion() },
          { icon: "mv-icon mv-icon-sphere", title: _("Sphere volume"),
            onClick: () => viewer.volumeTool.startInsertion({type: Potree.SphereVolume}) },
          { icon: "mv-icon mv-icon-profile", title: _("Height profile"),
            onClick: () => {
              const profile = viewer.profileTool.startInsertion();
              viewer.profileWindow.show();
              viewer.profileWindowController.setProfile(profile);
            } }
        ]
      },
      { separator: true },
      {
        id: "project", icon: "mv-icon mv-icon-project", title: _("Project"),
        active: this.props.panel === "project",
        onClick: () => this.props.onTogglePanel("project")
      },
      {
        id: "settings", icon: "mv-icon mv-icon-settings", title: _("Settings"),
        active: this.props.panel === "settings",
        onClick: () => this.props.onTogglePanel("settings")
      }
    ];

    const openGroup = groups.find(g => g.id === open);

    return (<div className="mv-toolbar-container">
      <div className="mv-toolbar">
        {groups.map((g, i) => g.separator ?
          <div key={i} className="mv-toolbar-separator"></div> :
          <button key={g.id} type="button" title={g.title}
                  className={"mv-toolbar-btn " + (open === g.id || g.active ? "active" : "")}
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
