import './css/Toaster.scss';
import React from 'react';
import PropTypes from 'prop-types';
import { _, interpolate } from './classes/gettext';
import PluginsAPI from './classes/plugins/API';
import Storage from './classes/Storage';
import update from 'immutability-helper';
import Workers from './classes/Workers';
import Css from './classes/Css';
import $ from 'jquery';

const ACTION_LABELS = {
    'ready':{
        'process': _("Processed"),
        'share': _("Shared"),
        'export': _("Exported")
    },
    'progress':{
        'process': _("Processing"),
        'share': _("Sharing"),
        'export': _("Exporting")
    }
};

const ACTION_ICONS = {
    'process': "fa fa-cog fa-spin fa-fw",
    'share': "fa fa-upload toaster-share-pulse",
    'export': "glyphicon glyphicon-download"
};

const shouldCheck = (task) => {
    return !task.ready && !task.canceled && !task.error;
}

class ToasterTask extends React.Component {
    static propTypes = {
        task: PropTypes.object.isRequired,
        onUpdate: PropTypes.func.isRequired,
        onRemove: PropTypes.func.isRequired
    };

    constructor(props) {
        super(props);

        this.state = {
            task: props.task
        };

        this.backgroundSuccessColor = Css.getValue('theme-background-success', 'backgroundColor');
    }

    onRemove = () => {
        const { task } = this.state;
        if (!task.ready && !task.canceled && !task.error){
            Workers.cancel(this.props.task.workerId, () => {
                this.props.onRemove(this.props.task);
            });
        }else{
            // No need to cancel, just remove
            this.props.onRemove(this.props.task);
        }
    }

    componentDidMount() {
        this.mounted = true;
        this.check();
    }

    updateTask = (task) => {
        this.setState({ task });
        this.props.onUpdate(task);
    }

    

    check = () => {
        if (!this.mounted) return;

        const { task } = this.state;

        const checkUrl = "/api/workers/check/";
        let errorCount = 0;
        let url = checkUrl + task.workerId;

        if (shouldCheck(task)) {
            const doCheck = () => {
                if (!this.mounted) return;

                this.checkReq = $.ajax({
                    type: 'GET',
                    url
                }).done(result => {
                    if (!this.mounted) return;

                    if (result.error) {
                        task.error = result.error;
                        this.updateTask(task);
                    } else if (result.ready) {
                        Workers.getOutput(task.workerId, (err, _, result) => {
                            if (err) task.error = err;
                            else{
                                if (result.output) task.output = result.output;
                                else if (result.link) task.link = result.link;
                            }
                            
                            task.ready = true;
                            this.updateTask(task);
                        });
                    } else if (result.canceled){
                        task.canceled = true;
                        this.updateTask(task);
                    } else {
                        if (result.progress !== undefined && result.status !== undefined) {
                            task.status = result.status;
                            task.progress = result.progress;
                            this.updateTask(task);
                        }
                        // Check again in a bit
                        if (this.mounted) setTimeout(() => doCheck(), 2000);
                    }
                }).fail(error => {
                    if (!this.mounted) return;
                    console.warn(error);
                    if (errorCount++ < 10) setTimeout(() => doCheck(), 2000);
                    else {
                        task.error = error.statusText;
                        this.updateTask(task);
                    }
                });
            };
            doCheck();
        }


    }

    componentWillUnmount() {
        if (this.checkReq) {
            this.checkReq.abort();
        }
        this.mounted = false;
    }

    handleTaskClick = (task) => {
        return () => {
            if (task.link){
                location.href = task.link;
                this.onRemove();
            }
        }
    }

    render() {
        const { task } = this.props;
        let icon = ACTION_ICONS[task.action] || ACTION_ICONS['process'];
        if (task.canceled) icon = "fa fa-ban";
        if (task.ready) icon = "fa fa-check";
        if (task.error) icon = "fa fa-exclamation-triangle";

        let label = task.name;
        if (task.error) label = `${task.name} - ${task.error}`;

        let background = "";
        if (task.progress !== undefined) {
            if (shouldCheck(task)){
                background = `linear-gradient(90deg, ${this.backgroundSuccessColor} ${task.progress}%, rgba(255, 255, 255, 0) ${task.progress}%)`;
            }
            if ((task.ready || task.canceled) && !task.error) background = '';
        }

        return <div className="toaster-task theme-border-highlight-9" style={{background}}>
            <div className="toaster-task-label" onClick={this.handleTaskClick(task)}>
                <i className={icon} title={task.error || task.status || task.name}></i> <div title={label} className="task-toaster-label-text">{label}</div>
            </div>
            <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" onClick={this.onRemove}><i className="fa fa-times"></i></a>
        </div>;
    }
}

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
        } catch (e) {
            console.warn(`Cannot restore workers task: ${e}`);
        }

        this.state = {
            visible: tasks.length > 0,
            expanded: Storage.getItem("toaster_expanded") === "1",
            tasks
        };
    }

    componentDidMount() {
        PluginsAPI.Workers.onAddTask(this.handleAddTask);
        PluginsAPI.Workers.onRemoveTask(this.handleRemoveTask);
    }

    componentWillUnmount() {
        PluginsAPI.Workers.offAddTask(this.handleAddTask);
        PluginsAPI.Workers.offRemoveTask(this.handleRemoveTask);
    }

    componentDidUpdate(prevProps, prevState) {
        // Save state changes so that on reload the UI looks the same
        if (prevState.tasks !== this.state.tasks) {
            Storage.setItem("toaster_tasks", JSON.stringify(this.state.tasks));
        }

        if (this.state.expanded !== prevState.expanded) {
            Storage.setItem("toaster_expanded", this.state.expanded ? "1" : "0");
        }

        if (this.state.tasks.length !== prevState.tasks.length) {
            this.setState({ visible: this.state.tasks.length > 0 });
        }
    }

    handleAddTask = t => {
        if (!t.workerId) return;

        if (this.state.tasks.find(x => x.workerId === t.workerId)) return; // duplicate

        t.name = t.name || `${_("Task")} ${t.workerId}`;
        t.action = t.action || "process";

        this.setState(update(this.state, {
            tasks: { $unshift: [t] }
        }));
    }

    handleRemoveTask = t => {
        if (!t.workerId) return;

        const tasks = this.state.tasks.filter(x => x.workerId !== t.workerId);
        this.setState({ tasks });
    }

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    close = (e) => {
        e.stopPropagation();
        e.preventDefault();

        const { tasks } = this.state;
        if (tasks.find(t => shouldCheck(t))){
            if (window.confirm(_("Are you sure you want to cancel the tasks?"))){
                tasks.forEach(t => {
                    if (shouldCheck(t)) Workers.cancel(t.workerId);
                });

                // Don't wait for results / check for errors, just assume it worked.
                this.setState({tasks: []});
            }
        }else{
            this.setState({tasks: []});
        }
    }

    handleTaskUpdate = (t) => {
        return (task) => {
            const { tasks } = this.state;
            // Recreate array to trigger state update
            this.setState({ tasks: tasks.map(x => x.workerId === t.workerId ? {...task} : x ) });
        };
    }

    findCommonVerb = (tasks) => {
        let action = 'process';
        let stage = 'progress';

        const actions = tasks.reduce((acc, t) => {
            acc[t.action] = true;
            return acc;
        }, {});
        if (Object.keys(actions).length === 1) action = Object.keys(actions)[0];
        if (tasks.every(t => t.ready)) stage = 'ready';
        
        return ACTION_LABELS[stage][action];
    }

    render() {
        const { expanded, tasks, visible } = this.state;
        let verb = this.findCommonVerb(tasks);

        if (!visible) return null;

        return <div className="global-toaster theme-secondary  theme-border-highlight-8">
            <div className="toaster-header theme-background-highlight theme-background-highlight-hover" onClick={this.toggleExpanded}>
                <div className="toaster-title">
                    {verb} ({tasks.length})
                </div>

                <div className="toaster-controls">
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-toggle theme-background-highlight-8-hover" onClick={this.toggleExpanded}><i className={expanded ? "fa fa-caret-down" : "fa fa-caret-up"}></i></a>
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Close")} onClick={this.close}><i className="fa fa-times"></i></a>
                </div>

            </div>
            <div className={"toaster-body " + (expanded ? "expanded" : "")}>
                {tasks.map(t =>
                    <ToasterTask key={`task-${t.workerId}`} task={t} onUpdate={this.handleTaskUpdate(t)} onRemove={this.handleRemoveTask} />
                )}
            </div>
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
