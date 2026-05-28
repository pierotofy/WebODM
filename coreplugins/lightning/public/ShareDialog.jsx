import React from 'react';
import FormDialog from 'webodm/components/FormDialog';
import PropTypes from 'prop-types';
import './ShareDialog.scss';
import ErrorMessage from 'webodm/components/ErrorMessage';
import { _ } from 'webodm/classes/gettext';
import $ from 'jquery';

class ShareDialog extends React.Component {
    static defaultProps = {
      apiKey: "",
      cloudToken: "",
      task: null,
      apiBase: "https://webodm.net"
    };

    static propTypes = {
        task: PropTypes.object.isRequired,
        apiKey: PropTypes.string.isRequired,
        cloudToken: PropTypes.object.isRequired,
        apiBase: PropTypes.string
    };

    constructor(props){
        super(props);

        this.state = {
          error: "",
          checkingToken: true,
          fetchingProjects: false,
          showLogin: false,
          cloudUrl: "",
          cloudToken: props.cloudToken,
          selectedProject: "",
          projects: [{
            id: 1,
            name: "Test"
          },
          {
            id: 2,
            name: "Test2"
          }]
        };

    }

    fetchProjectList = () => {
      this.setState({fetchingProjects: true});

      $.ajax({
        type: 'GET',
        url: `${this.state.cloudUrl}/api/projects/`,
        headers: {
          'Authorization': 'JWT ' + this.state.cloudToken
        }
      }).done(json => {
        if (Array.isArray(json)){
          this.setState({ projects: json });
        }else{
          this.setState({error: _("Invalid response. Try again later.")});
        }
      }).fail(() => {
        this.setState({ error: _("Cannot fetch projects. Try again later.") });
      }).always(() => {
        this.setState({ fetchingProjects: false });
      });
    }

    reset = () => {
      this.setState({
        error: "",
        checkingToken: true,
        fetchingProjects: false,
        showLogin: false,
        cloudUrl: "",
        selectedProject: "",
      });
    }

    getFormData = () => {
      return {

      };
    }

    onShow = () => {
      if (!this.state.cloudToken){
        this.setState({showLogin: true, checkingToken: false});
        return;
      }

      $.ajax({
        type: 'POST',
        url: `${this.props.apiBase}/r/auth/cloud/verify`,
        data: JSON.stringify({
          token: this.props.apiKey,
          cloudToken: this.state.cloudToken
        }),
        contentType: 'application/json'
      }).done(json => {
        if (json.code === 'expired'){
          this.setState({showLogin: true});
        }else if (json.url){
          this.setState({cloudUrl: json.url});
          this.fetchProjectList();
        }else{
          this.setState({error: _("Service not available. Try again later.")});
        }
      }).fail(() => {
        this.setState({ error: _("Cannot verify credentials. Try again later.") });
      }).always(() => {
        this.setState({ checkingToken: false });
      });
    }

    show = () => {
      this.dialog.show();
    }

    hide = () => {
      this.dialog.hide();
    }

    render(){
      const { checkingToken, fetchingProjects, error } = this.state;

      let formContent = "";
      let showFooter = true;

      if (checkingToken){
        formContent = (<div className="text-center">
            <p>{_("Checking your credentials...")}</p>,
            <i className="fa fa-circle-notch fa-spin fa-fw"></i>
          </div>);
        showFooter = false;
      }else{
        if (!error){
          if (fetchingProjects){
            formContent = (<div className="text-center">
              <p>{_("Retrieving projects...")}</p>,
              <i className="fa fa-circle-notch fa-spin fa-fw"></i>
            </div>);
          }else{
            formContent = [
              <label className="col-sm-2 control-label">{_("Project")}</label>,
              <div className="col-sm-10">
                  <select 
                    className="form-control"
                    onChange={(e) => this.setState({ selectedProject: e.target.value })}
                    value={this.state.selectedProject || ""}
                  >
                    <option value="">{_("+ Add To New Project")}</option>
                    {this.state.projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
              </div>
            ];
          }
        }
      }

      return (
          <FormDialog {...this.props}
            title={_("Share to Lightning")}
            getFormData={this.getFormData}
            reset={this.reset}
            onShow={this.onShow}
            showFooter={showFooter && !error}
            ref={(domNode) => { this.dialog = domNode; }}>
            <ErrorMessage bind={[this, "error"]} closeable={false} />
            <div className="form-group lightning-share-dialog">
              {formContent}
            </div>
          </FormDialog>
      );
    }
}

export default ShareDialog;