(function($) {
    "use strict";

    if (typeof $ === "undefined") return;

    var STATUS_LABELS = {
        10: {label: "Queued", cls: "QUEUED"},
        20: {label: "Running", cls: "RUNNING"},
        30: {label: "Failed", cls: "FAILED"},
        40: {label: "Completed", cls: "COMPLETED"},
        50: {label: "Canceled", cls: "CANCELED"}
    };

    function statusInfo(status) {
        if (status === null || status === undefined) {
            return {label: "Uploading", cls: "QUEUED"};
        }
        return STATUS_LABELS[status] || {label: "Unknown", cls: ""};
    }

    function formatSize(mb) {
        mb = mb || 0;
        if (mb < 1) return Math.round(mb * 1024) + " KB";
        if (mb < 1024) return mb.toFixed(1) + " MB";
        return (mb / 1024).toFixed(2) + " GB";
    }

    function escapeHtml(str) {
        return $("<div>").text(str === null || str === undefined ? "" : str).html();
    }

    function TaskManager(root) {
        this.$root = root;
        this.$tbody = root.find("#tm-tbody");
        this.$table = root.find("#tm-table");
        this.$loading = root.find("#tm-loading");
        this.$error = root.find("#tm-error");
        this.$total = root.find("#tm-total-value");
        this.$pagination = root.find("#tm-pagination");
        this.$pageInfo = root.find("#tm-page-info");
        this.$prevPage = root.find("#tm-prev-page");
        this.$nextPage = root.find("#tm-next-page");

        this.page = 1;
        this.ordering = "project";

        this._bindEvents();
        this.load();
    }

    TaskManager.prototype._bindEvents = function() {
        var self = this;

        this.$root.find("#tm-refresh").on("click", function() {
            self.load();
        });

        this.$root.find("thead").on("click", ".tm-sortable", function() {
            var field = $(this).data("field");
            self.ordering = (self.ordering === field) ? "-" + field : field;
            self.page = 1;
            self.load();
        });

        this.$prevPage.on("click", function() {
            if (self.page > 1) {
                self.page -= 1;
                self.load();
            }
        });

        this.$nextPage.on("click", function() {
            if (self.page < (self.numPages || 1)) {
                self.page += 1;
                self.load();
            }
        });

        this.$tbody.on("click", ".tm-compact", function() {
            var $btn = $(this);
            var msg = "Compacting will free disk space by permanently deleting the original images " +
                "and intermediate files used for processing. It will no longer be possible to " +
                "restart this task. Maps and models will remain in place. Continue?";
            if (!window.confirm(msg)) return;
            self._runAction("compact", $btn);
        });

        this.$tbody.on("click", ".tm-delete", function() {
            var $btn = $(this);
            var msg = "All information related to this task, including images, maps and " +
                "models, will be permanently deleted. Continue?";
            if (!window.confirm(msg)) return;
            self._runAction("remove", $btn);
        });
    };

    TaskManager.prototype._runAction = function(action, $btn) {
        var self = this;
        var projectId = $btn.data("project");
        var taskId = $btn.data("task");

        $btn.prop("disabled", true).find("i").addClass("fa-spin");

        $.ajax({
            url: "/api/projects/" + projectId + "/tasks/" + taskId + "/" + action + "/",
            type: "POST"
        }).done(function(res) {
            if (res && res.error) {
                window.alert(res.error);
                $btn.prop("disabled", false);
            } else {
                self.load();
            }
        }).fail(function(xhr) {
            var msg = "An error occurred while performing the action.";
            try {
                var res = JSON.parse(xhr.responseText);
                if (res && res.error) msg = res.error;
                else if (res && res.detail) msg = res.detail;
            } catch (e) { /* ignore */ }
            window.alert(msg);
            $btn.prop("disabled", false);
        });
    };

    TaskManager.prototype._setLoading = function(loading) {
        this.$loading.toggle(loading);
        this.$table.toggle(!loading);
    };

    TaskManager.prototype._rowHtml = function(row) {
        var canDelete = !!row.can_delete;
        var isCompacted = !!row.compacted;
        var canCompact = !!row.can_compact;
        var st = statusInfo(row.status);

        var actions = "";
        if (isCompacted) {
            actions += '<button type="button" class="btn btn-xs tm-compacted-state" disabled ' +
                'title="Compacted"><i class="fa fa-check"></i> Compacted</button>';
        } else if (canCompact) {
            actions += '<button type="button" class="btn btn-xs btn-default tm-compact" ' +
                'data-project="' + row.project_id + '" data-task="' + row.task_id + '" ' +
                'title="Compact"><i class="fa fa-database"></i> Compact</button>';
        }
        if (canDelete) {
            actions += '<button type="button" class="btn btn-xs btn-danger tm-delete" ' +
                'data-project="' + row.project_id + '" data-task="' + row.task_id + '" ' +
                'title="Delete"><i class="fa fa-trash"></i> Delete</button>';
        }
        if (actions === "") actions = '<span class="text-muted">&mdash;</span>';

        return '<tr>' +
            '<td class="tm-project-name">' + escapeHtml(row.project_name) + '</td>' +
            '<td>' + escapeHtml(row.owner_name) + '</td>' +
            '<td>' + escapeHtml(row.task_name || row.task_id) + '</td>' +
            '<td class="tm-status-' + st.cls + '">' + escapeHtml(st.label) + '</td>' +
            '<td>' + (row.images_count || 0) + '</td>' +
            '<td>' + formatSize(row.size) + '</td>' +
            '<td class="tm-actions">' + actions + '</td>' +
            '</tr>';
    };

    TaskManager.prototype._updateSortIndicators = function() {
        var self = this;
        this.$root.find("thead .tm-sortable").each(function() {
            var $th = $(this);
            var field = $th.data("field");
            var $icon = $th.find("i");
            $icon.removeClass("fa-sort fa-sort-up fa-sort-down");
            if (self.ordering === field) {
                $icon.addClass("fa-sort-up");
            } else if (self.ordering === "-" + field) {
                $icon.addClass("fa-sort-down");
            } else {
                $icon.addClass("fa-sort");
            }
        });
    };

    TaskManager.prototype._updatePagination = function(res) {
        this.numPages = res.num_pages || 1;

        var start = res.count === 0 ? 0 : (res.page - 1) * res.page_size + 1;
        var end = Math.min(res.page * res.page_size, res.count);
        this.$pageInfo.text(start + "\u2013" + end + " of " + res.count);

        this.$prevPage.prop("disabled", res.page <= 1);
        this.$nextPage.prop("disabled", res.page >= res.num_pages);
        this.$pagination.toggle(res.count > 0);
    };

    TaskManager.prototype._render = function(res) {
        var self = this;
        var html = "";

        (res.results || []).forEach(function(row) {
            html += self._rowHtml(row);
        });

        if (html === "") {
            html = '<tr><td colspan="7" class="text-center text-muted">No tasks found.</td></tr>';
        }

        this.$tbody.html(html);
        this.$total.text(formatSize(res.total_size));
        this._updateSortIndicators();
        this._updatePagination(res);
    };

    TaskManager.prototype.load = function() {
        var self = this;

        if (this._request) this._request.abort();

        this._setLoading(true);
        this.$error.hide();

        this._request = $.getJSON("tasks", {page: this.page, ordering: this.ordering}).done(function(res) {
            self.page = res.page || 1;
            self._render(res);
        }).fail(function(jqXHR) {
            if (jqXHR.statusText === "abort") return;
            self.$error.text("Unable to retrieve the list of tasks.").show();
        }).always(function() {
            self._request = null;
            self._setLoading(false);
        });
    };

    $(function() {
        var $root = $(".task-manager-plugin");
        if ($root.length === 0) return; // Not on the plugin's page

        new TaskManager($root);
    });

})(window.jQuery);
