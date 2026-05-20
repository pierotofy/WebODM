import React from 'react';
import '../css/Timeline.scss';
import PropTypes from 'prop-types';
import { _, interpolate } from '../classes/gettext';

class Timeline extends React.Component {
  static defaultProps = {
    visible: false,
    onClose: () => {},
    timelineData: [],
  };

  static propTypes = {
    visible: PropTypes.bool,
    onClose: PropTypes.func,
    timelineData: PropTypes.array,
  };

  constructor(props) {
    super(props);
    this.state = {
      sliderValue: 0,
    };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.timelineData !== this.props.timelineData) {
      const data = this.props.timelineData;
      this.setState({ sliderValue: data.length > 0 ? data[0].sliderValue : 0 });
    }
  }

  handleClose = () => {
    this.props.onClose();
  }

  snapValue = (value) => {
    const { timelineData } = this.props;
    let closestIdx = 0;
    let closestDist = Infinity;
    
    timelineData.forEach((day, i) => {
      const dist = Math.abs(day.sliderValue - value);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    
    return timelineData[closestIdx].sliderValue;
  }

  handleSliderChange = (e) => {
    const snappedValue = this.snapValue(parseFloat(e.target.value));
    if (snappedValue !== this.state.sliderValue) {
      this.setState({ sliderValue: snappedValue });
    }
  }

  handlePrev = () => {
    this.setState(prev => {
      const data = this.props.timelineData;
      const currentIdx = this.getCurrentIndex();
      const newIdx = Math.max(0, currentIdx - 1);
      return { sliderValue: data[newIdx].sliderValue };
    });
  }

  handleNext = () => {
    this.setState(prev => {
      const data = this.props.timelineData;
      const currentIdx = this.getCurrentIndex();
      const newIdx = Math.min(data.length - 1, currentIdx + 1);
      return { sliderValue: data[newIdx].sliderValue };
    });
  }

  getCurrentIndex = () => {
    const { sliderValue } = this.state;
    const { timelineData } = this.props;
    let closestIdx = 0;
    let closestDist = Infinity;
    
    timelineData.forEach((day, i) => {
      const dist = Math.abs(day.sliderValue - sliderValue);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    
    return closestIdx;
  }

  render() {
    if (!this.props.visible) return null;

    const { sliderValue } = this.state;
    const timelineData = this.props.timelineData;
    
    if (timelineData.length === 0) return null;

    const currentIdx = this.getCurrentIndex();
    const currentDate = timelineData[currentIdx].date;
    const taskNames = timelineData[currentIdx].taskNames;
    const taskCount = taskNames.length;
    const minVal = timelineData[0].sliderValue;
    const maxVal = timelineData[timelineData.length - 1].sliderValue;

    const taskLabel = taskCount === 1 
      ? taskNames[0] 
      : taskNames.join('\n');

    return (
      <div className="timeline">
        <div className="timeline-content">
          <span className="timeline-close" onClick={this.handleClose}>
            <i className="fa fa-times"></i>
          </span>
          <div className="timeline-date">{currentDate}</div>
          <div className="timeline-task-count" title={taskLabel}>{taskCount > 1 ? interpolate(_("%(count)s tasks"), { count: taskCount}) : taskLabel}</div>
          <div className="timeline-slider-container">
            <button className="timeline-btn btn btn-default btn-sm timeline-prev" onClick={this.handlePrev} disabled={currentIdx === 0}>
              <i className="fa fa-chevron-left"></i>
            </button>
            <input
               type="range"
               min={minVal}
               max={maxVal}
               value={sliderValue}
               onChange={this.handleSliderChange}
               className="timeline-slider"
             />
            <button className="timeline-btn btn btn-default btn-sm timeline-next" onClick={this.handleNext} disabled={currentIdx === timelineData.length - 1}>
              <i className="fa fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default Timeline;
