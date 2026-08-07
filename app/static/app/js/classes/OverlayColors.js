import { _ } from './gettext';

let colorIdx = 0;

export default {
    colors: {
        'blue': {
            label: _("Blue"),
            color: "#16b7ff"
        },
        'red': {
            label: _("Red"),
            color: "#ff3f16"
        },
        'green': {
            label: _("Green"),
            color: "#16ff2b"
        },
        'yellow': {
            label: _("Yellow"),
            color: "#fcff15"
        },
        'pink': {
            label: _("Pink"),
            color: "#f916ff"
        },
        'orange': {
            label: _("Orange"),
            color: "#ffa716"
        },
        'gray': {
            label: _("Gray"),
            color: "#3d3d3dff"
        }
    },

    getColorsList: function(){
        const res = [];
        for (let key in this.colors){
            res.push({
                key,
                label: this.colors[key].label,
                color: this.colors[key].color
            });
        }
        return res;
    },

    nextColorKey: function(){
        const keys = Object.keys(this.colors);
        return keys[(colorIdx++) % keys.length];
    }
};
