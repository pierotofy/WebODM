import React from 'react';
import { shallow } from 'enzyme';
import LayersControlOverlays from '../LayersControlOverlays';

describe('<LayersControlOverlays />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<LayersControlOverlays map={{}} overlays={[]} onRemove={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});
