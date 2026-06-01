import React from 'react';
import FormDialog from 'webodm/components/FormDialog';
import PropTypes from 'prop-types';
import './ShareDialog.scss';
import ErrorMessage from 'webodm/components/ErrorMessage';
import CloudLogin from './CloudLogin';
import { _ } from 'webodm/classes/gettext';
import { getCloudToken } from './CloudTokenStore';
import AssetDownloads from 'webodm/classes/AssetDownloads';
import Utils from 'webodm/classes/Utils';
import $ from 'jquery';

class ShareDialog extends React.Component {
    static defaultProps = {
      apiKey: "",
      task: null,
      apiBase: "https://webodm.net"
    };

    static propTypes = {
        task: PropTypes.object.isRequired,
        apiKey: PropTypes.string.isRequired,
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
          cloudToken: getCloudToken(this.props.apiKey),
          selectedProject: "",
          projects: [],
          selectedAssets: this.getSavedAssets(),
          custom: this.getSavedCustom(),
          profile: null,
          size: null,
          loadingSize: true
        };

    }

    getAvailableAssets = () => {
      if (!this.props.task || !Array.isArray(this.props.task.available_assets)) return [];

      let assets = AssetDownloads.only(this.props.task.available_assets);
      const subset = ["orthophoto.tif", "dtm.tif", "dsm.tif", "georeferenced_model.laz", "textured_model.glb", "report.pdf"];
      return assets.filter(a => subset.includes(a.asset));
    }

    getSavedAssets = () => {
      return localStorage.getItem("lightning_last_assets") || "all";
    }

    getSavedCustom = () => {
      const assets = this.getAvailableAssets().map(a => a.asset);
      let savedCustom = localStorage.getItem("lightning_last_custom_assets");
      if (!savedCustom) return assets;

      try {
        savedCustom = JSON.parse(savedCustom);
      } catch (e) {
        return assets;
      }

      if (!Array.isArray(savedCustom)) return assets;

      return assets.filter(a => savedCustom.includes(a));
    }

    saveCustom = (selectedCustomAssets) => {
      localStorage.setItem("lightning_last_custom_assets", JSON.stringify(selectedCustomAssets));
    }

    fetchProjectList = () => {
      this.setState({fetchingProjects: true});

      $.when(
        $.ajax({
          type: 'GET',
          url: `${this.state.cloudUrl}/api/projects/`,
          headers: {
            'Authorization': 'JWT ' + this.state.cloudToken
          }
        }),
        $.ajax({
          type: 'GET',
          url: `${this.state.cloudUrl}/api/user/profile`,
          headers: {
            'Authorization': 'JWT ' + this.state.cloudToken
          }
        })
      ).done((projectsRes, profileRes) => {
        const projects = projectsRes[0];
        const profile = profileRes[0];
        
        if (Array.isArray(projects)){
          this.setState({ projects, profile });
          this.updateSize();
        }else{
          this.setState({error: _("Invalid response. Try again later.")});
        }
      }).fail(() => {
        this.setState({ error: _("Cannot communicate with Lightning's cloud platform. Try again later.") });
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
        selectedAssets: this.getSavedAssets(),
        selectedCustomAssets: this.getSavedCustom(),
      });
    }

    updateSize = () => {
      this.setState({loadingSize: true});
      setTimeout(() => {
        $.ajax({
          type: 'POST',
          url: `/api/plugins/lightning/task/${this.props.task.id}/size`,
          data: JSON.stringify(this.getFormData()),
          contentType: 'application/json'
        }).done((json) => {
          this.setState({ size: json.size });
        }).fail(() => {
          this.setState({ error: _("Cannot calculate size. Try again later.") });
        }).always(() => {
          this.setState({ loadingSize: false });
        });
      }, 0);
    }

    getFormData = () => {
      return {
        project: this.state.selectedProject,
        assets: this.state.selectedAssets,
        customAssets: this.state.selectedAssets === 'custom' ? this.state.selectedCustomAssets : []
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
          api_key: this.props.apiKey,
          cloud_token: this.state.cloudToken
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

    handleCloudLogin = (json) => {
      this.setState({cloudToken: json.token, cloudUrl: json.url});
      this.fetchProjectList();
    }

    handleUploadChange = (e) => {
      this.setState({selectedAssets: e.target.value});
      this.updateSize();
    }

    handleAssetToggle = (assetId) => {
       let { selectedCustomAssets } = this.state;
       if (selectedCustomAssets.indexOf(assetId) === -1) selectedCustomAssets.push(assetId);
       else selectedCustomAssets = selectedCustomAssets.filter(a => a !== assetId);

       this.setState({selectedCustomAssets});
       this.updateSize();
    }

    render(){
      const { checkingToken, fetchingProjects, error, profile, loadingSize, size, showLogin, selectedCustomAssets } = this.state;

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
            showFooter = false;
            formContent = (<div className="text-center">
              <p>{_("Retrieving your projects...")}</p>,
              <i className="fa fa-circle-notch fa-spin fa-fw"></i>
            </div>);
          }else{

            if (showLogin){
              showFooter = false;
              formContent = <CloudLogin onLogin={this.handleCloudLogin} apiKey={this.props.apiKey} apiBase={this.props.apiBase} />;
            }else{
              const availableAssets = this.getAvailableAssets();

              formContent = [
              <div className="row" key="project">
                <label className="col-sm-2 control-label">{_("Project")}</label>
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
              </div>,
              <div className="row" key="upload">
                <label className="col-sm-2 control-label">{_("Upload")}</label>
                <div className="col-sm-10">
                    <select 
                      className="form-control"
                      onChange={this.handleUploadChange}
                      value={this.state.selectedAssets}
                    >
                      <option value="all">{_("All Assets")}</option>
                      <option value="backup">{_("All Assets + Original Images")}</option>
                      <option value="custom">{_("Only")}</option>
                    </select>
                </div>
              </div>,

              this.state.selectedAssets === 'custom' ? <div className="row" key="custom">
                <div className="col-sm-12 lightning-custom-assets">
                    {availableAssets.length > 0 ? <div className="row">
                      {availableAssets.map(asset => (
                        <div className="col-sm-6" key={asset.asset}>
                          <div className="checkbox lightning-custom-asset-option">
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedCustomAssets.indexOf(asset.asset) !== -1}
                                onChange={() => this.handleAssetToggle(asset.asset)} />
                              <i className={asset.icon}></i>
                              <span>{asset.label}</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div> : ""}
                  </div>
                </div> : "",

                <div className="row" key="size">
                  <label className="col-sm-2 control-label">{_("Size")}</label>
                  <div className="col-sm-10 lightning-upload-size">
                    {loadingSize ? 
                      <i className="fa fa-circle-notch fa-spin fa-fw"></i> : 
                      <span>{Utils.bytesToSize(size)}</span>}
                  </div>
                </div>
              ];
            }
          }
        }
      }

      return (
          <FormDialog {...this.props}
            title={_("Share to Lightning")}
            getFormData={this.getFormData}
            saveLabel={_("Share")}
            savingLabel={_("Sharing...")}
            saveIcon="fa fa-upload"
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