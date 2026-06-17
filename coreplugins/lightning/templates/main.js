PluginsAPI.Dashboard.addNewTaskPanelItem([
    'lightning/build/CostEstimateItem.js',
    'lightning/build/CostEstimateItem.css',
],function(args, CostEstimateItem){
    return function(props){
        return React.createElement(CostEstimateItem, Object.assign({}, props, { apiBase: "{{ api_base }}"}));
    }
});

{% if share_enabled %}
PluginsAPI.Dashboard.addTaskActionButton([
    'lightning/build/ShareButton.js',
    'lightning/build/ShareButton.css'
],function(args, ShareButton){
	var task = args.task;
	if ("{{ api_key }}" && task && task.available_assets !== null && task.available_assets.length > 0 && task.status === 40 /* completed */){
		return React.createElement(ShareButton, {apiBase: "{{ api_base }}", task: task, apiKey: "{{api_key }}"});
	}
});
{% endif %}