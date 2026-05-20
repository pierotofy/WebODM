import React from 'react';
import { mount } from 'enzyme';
import Timeline from '../Timeline';

describe('<Timeline />', () => {
    it('renders without exploding', () => {
      const wrapper = mount(<Timeline visible={true} onClose={() => {}} />);
      expect(wrapper.exists()).toBe(true);
    })
});
