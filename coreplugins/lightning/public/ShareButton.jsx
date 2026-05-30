import React from 'react';
import PropTypes from 'prop-types';
import { _ } from 'webodm/classes/gettext';
import ShareDialog from './ShareDialog';

export default class ShareButton extends React.Component {
    static defaultProps = {
        task: null,
        apiKey: '',
        apiBase: 'https://webodm.net'
    };

    static propTypes = {
        task: PropTypes.object.isRequired,
        apiKey: PropTypes.string.isRequired,
        apiBase: PropTypes.string
    };

    constructor(props) {
        super(props);

        this.state = {
        };
    }

    componentDidMount() {

    }

    componentWillUnmount() {

    }

    handleShare = () => {
        this.dialog.show();
    }

    render() {
        const { task } = this.props;

        return (
            <div className="share-button">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={this.handleShare}>
                    <i className="fa fa-bolt"></i>&nbsp;
                    {_("Share")}
                </button>

                <ShareDialog
                    ref={domNode => { this.dialog = domNode; }}
                    task={task}
                    apiKey={this.props.apiKey}
                    apiBase={this.props.apiBase}
                />
            </div>
        );
    }
}
