import React from 'react';
import FormDialog from 'webodm/components/FormDialog';
import PropTypes from 'prop-types';
import './ShareDialog.scss';
import ErrorMessage from 'webodm/components/ErrorMessage';
import CloudLogin from './CloudLogin';
import { _, interpolate } from 'webodm/classes/gettext';
import { getCloudToken } from './CloudTokenStore';
import AssetDownloads from 'webodm/classes/AssetDownloads';
import Utils from 'webodm/classes/Utils';
import PluginsAPI from 'webodm/classes/plugins/API';
import { showToasterRipple } from 'webodm/classes/Animations';
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
          selectedCustomAssets: this.getSavedCustom(),
          profile: null,
          size: null,
          loadingSize: true
        };

    }

    getAvailableAssets = () => {
      if (!this.props.task || !Array.isArray(this.props.task.available_assets)) return [];

      const displayAssets = ["orthophoto.tif", "dtm.tif", "dsm.tif", "georeferenced_model.laz", "report.pdf", "textured_model.zip"];
      
      // Treat all textured models as a single choice
      let taa = Utils.clone(this.props.task.available_assets).filter(a => !a.startsWith("textured_model"));
      if (this.props.task.available_assets.indexOf("textured_model.zip") !== -1 ||
         this.props.task.available_assets.indexOf("textured_model.glb") !== -1){
        taa.push("textured_model.zip")
      }

      let assets = AssetDownloads.only(taa);
      return assets.filter(a => displayAssets.includes(a.asset));
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

    savePrefs = () => {
      localStorage.setItem("lightning_last_assets", this.state.selectedAssets);
      localStorage.setItem("lightning_last_custom_assets", JSON.stringify(this.state.selectedCustomAssets));
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
        cloudToken: getCloudToken(this.props.apiKey),
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
          data: JSON.stringify(this.getSizeFormData()),
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

    getSizeFormData = () => {
      return {
        assets: this.state.selectedAssets,
        customAssets: this.state.selectedAssets === 'custom' ? this.state.selectedCustomAssets : []
      };
    }

    getFormData = () => {
      const d = this.getSizeFormData();
      d.project = this.state.selectedProject;
      d.cloudToken = this.state.cloudToken;
      d.cloudUrl = this.state.cloudUrl;
      return d;
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
      this.setState({cloudToken: json.token, cloudUrl: json.url, showLogin: false});
      this.fetchProjectList();
    }

    handleAssetsChange = (e) => {
      this.setState({selectedAssets: e.target.value});
      this.updateSize();
    }

   handleAssetToggle = (assetId) => {
       let { selectedCustomAssets } = this.state;
       
       // Always require point cloud when textured model is selected
       const pointcloud = assetId === 'georeferenced_model.laz';
       const texModel = assetId === 'textured_model.zip';

       if (selectedCustomAssets.indexOf(assetId) === -1) {
          selectedCustomAssets = [...selectedCustomAssets, assetId];
          if (texModel && !selectedCustomAssets.includes('georeferenced_model.laz')) {
             selectedCustomAssets.push('georeferenced_model.laz');
          }
       } else {
          selectedCustomAssets = selectedCustomAssets.filter(a => a !== assetId);
          if (pointcloud && selectedCustomAssets.includes('textured_model.zip')) {
             selectedCustomAssets = selectedCustomAssets.filter(a => a !== 'textured_model.zip');
          }
       }
       
       this.setState({selectedCustomAssets});
       this.updateSize();
    }

    handleShare = (formData) => {
      if (this.state.size <= 0 || this.state.loadingSize) return; // nothing to do
      
      this.savePrefs();
      const saveButton = this.dialog ? this.dialog.saveButton : null;

      return $.ajax({
        type: 'POST',
        url: `/api/plugins/lightning/task/${this.props.task.id}/share`,
        data: JSON.stringify(formData),
        contentType: 'application/json'
      }).done((json) => {
          if (json.celery_task_id){
            showToasterRipple(saveButton);
            PluginsAPI.Workers.addTask({
              workerId: json.celery_task_id,
              name: this.props.task.name || _("Task"),
              action: 'share'
            });
          }else{
            this.setState({error: _("Invalid response")});
          }
      }).fail(() => {
        this.setState({error: _("Cannot share. Please try again in a bit.")});
      });
    }

    render(){
      const { checkingToken, fetchingProjects, error, profile, loadingSize, size, showLogin, selectedCustomAssets } = this.state;

      let formContent = "";
      let showFooter = true;

      if (checkingToken){
        formContent = (<div className="text-center">
            <p>{_("Checking your credentials...")}</p>
            <i className="fa fa-circle-notch fa-spin fa-fw"></i>
          </div>);
        showFooter = false;
      }else{
        if (!error){
          if (fetchingProjects){
            showFooter = false;
            formContent = (<div className="text-center">
              <p>{_("Retrieving your projects...")}</p>
              <i className="fa fa-circle-notch fa-spin fa-fw"></i>
            </div>);
          }else{

            if (showLogin){
              showFooter = false;
              formContent = <CloudLogin onLogin={this.handleCloudLogin} apiKey={this.props.apiKey} apiBase={this.props.apiBase} />;
            }else if (profile){
              const availableAssets = this.getAvailableAssets();

              formContent = [
                (profile.has_quota && profile.quota === 0) ? 
                <div className="lightning-quota-warn row alert alert-warning" key="quota-warn">
                  <span>{_("Your Lightning account does not have permanent cloud storage. You can still share, but data will be deleted shortly after upload.")} </span>
                  <a href="https://webodm.net/pricing" target="_blank">webodm.net/pricing</a>
                </div> : "",
                
                <div className="row" key="project">
                  <label className="col-sm-2 control-label">{_("Project")}</label>
                  <div className="col-sm-10">
                      <select 
                        className="form-control"
                        onChange={(e) => this.setState({ selectedProject: e.target.value })}
                        value={this.state.selectedProject || ""}
                      >
                        <option value="">{_("Create New")} [+]</option>
                        {this.state.projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                  </div>
                </div>,
                <div className="row" key="upload">
                  <label className="col-sm-2 control-label">{_("Share")}</label>
                  <div className="col-sm-10">
                      <select 
                        className="form-control"
                        onChange={this.handleAssetsChange}
                        value={this.state.selectedAssets}
                      >
                        <option value="all">{_("All Assets")}</option>
                        <option value="backup">{_("All Assets + Original Images")}</option>
                        <option value="custom">{_("Only")}</option>
                      </select>
                  </div>
                </div>,

                <div className="row" key="size">
                  <label className="col-sm-2 control-label">{_("Size")}</label>
                  <div className="col-sm-10 lightning-upload-size">
                    {loadingSize ? 
                      <i className="fa fa-circle-notch fa-spin fa-fw"></i> : 
                      <span>
                        {Utils.bytesToSize(size)} 
                        {profile.has_quota && (profile.quota - profile.used_quota) < size  / 1024 / 1024 ? <i style={{marginLeft: "8px"}} title={_("Size exceeds available storage quota")} className="fa fa-exclamation-triangle"></i> : ""}
                      </span>}
                  </div>
                </div>,

                this.state.selectedAssets === 'custom' ? <div className="row" key="custom">
                  <div className="col-sm-12">
                      <div className="row" key="select-links">
                        <div className="col-sm-12 text-right">
                          <a href="javascript:void(0)" onClick={(e) => {
                            e.preventDefault();
                            this.setState({selectedCustomAssets: availableAssets.map(a => a.asset)});
                            this.updateSize();
                          }}>{_("Select All")}</a> | <a href="javascript:void(0)" onClick={(e) => {
                            e.preventDefault();
                            this.setState({selectedCustomAssets: []});
                            this.updateSize();
                          }}>{_("Deselect All")}</a>
                        </div>
                      </div>
                      <div className="row">
                        {availableAssets.length > 0 ? availableAssets.map(asset => (
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
                        )) : ""}
                      </div>
                      
                    </div>
                  </div> : "",
              ];
            }
          }
        }
      }

      return (
          <FormDialog {...this.props}
            title={_("Share with Lightning")}
            getFormData={this.getFormData}
            saveLabel={_("Share")}
            savingLabel={_("Sharing...")}
            saveIcon="fa fa-upload"
            reset={this.reset}
            onShow={this.onShow}
            showFooter={showFooter && !error}
            ref={(domNode) => { this.dialog = domNode; }}
            saveAction={this.handleShare}
            >
            <ErrorMessage bind={[this, "error"]} closeable={false} />
            <div className="form-group lightning-share-dialog">
              {formContent}
            </div>
          </FormDialog>
      );
    }
}

export default ShareDialog;