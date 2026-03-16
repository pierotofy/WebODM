import React from 'react';
import { mount } from 'enzyme';
import MediaView from '../MediaView';

describe('<MediaView />', () => {
    it('renders without exploding', () => {
      const wrapper = mount(<MediaView imageUrl="http://example.com/test.jpg" onClose={() => {}} />);
      expect(wrapper.exists()).toBe(true);
    });
  });
