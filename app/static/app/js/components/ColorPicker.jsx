import React from 'react';
import PropTypes from 'prop-types';
import '../css/ColorPicker.scss';
import { colors, getColorsList } from '../classes/OverlayColors';

class ColorSwatches extends React.Component {
    static propTypes = {
        colorKey: PropTypes.string.isRequired,
        onClick: PropTypes.func.isRequired
    }

    handleClick = key => {
        return () => {
            this.props.onClick(key);
        }
    }

    render(){
        return (<div className="color-swatches">
            {getColorsList().map(c => <div key={c.key}
                onClick={this.handleClick(c.key)}
                className={"btn-color " + (this.props.colorKey === c.key ? "selected" : "")}
                title={c.label}
                style={{backgroundColor: c.color}}></div>)}
        </div>);
    }
}

class ColorPicker extends React.Component {
    static propTypes = {
        colorKey: PropTypes.string.isRequired,
        onChange: PropTypes.func.isRequired
    }

    constructor(props){
        super(props);

        this.state = {
            editing: false
        };
    }

    handleEdit = () => {
        this.setState({editing: !this.state.editing});
    }

    handleChoose = key => {
        this.setState({editing: false});
        this.props.onChange(key);
    }

    render(){
        const { colorKey } = this.props;
        const selected = colors[colorKey];

        return (<div className="color-picker">
            {this.state.editing ?
                <ColorSwatches colorKey={colorKey} onClick={this.handleChoose} />
            : <div onClick={this.handleEdit}
                className="btn-color selected"
                title={selected.label}
                style={{backgroundColor: selected.color}}></div>}
        </div>);
    }
}

export {
    ColorPicker,
    ColorSwatches
}
export default ColorPicker;
