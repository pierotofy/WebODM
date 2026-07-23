import { _ } from './gettext';

let colors = {
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
};

const getColorsList = () => {
    const res = [];
    for (let key in colors){
        res.push({
            key,
            label: colors[key].label,
            color: colors[key].color
        });
    }
    return res;
};

let colorIdx = 0;
const nextColorKey = () => {
    const keys = Object.keys(colors);
    return keys[(colorIdx++) % keys.length];
};

export {
    colors,
    getColorsList,
    nextColorKey
}
