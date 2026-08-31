import React from 'react';
import $ from 'jquery';
import '../css/SplatsDialog.scss';
import PropTypes from 'prop-types';
import ErrorMessage from './ErrorMessage';
import Dropzone from '../vendor/dropzone';
import csrf from '../django/csrf';
import UploadProgressBar from './UploadProgressBar';
import Workers from '../classes/Workers';
import Trans from './Trans';
import ResizeModes from '../classes/ResizeModes';
import Storage from '../classes/Storage';
import { _, interpolate } from '../classes/gettext';

const MAX_FILE_SIZE = 128 * 1024 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = '.ply,.spz,.splat,.ksplat,.sog,.sogs,.zip,.rad';

class SplatsDialog extends React.Component {
  static defaultProps = {
    task: null,
    projectId: -1,
    canEdit: false,
  };

  static propTypes = {
    task: PropTypes.object.isRequired,
    projectId: PropTypes.number.isRequired,
    canEdit: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onTaskChanged: PropTypes.func
  };

  constructor(props) {
    super(props);
    this.state = {
      error: '',
      exporting: false,
      exportProgress: null,
      uploading: false,
      progress: 0,
      totalBytes: 0,
      totalBytesSent: 0,
      lastUpdated: 0,
      processing: false,
      processingStatus: '',
      processingProgress: null,
      hasModel: (props.task.available_assets || []).indexOf('splats.rad') !== -1,
      showWorkflow: (props.task.available_assets || []).indexOf('splats.rad') === -1,
      deleting: false,
      showResizeOptions: false,
      resizeMode: Storage.getItem('splats_resize_mode') == null ? ResizeModes.YES : ResizeModes.fromString(Storage.getItem('splats_resize_mode')),
      resizeSize: parseInt(Storage.getItem('splats_resize_size')) || 1920
    };
  }

  setResizeMode = (v) => {
    return () => {
      this.setState({resizeMode: v});
      Storage.setItem('splats_resize_mode', v);
    };
  }

  handleResizeSizeChange = (e) => {
    // Remove all non-digit characters
    let n = parseInt(e.target.value.replace(/[^\d]*/g, ""));
    if (isNaN(n)) n = "";
    this.setState({resizeSize: n});
    if (n !== "") Storage.setItem('splats_resize_size', n);
  }

  resetUploadState = () => {
    this.setState({
      error: "",
      uploading: false,
      progress: 0,
      totalBytes: 0,
      totalBytesSent: 0,
      lastUpdated: 0
    });
  }

  componentDidMount() {
    this._mounted = true;
    $(this.modal).modal('show');
    $(this.modal).on('hidden.bs.modal', () => {
      if (this._mounted) this.props.onClose();
    });

    // Prevent drag/drop events from leaking through the modal
    ['dragenter', 'dragover', 'dragleave', 'drop', 'dragend'].forEach(eventName => {
      $(this.modal).on(eventName, e => {
        e.stopPropagation();
        e.preventDefault();
      });
    });

    if (this.props.canEdit && this.assetsInfo().hasPointCloud && this.dropzone) {
      Dropzone.autoDiscover = false;
      this.dz = new Dropzone(this.dropzone, {
        paramName: 'file',
        url: this.uploadUrl(),
        parallelUploads: 1,
        maxFilesize: MAX_FILE_SIZE / 1024 / 1024,
        uploadMultiple: false,
        acceptedFiles: ACCEPTED_EXTENSIONS,
        autoProcessQueue: true,
        createImageThumbnails: false,
        previewTemplate: '<div style="display:none"></div>',
        clickable: this.uploadBtn,
        timeout: 2147483647,
        chunking: true,
        chunkSize: 8000000,
        retryChunks: true,
        retryChunksLimit: 20,
        headers: {
          [csrf.header]: csrf.token,
        },
      });

      this.dz.on("addedfiles", files => {
          // Single file upload
          if (files.length > 1){
            this.dz.removeAllFiles(true);
            this.setState({error: _("Please upload a single file.")});
            return;
          }

          this.resetUploadState();
          const file = files[0];
          file.deltaBytesSent = 0;
          file.trackedBytesSent = 0;
          file.retries = 0;

          this.setState({totalBytes: file.size});
        })
        .on("sending", () => {
          this.setState({uploading: true});
        })
        .on("uploadprogress", (file, progress, bytesSent) => {
            const now = new Date().getTime();

            if (bytesSent > file.size) bytesSent = file.size;

            if (progress === 100 || now - this.state.lastUpdated > 500){
                const deltaBytesSent = bytesSent - file.deltaBytesSent;
                file.trackedBytesSent += deltaBytesSent;

                const totalBytesSent = this.state.totalBytesSent + deltaBytesSent;

                this.setState({
                    progress: totalBytesSent / this.state.totalBytes * 100,
                    totalBytesSent,
                    lastUpdated: now
                });

                file.deltaBytesSent = bytesSent;
            }
        })
        .on("complete", (file) => {
            // Retry
            const retry = () => {
                const MAX_RETRIES = 15;

                if (!file.accepted){
                  throw new Error(interpolate(_('%(filename)s is not a valid file'), {filename: file.name }));
                }

                if (file.retries < MAX_RETRIES){
                    this.setState({
                        progress: 0,
                        totalBytesSent: 0,
                    });

                    file.status = Dropzone.QUEUED;
                    file.deltaBytesSent = 0;
                    file.trackedBytesSent = 0;
                    file.retries++;
                    setTimeout(() => {
                      this.dz.processQueue();
                    }, 2500 * file.retries);
                }else{
                    throw new Error(interpolate(_('Cannot upload %(filename)s, exceeded max retries (%(max_retries)s)'), {filename: file.name, max_retries: MAX_RETRIES}));
                }
            };

            try{
                if (file.status === "error"){
                    if ((file.size / 1024 / 1024) > this.dz.options.maxFilesize) {
                        throw new Error(interpolate(_('Cannot upload %(filename)s, file is too large! Default MaxFileSize is %(maxFileSize)s MB!'), { filename: file.name, maxFileSize: this.dz.options.maxFilesize }));
                    }
                    retry();
                }else{
                    let response = JSON.parse(file.xhr.response);
                    if (response.success){
                      this.resetUploadState();
                      this.dz.removeAllFiles(true);
                      if (response.celery_task_id){
                        this.monitorProcessing(response.celery_task_id);
                      }else{
                        this.handleModelAdded();
                      }
                    }else{
                        retry();
                    }
                }
            }catch(e){
                if (this.manuallyCanceled){
                  // Manually canceled, ignore error
                  this.setState({uploading: false});
                }else{
                  this.setState({error: `${e.message}`, uploading: false});
                }

                if (this.dz.files.length) this.dz.cancelUpload();
            }
        })
        .on("reset", () => {
          this.resetUploadState();
        })
        .on('error', () => {
          if (this.state.uploading && !this.manuallyCanceled){
            this.setState({ error: _('Upload failed. Check your connection and try again.') });
          }
        });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    ['dragenter', 'dragover', 'dragleave', 'drop', 'dragend'].forEach(eventName => {
      $(this.modal).off(eventName);
    });
    if (this.dz) {
      this.dz.destroy();
      this.dz = null;
    }
    $(this.modal).off('hidden.bs.modal').modal('hide');
  }

  splatsUrl(action) {
    return `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/splats/${action}`;
  }

  uploadUrl() {
    return this.splatsUrl("upload");
  }

  monitorProcessing = (celeryTaskId) => {
    this.setState({processing: true, processingStatus: '', processingProgress: null});
    Workers.waitForCompletion(celeryTaskId, error => {
      if (!this._mounted) return;
      this.setState({processing: false});
      if (error) this.setState({error});
      else this.handleModelAdded();
    }, (status, progress) => {
      if (!this._mounted) return;
      this.setState({processingStatus: status, processingProgress: progress});
    });
  }

  handleModelAdded = () => {
    this.setState({hasModel: true, showWorkflow: false});
    if (this.props.onTaskChanged) this.props.onTaskChanged();
  }

  handleDownload = () => {
    const imageSize = this.state.resizeMode === ResizeModes.NO ? 0 : (parseInt(this.state.resizeSize) || 1920);
    this.setState({exporting: true, exportProgress: null, showResizeOptions: false, error: ""});
    $.ajax({
        url: this.splatsUrl("download"),
        type: 'POST',
        data: { image_size: imageSize }
    }).done(result => {
        if (result.celery_task_id){
            Workers.waitForCompletion(result.celery_task_id, error => {
                if (!this._mounted) return;
                this.setState({exporting: false});
                if (error) this.setState({error});
                else window.location.href = this.splatsUrl(`download/${result.celery_task_id}`) + `?filename=${result.filename}`;
            }, (_status, progress) => {
                if (!this._mounted) return;
                if (progress === 100) this.setState({exportProgress: null}); // Don't show the last bit
                else this.setState({exportProgress: progress});
            });
        }else{
            this.setState({exporting: false, error: interpolate(_("Invalid response: %(error)s"), {error: JSON.stringify(result)})});
        }
    }).fail(e => {
        this.setState({exporting: false, error: (e.responseJSON || {}).detail || (e.responseJSON || {})[0] || _("Cannot export training data.")});
    });
  }

  handleDeleteModel = () => {
    if (!window.confirm(_('Are you sure you want to delete the splat model?'))) return;

    this.setState({deleting: true, error: ""});
    $.ajax({
      url: this.splatsUrl("manage"),
      type: 'DELETE',
      dataType: 'json',
    }).done(resp => {
      this.setState({deleting: false});
      if (resp.success){
        this.setState({hasModel: false, showWorkflow: true});
        if (this.props.onTaskChanged) this.props.onTaskChanged();
      }
    }).fail(() => {
      this.setState({deleting: false, error: _('Cannot delete splat model.')});
    });
  }

  handleClose = () => {
    $(this.modal).modal('hide');
  };

  cancelUpload = () => {
    this.dz.removeAllFiles(true);
  }

  handleCancel = () => {
    this.manuallyCanceled = true;
    this.cancelUpload();
    setTimeout(() => {
      this.manuallyCanceled = false;
    }, 500);
  }

  assetsInfo() {
    const { task } = this.props;
    const availableAssets = task.available_assets || [];
    return {
      hasPointCloud: availableAssets.indexOf('georeferenced_model.laz') !== -1,
      hasCameras: availableAssets.indexOf('cameras.json') !== -1 &&
                  availableAssets.indexOf('shots.geojson') !== -1,
      missingImages: task.compacted || task.images_count === 0
    };
  }

  renderAlerts() {
    const { hasPointCloud, hasCameras, missingImages } = this.assetsInfo();

    return [
      !hasCameras ?
        <div key="missing-cameras" className="alert alert-info">
          <i className="fa fa-info-circle"></i> {_("This task is missing camera information, so training data cannot be downloaded.")}
        </div>
      : "",
      hasCameras && !hasPointCloud ?
        <div key="missing-pointcloud" className="alert alert-warning">
          <i className="fa fa-exclamation-triangle"></i> {_("This task is missing a point cloud, so the training data will include an empty point cloud. Some training software might not work properly without one. Uploading a splat model is disabled.")}
        </div>
      : "",
      hasCameras && missingImages ?
        <div key="missing-images" className="alert alert-warning">
          <i className="fa fa-exclamation-triangle"></i> {_("The images for this task are not available, so they will not be part of the download. After extracting the .zip file, copy the original images into its \"images\" folder before training.")}
        </div>
      : ""
    ];
  }

  renderModelActions() {
    const { deleting } = this.state;

    return (
      <div className="model-actions">
        <p>
          {_("The splat model has been added.")}
        </p>
        <a className="btn btn-primary" href={`/3d/project/${this.props.projectId}/task/${this.props.task.id}/?t=splats`}>
          <i className="fa fa-splat"></i> {_("View in 3D")}
        </a>
        {this.props.canEdit ? [
          <button key="upload" type="button" className="btn btn-default" disabled={!this.assetsInfo().hasPointCloud} onClick={() => this.setState({showWorkflow: true})}>
            <i className="glyphicon glyphicon-upload"></i> {_("Upload New")}
          </button>,
          <button key="delete" type="button" className="btn btn-danger" onClick={this.handleDeleteModel} disabled={deleting}>
            <i className={deleting ? "fa fa-circle-notch fa-spin" : "fa fa-trash"}></i>
          </button>
        ] : ""}
      </div>
    );
  }

  render() {
    const { canEdit } = this.props;
    const { exporting, exportProgress, showResizeOptions, resizeMode, uploading, processing } = this.state;
    const { hasPointCloud, hasCameras } = this.assetsInfo();
    const downloadDisabled = !hasCameras || exporting;

    return (
      <div ref={(el) => (this.modal = el)} className="modal splats-dialog" tabIndex="-1" data-backdrop="static">
        <div className="modal-dialog modal-lg">
          <div ref={(el) => (this.dropzone = el)} className="modal-content">
            <div className="modal-header">
              <button type="button" className="close" onClick={this.handleClose}>
                <span>&times;</span>
              </button>
              <h4 className="modal-title">{_('Gaussian Splats')}</h4>
            </div>
            <div className="modal-body">
              <ErrorMessage bind={[this, 'error']} />
              {!this.state.showWorkflow ? this.renderModelActions() : ""}
              {/* The workflow is hidden (not unmounted) so that the
                  upload button keeps working as the dropzone target */}
              <div style={{display: this.state.showWorkflow ? "block" : "none"}}>
                {this.renderAlerts()}

                <div className="splats-step">
                  <div className="step-number step-button theme-background-highlight">1</div>
                  <div className="step-body">
                    <div className="download-area">
                      <button onClick={this.handleDownload}
                          disabled={downloadDisabled} type="button" className="btn btn-primary">
                          {exporting ? <i className="fa fa-spin fa-circle-notch fa-fw"/> : <i className="fa fa-download fa-fw"/>} {exporting ? _("Downloading...") : _("Download Training Data")}{exporting && exportProgress !== null ? ` (${exportProgress.toFixed(0)}%)` : ""}
                      </button>
                      <button type="button" className="btn btn-default toggle-options" title={_("Options")}
                          disabled={downloadDisabled}
                          onClick={() => this.setState({showResizeOptions: !showResizeOptions})}>
                          <i className="fa fa-cog"></i>
                      </button>
                      {showResizeOptions && (
                        <div className="resize-images">
                          <label>{_("Resize Images")}</label>
                          <div className="btn-group">
                            <button type="button" className="btn btn-default dropdown-toggle" data-toggle="dropdown">
                                {ResizeModes.toHuman(resizeMode)} <span className="caret"></span>
                            </button>
                            <ul className="dropdown-menu">
                                {ResizeModes.all().map(mode =>
                                <li key={mode}>
                                    <a href="javascript:void(0);"
                                        onClick={this.setResizeMode(mode)}>
                                        <i style={{opacity: resizeMode === mode ? 1 : 0}} className="fa fa-check"></i> {ResizeModes.toHuman(mode)}</a>
                                </li>
                                )}
                            </ul>
                          </div>
                          <div className={"resize-control " + (resizeMode === ResizeModes.NO ? "hide" : "")}>
                            <input
                                type="number"
                                step="100"
                                className="form-control"
                                onChange={this.handleResizeSizeChange}
                                value={this.state.resizeSize}
                            />
                            <span>{_("px")}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="splats-step">
                  <div className="step-number theme-background-highlight">2</div>
                  <div className="step-body">
                    <p>
                      <Trans params={{link_start: `<a href="${window.__splatDocsLink}" target="_blank">`, link_end: '</a>'}}>
                        {_("Train a model using your choice of %(link_start)s compatible software %(link_end)s")}
                      </Trans>
                    </p>
                  </div>
                </div>

                <div className="splats-step last">
                  <div className="step-number step-button theme-background-highlight">3</div>
                  <div className="step-body">
                    {!canEdit ?
                      <p>{_("You don't have permission to upload a splat model to this task.")}</p>
                    :
                      <div className="splats-upload-area">
                        <button
                          ref={(el) => (this.uploadBtn = el)}
                          disabled={uploading || processing || !hasPointCloud}
                          type="button"
                          className="btn btn-primary"
                        >
                          <i className="glyphicon glyphicon-upload"></i> {_('Upload Splats Model')}
                        </button>
                        <span className="upload-hint">{ACCEPTED_EXTENSIONS.replace(/,/g, ", ")}</span>
                        {uploading && (
                          <div className="upload-progress-area">
                            <UploadProgressBar
                              progress={this.state.progress}
                              totalBytes={this.state.totalBytes}
                              totalBytesSent={this.state.totalBytesSent}
                              totalCount={1}
                              format={(perc) => {
                                if (parseFloat(perc) === 100) return _("Finalizing... please wait");
                                return `${perc}%`;
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={this.handleCancel}
                            >
                              <i className="glyphicon glyphicon-remove-circle"></i> {_('Cancel')}
                            </button>
                          </div>
                        )}
                        {processing && (
                          <div className="processing-area">
                            <i className="fa fa-circle-notch fa-spin fa-fw"></i> {this.state.processingStatus !== '' ? this.state.processingStatus : _("Processing splats...")}{this.state.processingProgress !== null ? ` (${this.state.processingProgress.toFixed(0)}%)` : ""}
                          </div>
                        )}
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-default" onClick={this.handleClose}>
                {_('Close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default SplatsDialog;
