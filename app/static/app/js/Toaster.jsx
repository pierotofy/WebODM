import './css/Toaster.scss';
import React from 'react';
import PropTypes from 'prop-types';
import { _, interpolate } from './classes/gettext';
import PluginsAPI from './classes/plugins/API';
import Storage from './classes/Storage';
import update from 'immutability-helper';
import $ from 'jquery';

class Toaster extends React.Component {
    static defaultProps = {
    };

    static propTypes = {
    };

    constructor(props) {
        super(props);

        let tasks = [];
        try {
            tasks = JSON.parse(Storage.getItem("toaster_tasks") || "[]");
        }catch(e){
            console.warn(`Cannot restore workers task: ${e}`);
        }

        this.state = {
            visible: tasks.length > 0,
            expanded: !!Storage.getItem("toaster_expanded"),
            tasks
        };
    }

    componentDidMount(){
        PluginsAPI.Workers.onAddTask(this.handleAddTask);
        PluginsAPI.Workers.onRemoveTask(this.handleRemoveTask);
    }

    componentWillUnmount(){
        PluginsAPI.Workers.offAddTask(this.handleAddTask);
        PluginsAPI.Workers.offRemoveTask(this.handleRemoveTask);
    }

    componentDidUpdate(prevProps, prevState){
        // Save state changes so that on reload the UI looks the same
        
        const tasksDump = JSON.stringify(this.state.tasks);
        if (tasksDump !== JSON.stringify(prevState.tasks)){
            Storage.setItem("toaster_tasks", tasksDump);
        }

        if (this.state.expanded !== prevState.expanded){
            Storage.setItem("toaster_expanded", this.state.expanded ? "1" : "0");
        }

        if (this.state.tasks.length !== prevState.tasks.length){
            this.setState({visible: this.state.tasks.length > 0});
        }
    }

    handleAddTask = t => {
        if (!t.workerId) return;

        this.setState(update(this.state, {
            tasks: {$push: [t]}
        }));
    }

    handleRemoveTask = t => {
        if (!t.workerId) return;

        const tasks = this.state.tasks.filter(t => t.workerId !== t.workerId);
        this.setState({tasks});
    }

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    close = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.setState({ expanded: false });
    }

    cancelTask = (t) => {
        return () => {
            console.log("Cancel", t);
        };
    }

    render() {
        const { expanded, tasks, visible } = this.state;
        let verb = _("Sharing"); // TODO: read from all items

        if (!visible) return null;

        return <div className="global-toaster theme-secondary  theme-border-highlight-8">
            <div className="toaster-header theme-background-highlight theme-background-highlight-hover" onClick={this.toggleExpanded}>
                <div className="toaster-title">
                    {verb} ({tasks.length})
                </div>

                <div className="toaster-controls">
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-toggle theme-background-highlight-8-hover" title={_("Minimize")} onClick={this.toggleExpanded}><i className={expanded ? "fa fa-caret-down" : "fa fa-caret-up"}></i></a>
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Close")} onClick={this.close}><i className="fa fa-times"></i></a>
                </div>

            </div>
            {expanded && <div className="toaster-body">
                {tasks.map(t =>
                    <div className="toaster-task theme-border-highlight-9">
                        Status message <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Cancel")} onClick={this.cancelTask(t)}><i className="fa fa-times"></i></a>
                    </div>
                )}
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
