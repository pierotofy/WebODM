import React from 'react';
import { shallow } from 'enzyme';
import ColorSwatches from '../ColorSwatches';

describe('<ColorSwatches />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<ColorSwatches colorKey="blue" onClick={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});
