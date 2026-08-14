import React from 'react';
import { shallow } from 'enzyme';
import OverlayFeaturePopup from '../OverlayFeaturePopup';

describe('<OverlayFeaturePopup />', () => {
  it('renders without exploding', () => {
    const child = {
      name: "A-NOTE",
      colorKey: "blue",
      layer: { on: () => {}, off: () => {} }
    };
    const feature = { type: "Feature", properties: {} };
    const wrapper = shallow(<OverlayFeaturePopup child={child} feature={feature} onColorChange={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});
