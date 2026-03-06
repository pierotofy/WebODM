import React from 'react';
import '../css/ManageMediaDialog.scss';
import PropTypes from 'prop-types';
import ErrorMessage from './ErrorMessage';
import Dropzone from '../vendor/dropzone';
import csrf from '../django/csrf';
import UploadProgressBar from './UploadProgressBar';
import Utils from '../classes/Utils';
import { _, interpolate } from '../classes/gettext';

const MAX_FILE_SIZE = 128 * 1024 * 1024 * 1024; // 128 GB
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.tif,.tiff,.mp4,.mov,.avi,.mkv,.webm';

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
      editingDescription: null,
      descriptionValue: '',
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
      this.dz.on('uploadprogress', (file, progress, bytesSent) => {
        if (progress === 100) return;
        this.setState({ progress, totalBytes: file.size, totalBytesSent: bytesSent });
      });
      this.dz.on('complete', (file) => {
        if (file.status === 'success') {
          try {
            const resp = JSON.parse(file.xhr.response);
            if (resp.media) {
              this.setState({ media: resp.media, uploading: false, progress: 0 });
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

  notifyParent(media) {
    if (this.props.onMediaUpdated) this.props.onMediaUpdated(media);
  }

  handleDelete = (filename) => {
    if (!window.confirm(interpolate(_('Delete "%(filename)s"?'), { filename }))) return;

    $.ajax({
      url: `/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/manage/${encodeURIComponent(filename)}`,
      type: 'DELETE',
      dataType: 'json',
    })
      .done((resp) => {
        if (resp.media !== undefined) {
          this.setState({ media: resp.media || [] });
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

  render() {
    const { canEdit } = this.props;
    const { media, uploading, editingDescription } = this.state;

    return (
      <div ref={(el) => (this.modal = el)} className="modal manage-media-dialog" tabIndex="-1" data-backdrop="static">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <button type="button" className="close" onClick={this.handleClose}>
                <span>&times;</span>
              </button>
              <h4 className="modal-title">
                {_('Media')}
              </h4>
            </div>
            <div className="modal-body">
              <ErrorMessage bind={[this, 'error']} />

              {canEdit && (
                <div ref={(el) => (this.dropzoneEl = el)} className="media-upload-area">
                  <button
                    ref={(el) => (this.uploadBtn = el)}
                    disabled={uploading}
                    type="button"
                    className="btn btn-primary"
                  >
                <i className="glyphicon glyphicon-upload"></i> {_('Upload Files')}
                  </button>
                  <span className="upload-hint">
                    {_('Photos, panoramas, or videos')}
                  </span>
                  {uploading && (
                    <div className="upload-progress-area">
                      <UploadProgressBar
                        progress={this.state.progress}
                        totalBytes={this.state.totalBytes}
                        totalBytesSent={this.state.totalBytesSent}
                      />
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          if (this.dz) this.dz.removeAllFiles(true);
                          this.setState({ uploading: false, progress: 0 });
                        }}
                      >
                        <i className="glyphicon glyphicon-remove-circle"></i> {_('Cancel')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {media.length === 0 ? (
                <div className="text-center text-muted media-empty">
                  <i className="fa fa-photo-video fa-3x"></i>
                  <p>{_('No media files.')}</p>
                </div>
              ) : (
                <table className="table table-striped media-table">
                  <thead>
                    <tr>
                      <th></th>
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
                        <td title={this.typeLabel(entry.type)}>
                          <i className={"type-icon " + this.typeIcon(entry.type)}></i>
                        </td>
                        <td>
                          <a
                            href={`/api/projects/${this.props.projectId}/tasks/${this.props.task.id}/media/download/${encodeURIComponent(entry.filename)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {entry.filename}
                          </a>
                        </td>
                        <td>
                          {editingDescription === entry.filename ? (
                            <div className="description-edit">
                              <input
                                type="text"
                                className="form-control input-sm"
                                value={this.state.descriptionValue}
                                onChange={(e) => this.setState({ descriptionValue: e.target.value })}
                                maxLength={1024}
                              />
                              <button
                                className="btn btn-xs btn-primary"
                                onClick={() => this.saveDescription(entry.filename)}
                              >
                                <i className="fa fa-check"></i>
                              </button>
                              <button
                                className="btn btn-xs btn-default btn-cancel-descr"
                                onClick={this.cancelEditDescription}
                              >
                                <i className="fa fa-times"></i>
                              </button>
                            </div>
                          ) : (
                            <span>
                              {entry.description || <em className="text-muted">{_('None')}</em>}
                              {canEdit && (
                                <a
                                  href="javascript:void(0)"
                                  className="edit-desc-link"
                                  onClick={() => this.startEditDescription(entry)}
                                  title={_('Edit description')}
                                >
                                  <i className="fa fa-pencil-alt fa-xs"></i>
                                </a>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          {entry.geolocation
                            ? `${entry.geolocation[1].toFixed(5)}, ${entry.geolocation[0].toFixed(5)}`
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>{Utils.bytesToSize(entry.size)}</td>
                        {canEdit && (
                          <td>
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
              )}
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
