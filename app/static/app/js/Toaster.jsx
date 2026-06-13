import './css/Toaster.scss';
import React from 'react';
import PropTypes from 'prop-types';
import { _, interpolate } from './classes/gettext';
import PluginsAPI from './classes/plugins/API';
import Storage from './classes/Storage';
import update from 'immutability-helper';
import Workers from './classes/Workers';
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
}

class ToasterTask extends React.Component {
    static propTypes = {
        task: PropTypes.object.isRequired,
        onUpdate: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    constructor(props) {
        super(props);

        this.state = {
            task: props.task
        }
    }

    onCancel = () => {
        Workers.cancel(this.props.task.workerId, () => {
            this.props.onCancel(this.props.task);
        });
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

        if (!task.output) {
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
                        task.ready = true;
                        this.updateTask(task);

                        Workers.getOutput(task.workerId, (err, output) => {
                            if (err) task.error = err;
                            else task.output = output;

                            this.updateTask(task);
                        });
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

    render() {
        const { task, onCancel } = this.props;
        return <div className="toaster-task theme-border-highlight-9">
            <div className="toaster-task-label">
                <i className={task.icon}></i> {task.name}
            </div>
            <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Cancel")} onClick={this.onCancel}><i className="fa fa-times"></i></a>
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

        const tasksDump = JSON.stringify(this.state.tasks);
        if (tasksDump !== JSON.stringify(prevState.tasks)) {
            Storage.setItem("toaster_tasks", tasksDump);
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

        t.name = t.name || `${_("Task")} ${t.workerId}`;
        t.action = t.action || "process";
        t.icon = t.icon || "fa fa-cog fa-spin fa-fw";

        this.setState(update(this.state, {
            tasks: { $push: [t] }
        }));
    }

    handleRemoveTask = t => {
        if (!t.workerId) return;

        const tasks = this.state.tasks.filter(t => t.workerId !== t.workerId);
        this.setState({ tasks });
    }

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    close = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.setState({ expanded: false });
    }

    handleTaskUpdate = (t) => {
        return (task) => {
            const { tasks } = this.state;
            for (let i = 0; i < tasks.length; i++) {
                if (tasks[i].workerId === t.workerId) tasks[i] = task;
                break;
            }
            this.setState({ tasks });
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
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-toggle theme-background-highlight-8-hover" title={_("Minimize")} onClick={this.toggleExpanded}><i className={expanded ? "fa fa-caret-down" : "fa fa-caret-up"}></i></a>
                    <a href="javascript:void(0);" className="toaster-btn toaster-btn-close theme-background-highlight-8-hover" title={_("Close")} onClick={this.close}><i className="fa fa-times"></i></a>
                </div>

            </div>
            <div className={"toaster-body " + (expanded ? "expanded" : "")}>
                {tasks.map((t, idx) =>
                    <ToasterTask key={`task-${idx}`} task={t} onUpdate={this.handleTaskUpdate(t)} onCancel={this.handleRemoveTask} />
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
