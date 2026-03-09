import React from 'react';
import '../css/ManageMediaDialog.scss';
import PropTypes from 'prop-types';
import ErrorMessage from './ErrorMessage';
import Dropzone from '../vendor/dropzone';
import csrf from '../django/csrf';
import UploadProgressBar from './UploadProgressBar';
import Utils from '../classes/Utils';
import FullscreenView from './FullscreenView';
import { _, interpolate } from '../classes/gettext';

const MAX_FILE_SIZE = 128 * 1024 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.tif,.tiff,.mp4,.mov,.avi,.mkv,.webm';
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff']);

class ManageMediaDialog extends React.Component {
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
    onMediaUpdated: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = {
      error: '',
      media: props.task.media,
      uploading: false,
      progress: 0,
      totalBytes: 0,
      totalBytesSent: 0,
      totalCount: 0,
      editingDescription: null,
      descriptionValue: '',
      viewMode: 'grid'
    };
  }

  componentDidMount() {
    this._mounted = true;
    $(this.modal).modal('show');
    $(this.modal).on('hidden.bs.modal', () => {
      if (this._mounted) this.props.onClose();
    });

    if (this.props.canEdit && this.dropzoneEl) {
      Dropzone.autoDiscover = false;
      this.dz = new Dropzone(this.dropzoneEl, {
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

      this.dz.on('error', () => {
        if (this.state.uploading)
          this.setState({ error: _('Upload failed. Check your connection and try again.') });
      });
      this.dz.on('sending', () => {
        this.setState({ uploading: true, error: '' });
      });
      this.dz.on('addedfile', (file) => {
        this.setState({ totalCount: this.dz.files.length });
      });
      this.dz.on('uploadprogress', (file, progress, bytesSent) => {
        if (progress === 100) return;
        this.setState({ progress, totalBytes: file.size, totalBytesSent: bytesSent });
      });
      this.dz.on('complete', (file) => {
        if (file.status === 'success') {
          try {
            const resp = JSON.parse(file.xhr.response);
            if (resp.media) {
              this.setState({ media: resp.media, uploading: false, progress: 0, totalCount: 0 });
              this.notifyParent(resp.media);
            }
          } catch (e) {
            this.setState({ error: _('Invalid server response.'), uploading: false });
          }
        } else {
          this.setState({ uploading: false, error: _('Upload failed.') });
        }
      });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this.dz) {
      this.dz.destroy();
      this.dz = null;
    }
    $(this.modal).off('hidden.bs.modal').modal('hide');
  }

  uploadUrl() {
    return `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/upload`;
  }

  downloadUrl(filename) {
    return `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/download/${encodeURIComponent(filename)}`;
  }

  notifyParent(media) {
    if (this.props.onMediaUpdated) this.props.onMediaUpdated(media);
  }

  handleDelete = (filename) => {
    if (!window.confirm(interpolate(_('Are you sure you want to delete %(filename)s ?'), { filename }))) return;

    $.ajax({
      url: `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/manage/${encodeURIComponent(filename)}`,
      type: 'DELETE',
      dataType: 'json',
    })
      .done((resp) => {
        if (resp.media !== undefined) {
          this.setState({ media: resp.media });
          this.notifyParent(resp.media);
        }
      })
      .fail(() => {
        this.setState({ error: _('Cannot delete file.') });
      });
  };

  startEditDescription = (entry) => {
    this.setState({ editingDescription: entry.filename, descriptionValue: entry.description || '' });
  };

  cancelEditDescription = () => {
    this.setState({ editingDescription: null, descriptionValue: '' });
  };

  saveDescription = (filename) => {
    $.ajax({
      url: `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/manage/${encodeURIComponent(filename)}`,
      type: 'PATCH',
      contentType: 'application/json',
      data: JSON.stringify({ description: this.state.descriptionValue }),
      dataType: 'json',
    })
      .done((resp) => {
        if (resp.media) {
          this.setState({ media: resp.media, editingDescription: null, descriptionValue: '' });
          this.notifyParent(resp.media);
        }
      })
      .fail(() => {
        this.setState({ error: _('Cannot update description.') });
      });
  };

  handleClose = () => {
    $(this.modal).modal('hide');
  };

  typeIcon(type) {
    if (type === 'video') return 'fa fa-video';
    if (type === 'pano') return 'fa fa-globe';
    return 'fa fa-camera';
  }

  typeLabel(type) {
    if (type === 'video') return _('Video');
    if (type === 'pano') return _('Panorama');
    return _('Photo');
  }

  hasThumb(entry) {
    const ext = (entry.filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    return PHOTO_EXTS.has(ext);
  }

  renderUploadArea() {
    const { canEdit } = this.props;
    const { uploading } = this.state;
    if (!canEdit) return null;

    return (
      <div ref={(el) => (this.dropzoneEl = el)} className="media-upload-area">
        <button
          ref={(el) => (this.uploadBtn = el)}
          disabled={uploading}
          type="button"
          className="btn btn-primary"
        >
          <i className="glyphicon glyphicon-upload"></i> {_('Upload Files')}
        </button>
        <span className="upload-hint">{_('Photos, panoramas, or videos')}</span>
        {uploading && (
          <div className="upload-progress-area">
            <UploadProgressBar
              progress={this.state.progress}
              totalBytes={this.state.totalBytes}
              totalBytesSent={this.state.totalBytesSent}
              totalCount={this.state.totalCount}
            />
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (this.dz) this.dz.removeAllFiles(true);
                this.setState({ uploading: false, progress: 0, totalCount: 0 });
              }}
            >
              <i className="glyphicon glyphicon-remove-circle"></i> {_('Cancel')}
            </button>
          </div>
        )}
      </div>
    );
  }

  renderEmpty() {
    return (
      <div className="media-empty">
        <i className="far fa-images"></i>
        <p>{_('No media files.')}</p>
      </div>
    );
  }

  renderViewToggle() {
    const { viewMode } = this.state;
    return (
      <div className="view-toggle">
        <button
          className={'btn btn-xs' + (viewMode === 'grid' ? ' btn-primary' : ' btn-default')}
          onClick={() => this.setState({ viewMode: 'grid' })}
          title={_('Grid view')}
        >
          <i className="fa fa-th"></i>
        </button>
        <button
          className={'btn btn-xs' + (viewMode === 'list' ? ' btn-primary' : ' btn-default')}
          onClick={() => this.setState({ viewMode: 'list' })}
          title={_('List view')}
        >
          <i className="fa fa-list"></i>
        </button>
      </div>
    );
  }

  renderDescriptionCell(entry) {
    const { canEdit } = this.props;
    const { editingDescription } = this.state;

    if (editingDescription === entry.filename) {
      return (
        <div className="description-edit">
          <input
            type="text"
            className="form-control input-sm"
            value={this.state.descriptionValue}
            onChange={(e) => this.setState({ descriptionValue: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') this.saveDescription(entry.filename); }}
            maxLength={1024}
            autoFocus
          />
          <button className="btn btn-xs btn-primary" onClick={() => this.saveDescription(entry.filename)}>
            <i className="fa fa-check"></i>
          </button>
          <button className="btn btn-xs btn-default" onClick={this.cancelEditDescription} style={{paddingRight: "7px", paddingLeft: "7px"}}>
            <i className="fa fa-times"></i>
          </button>
        </div>
      );
    }
    return (
      <span className="description-display">
        {entry.description || ""}
        {canEdit && (
          <a href="javascript:void(0)" className="edit-desc-link" onClick={() => this.startEditDescription(entry)} title={_('Edit')}>
            <i className={"fa " + (entry.description ? "fa-pencil-alt" : "fa-plus-circle")}></i>
          </a>
        )}
      </span>
    );
  }

  renderGrid() {
    const { canEdit } = this.props;
    const { media } = this.state;

    return (
      <div className="media-grid">
        {media.map((entry) => (
          <div key={entry.filename} className="media-card">
              {this.hasThumb(entry) ? (
                <FullscreenView imageUrl={this.downloadUrl(entry.filename)} thumbSize={256} alt={entry.filename} />
              ) : (
                <div className="card-icon-placeholder">
                  <i className={this.typeIcon(entry.type)}></i>
                </div>
              )}
              <div className="card-details theme-secondary-complementary">
                <div className="card-filename" title={entry.filename}>
                  <a href={this.downloadUrl(entry.filename)}>
                    {entry.filename}
                  </a>
                </div>
              </div>
            {canEdit && (
              <button
                className="card-delete-btn btn btn-xs btn-danger"
                onClick={() => this.handleDelete(entry.filename)}
                title={_('Delete')}
              >
                <i className="fa fa-trash"></i>
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  renderList() {
    const { canEdit } = this.props;
    const { media } = this.state;

    return (
      <table className="table table-striped media-table">
        <thead>
          <tr>
            <th className="col-type"></th>
            <th>{_('Filename')}</th>
            <th>{_('Description')}</th>
            <th>{_('Location')}</th>
            <th>{_('Size')}</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {media.map((entry) => (
            <tr key={entry.filename}>
              <td>
                <i className={this.typeIcon(entry.type)}></i>
              </td>
              <td>
                <a href={this.downloadUrl(entry.filename)} target="_blank" rel="noopener noreferrer">
                  {entry.filename}
                </a>
              </td>
              <td>{this.renderDescriptionCell(entry)}</td>
              <td>
                {entry.geolocation
                  ? `${entry.geolocation[1].toFixed(5)}, ${entry.geolocation[0].toFixed(5)}`
                  : <span className="text-muted">—</span>}
              </td>
              <td>{Utils.bytesToSize(entry.size)}</td>
              {canEdit && (
                <td style={{textAlign: "right"}}>
                  <button
                    className="btn btn-xs btn-danger"
                    onClick={() => this.handleDelete(entry.filename)}
                    title={_('Delete')}
                  >
                    <i className="fa fa-trash"></i>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  render() {
    const { media, viewMode } = this.state;

    return (
      <div ref={(el) => (this.modal = el)} className="modal manage-media-dialog" tabIndex="-1" data-backdrop="static">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <button type="button" className="close" onClick={this.handleClose}>
                <span>&times;</span>
              </button>
              <h4 className="modal-title">{_('Media')}</h4>
            </div>
            <div className="modal-body">
              <ErrorMessage bind={[this, 'error']} />
              {this.renderUploadArea()}
              {media.length === 0
                ? this.renderEmpty()
                : (
                  <div>
                    <div className="media-toolbar">
                      {this.renderViewToggle()}
                    </div>
                    {viewMode === 'grid' ? this.renderGrid() : this.renderList()}
                  </div>
                )
              }
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

export default ManageMediaDialog;
