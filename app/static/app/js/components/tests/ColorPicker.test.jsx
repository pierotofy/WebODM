import React from 'react';
import { shallow } from 'enzyme';
import ColorPicker, { ColorSwatches } from '../ColorPicker';

describe('<ColorPicker />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<ColorPicker colorKey="blue" onChange={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});

describe('<ColorSwatches />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<ColorSwatches colorKey="blue" onClick={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});
