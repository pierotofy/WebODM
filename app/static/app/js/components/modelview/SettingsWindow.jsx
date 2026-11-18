import React from 'react';
import PropTypes from 'prop-types';
import '../../css/modelview/Settings.scss';
import { _, interpolate } from '../../classes/gettext';

class SettingsWindow extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired,
    task: PropTypes.object.isRequired,
    title: PropTypes.string.isRequired,
    settings: PropTypes.object.isRequired,
    modelType: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    onSetInitialCameraView: PropTypes.func,
    onClose: PropTypes.func.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      tab: "general",
      viewSaving: false,
      viewSaved: false,
      viewError: ""
    };
  }

  change = (key, value) => {
    this.props.onChange(key, value);
    this.forceUpdate();
  }

  row = (title, description, control) => {
    return (<div className="mv-settings-row" key={title}>
      <div className="mv-settings-text">
        <div className="mv-settings-name">{title}</div>
        {description ? <div className="mv-settings-description">{description}</div> : ""}
      </div>
      <div className="mv-settings-control">{control}</div>
    </div>);
  }

  toggle = (key, value, disabled) => {
    return (<button type="button" disabled={!!disabled}
                    className={"mv-switch " + (value ? "on" : "")}
                    onClick={() => this.change(key, !value)}><span></span></button>);
  }

  slider = (key, value, min, max, step, label) => {
    return (<div className="mv-settings-slider">
      {label ? <span>{label}</span> : ""}
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={e => this.change(key, parseFloat(e.target.value))} />
    </div>);
  }

  segmented = (key, value, options) => {
    return (<div className="mv-segmented">
      {options.map(o => <button key={o[0]} type="button" className={value === o[0] ? "active" : ""}
                                onClick={() => this.change(key, o[0])}>{o[1]}</button>)}
    </div>);
  }

  shortcut = (label, keys) => {
    return (<div className="mv-settings-shortcut" key={label}>
      <span>{label}</span>
      <span>{keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
    </div>);
  }

  render(){
    const { viewer, task, settings, modelType } = this.props;
    const { tab, viewSaving, viewSaved, viewError } = this.state;
    const pc = viewer.scene.pointclouds[0];
    const material = pc ? pc.material : null;

    const tabs = [
      ["general", "mv-icon mv-icon-settings", _("General")],
      ["display", "mv-icon mv-icon-display", _("Display")],
      ["pointcloud", "fa fa-pointcloud", _("Point Cloud")],
      ["navigation", "mv-icon mv-icon-navigation", _("Navigation")],
      ["information", "fa fa-info-circle", _("Information")]
    ];

    let content = [];

    if (tab === "general"){
      content = [
        this.row(_("Magnifier"), _("Shows a zoomed-in view for greater precision when placing measurement points."),
          this.toggle("magnifier", settings.magnifier !== false)),
        this.row(_("Coordinate Unit"), _("Unit used by the point cloud coordinates. Detected from the task's coordinate system."),
          <span>{task.srs.units || "m"}</span>),
        this.row(_("Orientation Indicator"), _("Shows the X / Y / Z indicator in the top-right corner. Click an axis to look along it."),
          this.toggle("gizmo", settings.gizmo === true)),
        this.row(_("Navigation Compass"), _("Shows a compass that points north."),
          this.toggle("compass", viewer.compass.isVisible()))
      ];

      if (this.props.onSetInitialCameraView){
        content.push(this.row(_("Initial Camera View"), viewError || _("Use the current view as the starting view every time this model is opened."),
          <button type="button" className="mv-settings-action" disabled={viewSaving}
                  onClick={() => {
                    this.setState({viewSaving: true, viewSaved: false, viewError: ""});
                    this.props.onSetInitialCameraView(err => {
                      this.setState({viewSaving: false, viewSaved: !err, viewError: err});
                    });
                  }}>
            <i className={viewSaving ? "fa fa-circle-notch fa-spin" : (viewSaved ? "fa fa-check" : "fa fa-video")}></i> {_("Set")}
          </button>));
      }
    }else if (tab === "display"){
      const background = settings.background || "gradient";
      content = [
        this.row(_("Background"), _("Choose a gradient or a solid color as the 3D view background."),
          <div className="mv-settings-backgrounds">
            <button type="button" className={"mv-background-gradient " + (background === "gradient" ? "active" : "")}
                    title={_("Gradient")} onClick={() => this.change("background", "gradient")}></button>
            <input type="color" title={_("Color")} className={background !== "gradient" ? "active" : ""}
                   value={background === "gradient" ? "#4f4f4f" : background}
                   onChange={e => this.change("background", e.target.value)} />
          </div>),
        this.row(_("Camera Display"), _("Perspective shows depth like the eye does. Orthographic keeps parallel lines parallel, which is better for measuring from the top or the side."),
          this.segmented("cameraMode", Object.keys(Potree.CameraMode).find(k => Potree.CameraMode[k] === viewer.scene.cameraMode), [
            ["PERSPECTIVE", _("Perspective")], ["ORTHOGRAPHIC", _("Orthographic")]
          ])),
        this.row(_("Show Minimap"), _("Shows or hides the minimap button in the bottom-left corner of the viewer."),
          this.toggle("minimap", settings.minimap !== false)),
        this.row(_("Field of View"), _("Change your camera's field of view."),
          this.slider("fov", viewer.getFOV(), 20, 100, 1, `${Math.round(viewer.getFOV())}°`))
      ];
    }else if (tab === "pointcloud"){
      const budget = viewer.getPointBudget();
      content = [
        this.row(_("Point Budget"), _("Maximum number of points displayed at the same time. Lower values improve performance; higher values show more detail."),
          this.slider("pointBudget", budget, 100000, 20000000, 100000, interpolate(_("%(num)sM"), {num: (budget / 1000000).toFixed(1)})))
      ];

      if (material){
        content = content.concat([
          this.row(_("Point Size Mode"), "",
            this.segmented("pointSizeType", Object.keys(Potree.PointSizeType).find(k => Potree.PointSizeType[k] === material.pointSizeType), [
              ["FIXED", _("Fixed")], ["ATTENUATED", _("Attenuated")], ["ADAPTIVE", _("Adaptive")]
            ])),
          this.row(_("Point Shape"), "",
            this.segmented("pointShape", Object.keys(Potree.PointShape).find(k => Potree.PointShape[k] === material.shape), [
              ["SQUARE", _("Square")], ["CIRCLE", _("Circle")], ["PARABOLOID", _("Paraboloid")]
            ])),
          this.row(_("Point Size"), "",
            this.slider("pointSize", material.size, 0.1, 3, 0.1, material.size.toFixed(1)))
        ]);
      }

      content = content.concat([
        <div className="mv-settings-section" key="advanced">{_("Advanced Rendering")}</div>,
        this.row(_("Eye-Dome Lighting (EDL)"), _("Shades points by depth to make shapes easier to read."),
          this.toggle("edlEnabled", viewer.useEDL, modelType !== "cloud")),
        this.row(_("EDL Strength"), "",
          this.slider("edlStrength", viewer.edlStrength, 0, 5, 0.1, viewer.edlStrength.toFixed(1))),
        this.row(_("EDL Radius"), "",
          this.slider("edlRadius", viewer.edlRadius, 1, 4, 0.1, viewer.edlRadius.toFixed(1))),
        this.row(_("High Quality (HQ)"), _("Blends overlapping points for a smoother picture. Slower."),
          this.toggle("hq", !!viewer.useHQ))
      ]);
    }else if (tab === "navigation"){
      content = [
        <div className="mv-settings-section" key="3d">{_("3D Navigation")}</div>,
        this.row(_("Camera Smoothness"), _("How smoothly the camera settles after a move."),
          this.segmented("smoothness", settings.smoothness || "standard", [
            ["smooth", _("Smooth")], ["standard", _("Standard")], ["snappy", _("Snappy")]
          ])),
        this.row(_("Movement Speed"), _("Camera travel speed in Fly and Walk modes."),
          this.slider("moveSpeed", Math.log10(Math.max(viewer.getMoveSpeed(), 0.01)), -2, 4, 0.05, viewer.getMoveSpeed().toFixed(1))),
        <div className="mv-settings-section" key="navigate">{_("Navigate")}</div>,
        this.shortcut(_("Orbit"), [_("Left Drag")]),
        this.shortcut(_("Pan"), [_("Right Drag")]),
        this.shortcut(_("Zoom"), [_("Wheel")]),
        this.shortcut(_("Focus"), [_("Left Double-Click")]),
        <div className="mv-settings-section" key="movement">{_("Movement (Fly / Walk)")}</div>,
        this.shortcut(_("Move Forward"), ["W", "↑"]),
        this.shortcut(_("Move Backward"), ["S", "↓"]),
        this.shortcut(_("Move Left"), ["A", "←"]),
        this.shortcut(_("Move Right"), ["D", "→"]),
        this.shortcut(_("Move Up"), ["R", "PgUp"]),
        this.shortcut(_("Move Down"), ["F", "PgDn"])
      ];
    }else{
      content = [
        this.row(_("Name"), "", <span>{this.props.title}</span>),
        this.row(_("Coordinate System"), "", <span>{task.epsg ? `EPSG:${task.epsg}` : _("None")}</span>),
        this.row(_("Coordinate Unit"), "", <span>{task.srs.units || "m"}</span>)
      ];
    }

    return (<div className="mv-settings">
      <div className="mv-settings-header">
        <div className="mv-settings-title">{_("Settings")}</div>
        <button type="button" className="mv-settings-close" title={_("Close")} onClick={this.props.onClose}><i className="fa fa-times"></i></button>
      </div>
      <div className="mv-settings-body">
        <div className="mv-settings-tabs">
          {tabs.map(t => <button key={t[0]} type="button" className={tab === t[0] ? "active" : ""}
                                 onClick={() => this.setState({tab: t[0]})}>
            <i className={t[1]}></i> <span>{t[2]}</span>
          </button>)}
        </div>
        <div className="mv-settings-content">{content}</div>
      </div>
    </div>);
  }
}

export default SettingsWindow;
