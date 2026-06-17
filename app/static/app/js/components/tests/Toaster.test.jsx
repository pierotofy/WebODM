import React from 'react';
import { shallow } from 'enzyme';
import Toaster from '../Toaster';

describe('<Toaster />', () => {
  it('renders without exploding', () => {
  	const wrapper = shallow(<Toaster />);
    expect(wrapper.exists()).toBe(true);
  })
});