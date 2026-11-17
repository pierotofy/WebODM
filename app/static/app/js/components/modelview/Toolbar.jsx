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
    onTogglePanel: PropTypes.func.isRequired,
    hasCameras: PropTypes.bool.isRequired,
    camerasVisible: PropTypes.bool.isRequired,
    onToggleCameras: PropTypes.func.isRequired,
    onEnterVR: PropTypes.func
  }

  constructor(props){
    super(props);

    this.state = {
      open: null
    };
  }

  measure = (args, kind) => {
    const measurement = this.props.viewer.measuringTool.startInsertion(args);
    if (kind) measurement.kind = kind;
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
          { icon: "mv-icon mv-icon-elevation", title: _("Elevation"),
            active: this.activeAttribute() === "elevation",
            onClick: () => this.setAttribute("elevation") },
          { icon: "mv-icon mv-icon-classification", title: _("Classification"),
            active: this.activeAttribute() === "classification",
            disabled: !pc || !pc.pcoGeometry.pointAttributes.attributes.some(a => a.name === "classification"),
            onClick: () => this.setAttribute("classification") },
          { icon: "mv-icon mv-icon-xray", title: _("X-ray"),
            active: !!pc && pc.material.opacity < 1,
            disabled: modelType !== "cloud",
            onClick: () => {
              const xray = pc.material.opacity < 1;
              viewer.scene.pointclouds.forEach(p => { p.material.opacity = xray ? 1 : 0.15; });
              viewer.setEDLEnabled(xray);
            } },
          { icon: "mv-icon mv-icon-cameras", title: _("Cameras"),
            active: this.props.camerasVisible,
            disabled: !this.props.hasCameras,
            onClick: this.props.onToggleCameras }
        ]
      },
      {
        id: "measures", icon: "mv-icon mv-icon-ruler", title: _("Measurements"),
        items: [
          { icon: "mv-icon mv-icon-point", title: _("Point"),
            onClick: () => this.measure({showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: _("Point")}) },
          { icon: "mv-icon mv-icon-distance", title: _("Distance"),
            onClick: () => this.measure({showDistances: true, showArea: false, closed: false, name: _("Distance")}) },
          { icon: "mv-icon mv-icon-deltas", title: _("Deltas"),
            onClick: () => this.measure({showDistances: true, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: _("Deltas")}, "deltas") },
          { icon: "mv-icon mv-icon-ground", title: _("Ground distance"),
            onClick: () => this.measure({showDistances: true, showArea: false, closed: false, name: _("Ground distance")}, "ground") },
          { icon: "mv-icon mv-icon-height", title: _("Height"),
            onClick: () => this.measure({showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: _("Height")}) },
          { icon: "mv-icon mv-icon-angle", title: _("Angle"),
            onClick: () => this.measure({showDistances: false, showAngles: true, showArea: false, closed: true, maxMarkers: 3, name: _("Angle")}) },
          { icon: "mv-icon mv-icon-circle", title: _("Circle"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: true, showEdges: false, closed: false, maxMarkers: 3, name: _("Circle")}) },
          { icon: "mv-icon mv-icon-azimuth", title: _("Azimuth"),
            onClick: () => this.measure({showDistances: false, showHeight: false, showArea: false, showCircle: false, showEdges: false, showAzimuth: true, closed: false, maxMarkers: 2, name: _("Azimuth")}) },
          { icon: "mv-icon mv-icon-perpendicular", title: _("Perpendicular distance"),
            onClick: () => this.measure({showDistances: false, showArea: false, closed: false, maxMarkers: 3, name: _("Perpendicular distance")}, "perpendicular") },
          { icon: "mv-icon mv-icon-area", title: _("Surface area"),
            onClick: () => this.measure({showDistances: true, showArea: true, closed: true, name: _("Area")}) },
          { icon: "mv-icon mv-icon-areaplane", title: _("Area plane"),
            onClick: () => this.measure({showDistances: true, showArea: true, closed: true, name: _("Area plane")}, "area-plane") },
          { icon: "mv-icon mv-icon-volume", title: _("Volume"),
            onClick: () => viewer.volumeTool.startInsertion() },
          { icon: "mv-icon mv-icon-sphere", title: _("Sphere volume"),
            onClick: () => viewer.volumeTool.startInsertion({type: Potree.SphereVolume}) },
          { icon: "mv-icon mv-icon-density", title: _("Density"),
            onClick: () => {
              const volume = viewer.volumeTool.startInsertion({name: _("Density")});
              const setSize = () => {
                volume.scale.set(1, 1, 1);
                volume.removeEventListener("drop", setSize);
              };
              volume.kind = "density";
              volume.addEventListener("drop", setSize);
            } },
          { icon: "mv-icon mv-icon-profile", title: _("Height profile"),
            onClick: () => {
              const profile = viewer.profileTool.startInsertion();
              viewer.profileWindow.show();
              viewer.profileWindowController.setProfile(profile);
            } },
          { icon: "mv-icon mv-icon-annotation", title: _("Annotation"),
            onClick: () => viewer.annotationTool.startInsertion() }
        ]
      },
      {
        id: "camera", icon: "mv-icon mv-icon-camera", title: _("Camera"),
        items: [
          { icon: "mv-icon mv-icon-pov", title: _("Point of View"),
            onClick: () => {
              const view = viewer.scene.view;
              viewer.scene.addAnnotation(view.getPivot(), {
                title: _("Point of View"),
                cameraPosition: view.position.clone(),
                cameraTarget: view.getPivot()
              });
              if (this.props.panel !== "project") this.props.onTogglePanel("project");
            } },
          { icon: "mv-icon mv-icon-video", title: _("Video animation"),
            onClick: () => {
              viewer.scene.addCameraAnimation(Potree.CameraAnimation.defaultFromView(viewer));
              if (this.props.panel !== "project") this.props.onTogglePanel("project");
            } }
        ]
      },
      {
        id: "clipping", icon: "mv-icon mv-icon-clip", title: _("Clipping"),
        items: [
          { icon: "mv-icon mv-icon-clipbox", title: _("Clip box"),
            onClick: () => viewer.volumeTool.startInsertion({clip: true}) },
          { icon: "mv-icon mv-icon-clippolygon", title: _("Clip polygon"),
            onClick: () => viewer.clippingTool.startInsertion({type: "polygon"}) },
          { icon: "mv-icon mv-icon-highlight", title: _("Highlight"),
            active: viewer.clipTask === Potree.ClipTask.HIGHLIGHT,
            onClick: () => viewer.setClipTask(Potree.ClipTask.HIGHLIGHT) },
          { icon: "mv-icon mv-icon-clipin", title: _("Clip In"),
            active: viewer.clipTask === Potree.ClipTask.SHOW_INSIDE,
            onClick: () => viewer.setClipTask(Potree.ClipTask.SHOW_INSIDE) },
          { icon: "mv-icon mv-icon-clipout", title: _("Clip Out"),
            active: viewer.clipTask === Potree.ClipTask.SHOW_OUTSIDE,
            onClick: () => viewer.setClipTask(Potree.ClipTask.SHOW_OUTSIDE) },
          { icon: "mv-icon mv-icon-trash", title: _("Remove all clip volumes"),
            onClick: () => viewer.scene.removeAllClipVolumes() }
        ]
      },
      { separator: true },
      {
        id: "project", icon: "mv-icon mv-icon-project", title: _("Layer List"),
        active: this.props.panel === "project",
        onClick: () => this.props.onTogglePanel("project")
      },
      {
        id: "history", icon: "mv-icon mv-icon-history", title: _("Action history"),
        active: this.props.panel === "history",
        onClick: () => this.props.onTogglePanel("history")
      },
      {
        id: "settings", icon: "mv-icon mv-icon-settings", title: _("Settings"),
        active: this.props.panel === "settings",
        onClick: () => this.props.onTogglePanel("settings")
      }
    ];

    if (this.props.onEnterVR){
      groups.push({
        id: "vr", icon: "mv-icon mv-icon-vr", title: _("VR"),
        onClick: this.props.onEnterVR
      });
    }

    const openGroup = groups.find(g => g.id === open);

    return (<div className="mv-toolbar-container">
      <div className="mv-toolbar">
        {groups.map((g, i) => g.separator ?
          <div key={i} className="mv-toolbar-separator"></div> :
          <button key={g.id} type="button" title={g.title} disabled={!!g.disabled}
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
