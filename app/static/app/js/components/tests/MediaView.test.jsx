import React from 'react';
import { mount } from 'enzyme';
import MediaView from '../MediaView';

describe('<MediaView />', () => {
    it('renders without exploding', () => {
      const wrapper = mount(<MediaView imageUrl="http://example.com/test.jpg" thumbSize={256} onClose={() => {}} />);
      expect(wrapper.exists()).toBe(true);
    });

    it('renders with isPano without exploding', () => {
      const wrapper = mount(<MediaView imageUrl="http://example.com/test.jpg" thumbSize={256} isPano={true} />);
      expect(wrapper.exists()).toBe(true);
    });
  });
