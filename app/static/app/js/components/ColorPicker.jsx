import React from 'react';
import PropTypes from 'prop-types';
import '../css/ColorPicker.scss';
import OverlayColors from '../classes/OverlayColors';
import ColorSwatches from './ColorSwatches';

export default class ColorPicker extends React.Component {
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
        const selected = OverlayColors.colors[colorKey];

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
