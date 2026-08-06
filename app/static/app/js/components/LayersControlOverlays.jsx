import React from 'react';
import PropTypes from 'prop-types';
import '../css/LayersControlOverlays.scss';
import { Checkbox, ExpandButton } from './Toggle';
import { ColorSwatches } from './ColorPicker';
import { colors } from '../classes/OverlayColors';
import { updateOverlayColor, updateOverlayOpacity } from '../classes/OverlayLayer';
import { _ } from '../classes/gettext';

class ColorDot extends React.Component{
  static propTypes = {
    child: PropTypes.object.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      pickerOpen: false
    };
  }

  componentDidMount(){
    // Capture phase, as the layers control stops propagation of mouse events
    document.addEventListener('mousedown', this.handleDocMouseDown, true);
    this.props.child.layer.on('overlay:stylechanged', this.handleStyleChanged);
  }

  componentWillUnmount(){
    document.removeEventListener('mousedown', this.handleDocMouseDown, true);
    this.props.child.layer.off('overlay:stylechanged', this.handleStyleChanged);
  }

  handleStyleChanged = () => {
    this.forceUpdate();
  }

  handleDocMouseDown = e => {
    if (this.state.pickerOpen && this.domNode && !this.domNode.contains(e.target)){
      this.setState({pickerOpen: false});
    }
  }

  handleToggle = () => {
    this.setState({pickerOpen: !this.state.pickerOpen});
  }

  handlePick = colorKey => {
    updateOverlayColor(this.props.child, colorKey);
    this.setState({pickerOpen: false});
  }

  render(){
    const { child } = this.props;

    return (<div className="overlay-color-dot" ref={domNode => this.domNode = domNode}>
      <div className="btn-color-dot"
        title={_("Change color")}
        onClick={this.handleToggle}
        style={{backgroundColor: colors[child.colorKey].color}}></div>
      {this.state.pickerOpen ?
        <div className="overlay-color-popup">
          <ColorSwatches colorKey={child.colorKey} onClick={this.handlePick} />
        </div>
      : ""}
    </div>);
  }
}

class OverlayLayer extends React.Component{
  static propTypes = {
    parent: PropTypes.object,
    child: PropTypes.object,
    map: PropTypes.object,
    onRemove: PropTypes.func
  }

  constructor(props){
    super(props);

    this.state = {
      visible: props.child.visible !== false
    }
  }

  componentDidUpdate(prevProps, prevState){
    if (prevState.visible !== this.state.visible){
      this.props.child.visible = this.state.visible;
      if (this.props.parent.visibleOnMap()){
        this.setLayerVisibility(this.state.visible);
      }

      const entry = this.props.child.parent;
      if (entry.onSync) entry.onSync(entry);
    }
  }

  setLayerVisibility = visible => {
    if (visible) this.props.map.addLayer(this.props.child.layer);
    else this.props.map.removeLayer(this.props.child.layer);
  }

  handleFocus = () => {
    const bounds = this.props.child.layer.options.bounds;
    if (bounds && bounds.isValid()) this.props.map.fitBounds(bounds);
  }

  handleDelete = () => {
    if (window.confirm(_('Are you sure you want to delete this?'))){
      this.props.onRemove(this.props.child);
    }
  }

  render(){
    const { child } = this.props;

    return (<div className="layers-control-layer layers-control-overlay-child">
      <div className="layer-control-title">
        <Checkbox bind={[this, 'visible']}/>
        <ColorDot child={child} />
        <a className="layer-label" title={child.name} href="javascript:void(0)" onClick={this.handleFocus}><div className="layer-title" title={child.name}>{child.displayName || child.name}</div></a>
        <a className="layer-action" href="javascript:void(0)" onClick={this.handleDelete} title={_("Delete")}><i className="fa fa-trash"></i></a>
      </div>
    </div>);
  }
}

class OverlayEntry extends React.Component{
  static propTypes = {
    section: PropTypes.object,
    entry: PropTypes.object,
    map: PropTypes.object,
    onRemove: PropTypes.func
  }

  constructor(props){
    super(props);

    this.state = {
      visible: props.entry.visible !== false,

      // Overlays restored from server storage start collapsed,
      // freshly dropped ones expanded
      expanded: !props.entry.stored
    };

    this.childRefs = [];
  }

  sectionVisible = () => this.props.section.state.visible;

  visibleOnMap = () => this.sectionVisible() && this.state.visible;

  componentDidUpdate(prevProps, prevState){
    if (prevState.visible !== this.state.visible){
      this.props.entry.visible = this.state.visible;
      if (this.sectionVisible()){
        this.applyVisibility(true);
      }
      if (this.props.entry.onSync) this.props.entry.onSync(this.props.entry);
    }
  }

  applyVisibility = parentVisible => {
    const { entry } = this.props;
    const effective = parentVisible && this.state.visible;

    if (entry.children.length === 1){
      this.setLayer(entry.children[0].layer, effective);
    }else{
      this.childRefs.forEach(c => {
        if (c) c.setLayerVisibility(effective && c.state.visible);
      });
    }
  }

  setLayer = (layer, visible) => {
    if (visible) this.props.map.addLayer(layer);
    else this.props.map.removeLayer(layer);
  }

  handleFocus = () => {
    const { entry } = this.props;
    if (entry.bounds && entry.bounds.isValid()) this.props.map.fitBounds(entry.bounds);
  }

  handleDelete = () => {
    if (window.confirm(_('Are you sure you want to delete this?'))){
      this.props.onRemove(this.props.entry);
    }
  }

  handleOpacityChange = e => {
    updateOverlayOpacity(this.props.entry, parseFloat(e.target.value));
    this.forceUpdate();
  }

  handleRemoveChild = child => {
    this.props.onRemove(this.props.entry, child);
  }

  render(){
    const { entry } = this.props;

    if (entry.loading){
      return (<div className="layers-control-layer layers-control-overlay">
        <div className="layer-control-title">
          <div className="paddingSpace"></div>
          <i className="loading-icon fa fa-circle-notch fa-spin fa-fw"></i>
          <div className="layer-title loading-title" title={entry.name}>{entry.name} <span className="progress-info">{entry.converting ? _("Converting...") : (entry.progress > 0 ? `${Math.min(99, entry.progress).toFixed(0)}%` : "")}</span></div>
        </div>
      </div>);
    }

    const opacitySlider = (<input type="range"
                              className="overlay-opacity"
                              min="0" max="100" step="1"
                              value={entry.opacity}
                              onChange={this.handleOpacityChange}
                              title={_("Opacity")} />);
    const deleteButton = entry.syncing ?
                          (<span className="layer-action" title={_("Syncing…")}><i className="fa fa-circle-notch fa-spin"></i></span>)
                        : (<a className="layer-action" href="javascript:void(0)" onClick={this.handleDelete} title={_("Delete")}><i className="fa fa-trash"></i></a>);

    if (entry.children.length === 1){
      return (<div className="layers-control-layer layers-control-overlay">
        <div className="layer-control-title">
          <div className="paddingSpace"></div>
          <Checkbox bind={[this, 'visible']}/>
          <ColorDot child={entry.children[0]} />
          <a className="layer-label" title={entry.name} href="javascript:void(0)" onClick={this.handleFocus}><div className="layer-title" title={entry.name}>{entry.name}</div></a>
          {opacitySlider}
          {deleteButton}
        </div>
      </div>);
    }

    return (<div className="layers-control-layer layers-control-overlay">
      <div className="layer-control-title">
        <ExpandButton bind={[this, 'expanded']} />
        <Checkbox bind={[this, 'visible']}/>
        <a className="layer-label" title={entry.name} href="javascript:void(0)" onClick={this.handleFocus}><div className="layer-title" title={entry.name}>{entry.name}</div></a>
        {opacitySlider}
        {deleteButton}
      </div>
      <div className={"layer-expanded " + (!this.state.expanded ? "hide" : "")}>
        {entry.children.map((child, i) => <OverlayLayer parent={this}
                                            ref={domNode => this.childRefs[i] = domNode}
                                            key={child.name}
                                            child={child}
                                            map={this.props.map}
                                            onRemove={this.handleRemoveChild} />)}
      </div>
    </div>);
  }
}

export default class LayersControlOverlays extends React.Component {
  static defaultProps = {
    overlays: []
  };

  static propTypes = {
    overlays: PropTypes.array,
    map: PropTypes.object.isRequired,
    onRemove: PropTypes.func.isRequired
  }

  constructor(props){
    super(props);

    this.state = {
      visible: true,
      expanded: true
    };

    this.entryRefs = [];
  }

  componentDidUpdate(prevProps, prevState){
    if (prevState.visible !== this.state.visible){
      this.entryRefs.forEach(entry => {
        if (entry) entry.applyVisibility(this.state.visible);
      });
    }
  }

  handleOverlaysClick = () => {
    this.setState({expanded: !this.state.expanded});
  }

  render(){
    const { overlays } = this.props;

    return (<div className="layers-control-layer layers-control-overlays">
        <div className="layer-control-title">
          <ExpandButton bind={[this, 'expanded']} /><Checkbox bind={[this, 'visible']} className="overlays-toggle" />
          <a title={_("Overlays")} className="layer-label" href="javascript:void(0);" onClick={this.handleOverlaysClick}><div className="layer-title"><i className="layer-icon fa fa-vector-square fa-fw"></i> {_("Overlays")}</div></a>
          <a className="layer-action placeholder" href="javascript:void(0)"><i className="fa fa-download"></i></a>
          <a className="layer-action placeholder" href="javascript:void(0)"><i className="fa fa-trash"></i></a>
        </div>

        <div className={"layer-expanded " + (!this.state.expanded ? "hide" : "")}>
          {overlays.map((entry, i) => <OverlayEntry section={this}
                                        ref={domNode => this.entryRefs[i] = domNode}
                                        key={entry.id}
                                        entry={entry}
                                        map={this.props.map}
                                        onRemove={this.props.onRemove} />)}
        </div>
    </div>);
  }
}

