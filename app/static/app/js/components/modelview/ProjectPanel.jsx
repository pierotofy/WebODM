import React from 'react';
import PropTypes from 'prop-types';
import '../../css/modelview/Panel.scss';
import { _ } from '../../classes/gettext';

class ProjectPanel extends React.Component{
  static propTypes = {
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
      cameraScale: 1
    };
  }

  render(){
    const { selected, cameraScale } = this.state;

    return (<div className="mv-panel">
      <div className="mv-panel-header">
        <div className="mv-panel-title" title={this.props.title}>{this.props.title}</div>
        <button type="button" className="mv-panel-btn" title={_("Close")} onClick={this.props.onClose}><i className="fa fa-times"></i></button>
      </div>

      <div className="mv-panel-body">
        {this.props.hasCameras ?
        <div className={"mv-tree-row " + (selected === "cameras" ? "selected" : "")}
             onClick={() => this.setState({selected: selected === "cameras" ? null : "cameras"})}>
          <i className="fa fa-camera fa-fw"></i>
          <span className="mv-tree-label">{_("Cameras")}</span>
          <button type="button" className="mv-panel-btn"
                  title={this.props.camerasVisible ? _("Hide") : _("Show")}
                  onClick={e => { e.stopPropagation(); this.props.onToggleCameras(); }}>
            <i className={this.props.camerasVisible ? "far fa-eye" : "far fa-eye-slash"}></i>
          </button>
        </div> : ""}
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
    </div>);
  }
}

export default ProjectPanel;
