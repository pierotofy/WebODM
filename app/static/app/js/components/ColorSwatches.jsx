import React from 'react';
import PropTypes from 'prop-types';
import '../css/ColorPicker.scss';
import OverlayColors from '../classes/OverlayColors';

export default class ColorSwatches extends React.Component {
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
            {OverlayColors.getColorsList().map(c => <div key={c.key}
                onClick={this.handleClick(c.key)}
                className={"btn-color " + (this.props.colorKey === c.key ? "selected" : "")}
                title={c.label}
                style={{backgroundColor: c.color}}></div>)}
        </div>);
    }
}
