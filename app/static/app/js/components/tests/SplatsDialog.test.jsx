import React from 'react';
import { mount } from 'enzyme';
import SplatsDialog from '../SplatsDialog';

describe('<SplatsDialog />', () => {
    it('renders without exploding', () => {
      const wrapper = mount(<SplatsDialog
        task={{id: 1, project: 1, available_assets: [], images_count: 3, compacted: false}}
        projectId={1}
        canEdit={true}
        onClose={() => {}}
      />);
      expect(wrapper.exists()).toBe(true);
    })
  });
