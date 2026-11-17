import React from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';
import '../../css/modelview/Profile.scss';
import { _, interpolate } from '../../classes/gettext';

class ProfilePanel extends React.Component{
  static propTypes = {
    viewer: PropTypes.object.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      minimized: false
    };
  }

  componentDidMount(){
    const { viewer } = this.props;

    viewer.profileWindow = new Potree.ProfileWindow(viewer);
    viewer.profileWindowController = new Potree.ProfileWindowController(viewer);

    $(this.root).draggable({handle: $(this.header), containment: "parent"});
    $(this.root).resizable({containment: "parent", handles: "e, s, se", minWidth: 320, minHeight: 220});
  }

  render(){
    const { minimized } = this.state;

    return (<div id="profile_window" className={"mv-profile " + (minimized ? "minimized" : "")}
                 style={{display: "none"}} ref={domNode => { this.root = domNode; }}>
      <div id="profile_titlebar" className="mv-profile-header" ref={domNode => { this.header = domNode; }}>
        <span className="mv-profile-title">{_("Profile")}</span>
        <button type="button" title={minimized ? _("Restore") : _("Minimize")}
                onClick={() => this.setState({minimized: !minimized})}><i className="mv-icon mv-icon-minus"></i></button>
        <button type="button" id="closeProfileContainer" title={_("Close")}><i className="mv-icon mv-icon-close"></i></button>
      </div>

      <div id="profile_draw_container" className="mv-profile-body">
        <svg id="profileSVG"></svg>
        <div id="profileCanvasContainer"></div>
        <div id="profileSelectionProperties" style={{display: "none"}}></div>

        <div className="mv-profile-actions">
          <div className="mv-profile-points"
               dangerouslySetInnerHTML={{__html: interpolate(_("%(num)s points"), {num: '<span id="profile_num_points">-</span>'})}}></div>
          <a id="potree_download_profile_ortho_link" href="#" download="profile.csv"><span id="potree_download_csv_icon">{_("Export to CSV")}</span></a>
          <a id="potree_download_profile_link" href="#" download="profile.las"><span id="potree_download_las_icon">{_("Export to LAS")}</span></a>
        </div>
      </div>

      <div className="mv-profile-footer">
        <input id="potree_profile_rotate_amount" type="text" maxLength="4" defaultValue="10" title={_("Rotation step (degrees)")} />
        <button type="button" id="potree_profile_rotate_cw" title={_("Rotate clockwise")}><i className="mv-icon mv-icon-rotatecw"></i></button>
        <button type="button" id="potree_profile_rotate_ccw" title={_("Rotate counterclockwise")}><i className="mv-icon mv-icon-rotateccw"></i></button>
        <button type="button" id="potree_profile_move_forward" title={_("Move forward")}><i className="mv-icon mv-icon-up"></i></button>
        <button type="button" id="potree_profile_move_backward" title={_("Move backward")}><i className="mv-icon mv-icon-down"></i></button>
      </div>
    </div>);
  }
}

export default ProfilePanel;
