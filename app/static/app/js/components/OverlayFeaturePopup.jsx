import React from 'react';
import PropTypes from 'prop-types';
import '../css/OverlayFeaturePopup.scss';
import ColorPicker from './ColorPicker';
import { _ } from '../classes/gettext';

export default class OverlayFeaturePopup extends React.Component {
    static propTypes = {
        child: PropTypes.object.isRequired,
        feature: PropTypes.object.isRequired,
        onColorChange: PropTypes.func.isRequired
    }

    componentDidMount(){
        this.props.child.layer.on('overlay:stylechanged', this.handleStyleChanged);
    }

    componentWillUnmount(){
        this.props.child.layer.off('overlay:stylechanged', this.handleStyleChanged);
    }

    handleStyleChanged = () => {
        this.forceUpdate();
    }

    render(){
        const { child, feature } = this.props;
        const properties = feature.properties || {};

        return (<div className="overlay-feature-popup">
            <div className="title" title={child.name}>{child.displayName || child.name}</div>
            <div className="line">
                <div className="popup-label">{_("Color")}</div>
                <ColorPicker colorKey={child.colorKey} onChange={this.props.onColorChange} />
            </div>
            {Object.keys(properties).length ?
                <div className="properties">
                    {Object.keys(properties).map(k => <div key={k} className="line align-baseline">
                        <div className="popup-label measure">{k}</div>
                        <div className="measurement">{String(properties[k])}</div>
                    </div>)}
                </div>
            : ""}
        </div>);
    }
}
