PluginsAPI.Dashboard.addNewTaskPanelItem([
    'lightning/build/CostEstimateItem.js',
    'lightning/build/CostEstimateItem.css',
],function(args, CostEstimateItem){
    return CostEstimateItem;
});

{% if share_enabled %}
PluginsAPI.Dashboard.addTaskActionButton([
    'lightning/build/ShareButton.js'
],function(args, ShareButton){
	var task = args.task;

	if (task.available_assets !== null && task.available_assets.length > 0){
		return React.createElement(ShareButton, {task: task, apiKey: "${api_key}"});
	}
});
{% endif %}