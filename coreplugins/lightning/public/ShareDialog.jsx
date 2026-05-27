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

    reset = () => {
      this.setState({
        error: ""
      });
    }

    getFormData = () => {
      return {

      };
    }

    onShow = () => {

    }

    show = () => {
      this.dialog.show();
    }

    hide = () => {
      this.dialog.hide();
    }

    render(){
        return (
            <FormDialog {...this.props}
              title={_("Share to Lightning")}
              getFormData={this.getFormData}
              reset={this.reset}
              onShow={this.onShow}
              ref={(domNode) => { this.dialog = domNode; }}>
              <ErrorMessage bind={[this, "error"]} />
              <div className="form-group lightning-share-dialog">
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
              </div>
            </FormDialog>
        );
    }
}

export default ShareDialog;