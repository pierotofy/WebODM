import React from 'react';
import PropTypes from 'prop-types';
import '../../css/modelview/Panel.scss';
import UnitSelector from '../UnitSelector';
import { _ } from '../../classes/gettext';

class SettingsPanel extends React.Component{
  static propTypes = {
    onSetInitialCameraView: PropTypes.func,
    onClose: PropTypes.func.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      viewSaving: false,
      viewSaved: false,
      viewError: ""
    };
  }

  render(){
    const { viewSaving, viewSaved, viewError } = this.state;

    return (<div className="mv-panel">
      <div className="mv-panel-header">
        <div className="mv-panel-title">{_("Settings")}</div>
        <button type="button" className="mv-panel-btn" title={_("Close")} onClick={this.props.onClose}><i className="fa fa-times"></i></button>
      </div>

      <div className="mv-panel-body">
        <div className="mv-panel-field">
          <label>{_("Measurement Unit")}</label>
          <UnitSelector />
        </div>

        {this.props.onSetInitialCameraView ?
        <div className="mv-panel-field">
          <button type="button" className="mv-panel-action" disabled={viewSaving}
                  onClick={() => {
                    this.setState({viewSaving: true, viewSaved: false, viewError: ""});
                    this.props.onSetInitialCameraView(err => {
                      this.setState({viewSaving: false, viewSaved: !err, viewError: err});
                    });
                  }}>
            <i className={viewSaving ? "fa fa-circle-notch fa-spin" : (viewSaved ? "fa fa-check" : "fa fa-video")}></i> {_("Set initial camera view")}
          </button>
          {viewError ? <div className="mv-panel-error">{viewError}</div> : ""}
        </div> : ""}
      </div>
    </div>);
  }
}

export default SettingsPanel;
