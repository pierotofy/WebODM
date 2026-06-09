import './css/Toaster.scss';
import React from 'react';
import PropTypes from 'prop-types';
import { _, interpolate } from './classes/gettext';
import $ from 'jquery';

class Toaster extends React.Component {
    static defaultProps = {
    };

    static propTypes = {
    };

    constructor(props) {
        super(props);
        this.state = {
            expanded: false
        };
    }

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    close = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.setState({ expanded: false });
        
    }

    render() {
        const { items, visible } = this.props;
        const { expanded } = this.state;
        let tasksCount = 0;
        let verb = _("Sharing"); // TODO: read from all items



        return <div className="global-toaster theme-secondary  theme-border-highlight-8">
            <div className="toaster-header theme-background-highlight theme-background-highlight-hover" onClick={this.toggleExpanded}>
                <div className="toaster-title">
                    {verb} ({tasksCount})
                </div>

                <div className="toaster-controls">
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-toggle theme-background-highlight-8-hover" title={_("Minimize")} onClick={this.toggleExpanded}><i className={expanded ? "fa fa-caret-down" : "fa fa-caret-up"}></i></a>
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Close")} onClick={this.close}><i className="fa fa-times"></i></a>
                </div>

            </div>
            {expanded && <div className="toaster-body">
                OK!
            </div>}
        </div>;
    }
}

$(function () {
    const $el = $("#global-toaster");
    const props = $el.data();
    delete (props.toaster);
    window.ReactDOM.render(<Toaster {...props} />, $el.get(0));
});

export default Toaster;
