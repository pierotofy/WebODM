import React from 'react';
import PropTypes from 'prop-types';
import ErrorMessage from 'webodm/components/ErrorMessage';
import { _ } from 'webodm/classes/gettext';
// import ShareDialog from './components/ShareDialog';
import $ from 'jquery';

export default class ShareButton extends React.Component {
    static defaultProps = {
        task: null,
        apiKey: ''
    };

    static propTypes = {
        task: PropTypes.object.isRequired,
        apiKey: PropTypes.string.isRequired
    };

    constructor(props) {
        super(props);

        this.state = {
            showDialog: false
        };
    }

    componentDidMount() {

    }

    componentWillUnmount() {

    }

    handleClick = () => {
    }

    handleClose = () => {
        this.setState({ showDialog: false });
    };

    render() {
        const { task } = this.props;
        const { showDialog } = this.state;

        return (
            <div className="share-button">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={this.handleClick}>
                    <i className="fa fa-bolt"></i>&nbsp;
                    {_("Share")}
                </button>

                {/* <ShareDialog
                    show={showDialog}
                    onHide={this.handleDialogHide}
                    onShare={this.handleShare}
                    apiURL="/api/plugins/dronedb"
                    taskName={task.name}
                    filesToShare={filesToShare}
                /> */}
            </div>
        );
    }
}
