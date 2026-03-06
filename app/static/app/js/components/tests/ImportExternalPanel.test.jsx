import React from 'react';
import { shallow } from 'enzyme';
import ImportExternalPanel from '../ImportExternalPanel';

describe('<ImportExternalPanel />', () => {
  it('renders without exploding', () => {
    const wrapper = shallow(<ImportExternalPanel projectId={0} onImported={() => {}} />);
    expect(wrapper.exists()).toBe(true);
  })
});