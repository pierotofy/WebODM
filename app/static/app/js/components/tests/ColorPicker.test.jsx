import React from 'react';
import { shallow } from 'enzyme';
import ColorPicker from '../ColorPicker';

describe('<ColorPicker />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<ColorPicker colorKey="blue" onChange={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});
