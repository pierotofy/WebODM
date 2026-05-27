import React from 'react';
import FormDialog from 'webodm/components/FormDialog';
import PropTypes from 'prop-types';
import './ShareDialog.scss';
import ErrorMessage from 'webodm/components/ErrorMessage';
import { _ } from 'webodm/classes/gettext';

class ShareDialog extends React.Component {
    static defaultProps = {
      apiKey: "",
      task: null,
    };

    static propTypes = {
        task: PropTypes.object.isRequired,
        apiKey: PropTypes.string.isRequired
    };

    constructor(props){
        super(props);

        this.state = {
          error: "",
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

    reset(){
      this.setState({
        error: ""
      });
    }

    getFormData(){
      return {

      };
    }

    onShow(){

    }

    show(){
      this.dialog.show();
    }

    hide(){
      this.dialog.hide();
    }

    render(){
        return (
            <FormDialog {...this.props}
                getFormData={this.getFormData}
                reset={this.reset}
                onShow={this.onShow}
                ref={(domNode) => { this.dialog = domNode; }}>
              <ErrorMessage bind={[this, "error"]} />
              <div className="form-group lightning-share-dialog">
                <label className="col-sm-2 control-label">{_("Name")}</label>
                <div className="col-sm-10 name-fields">
                  <input type="text" className="form-control" ref={(domNode) => { this.nameInput = domNode; }} value={this.state.name} onChange={this.handleChange('name')} onKeyPress={e => this.dialog.handleEnter(e)} />
                  <button type="button" title={_("Add tags")} onClick={this.toggleTagsField} className="btn btn-sm btn-secondary toggle-tags">
                    <i className="fa fa-tag"></i>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="col-sm-2 control-label">{_("Description (optional)")}</label>
                <div className="col-sm-10">
                  <textarea className="form-control" rows="3" value={this.state.descr} onChange={this.handleChange('descr')} />
                </div>
              </div>
            </FormDialog>
        );
    }
}

export default ShareDialog;