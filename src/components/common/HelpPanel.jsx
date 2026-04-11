import React, { useEffect, useState } from 'react';
import { Drawer, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import ProjectWorkflow from '../MasterData/ProjectWorkflow';
import './HelpPanel.css';

const HelpPanel = ({ tooltip = 'Open workflow help', buttonClassName = 'help-panel-trigger' }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener('help:open-workflow', openPanel);
    return () => window.removeEventListener('help:open-workflow', openPanel);
  }, []);

  return (
    <>
      <Tooltip title={tooltip} placement="bottom">
        <button
          type="button"
          className={buttonClassName}
          onClick={() => setOpen(true)}
          aria-label="Open system workflow help"
        >
          <QuestionCircleOutlined className="help-panel-trigger-icon" />
        </button>
      </Tooltip>

      <Drawer
        title="System Workflow"
        placement="right"
        width={1000}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
        className="help-panel-drawer"
      >
        <ProjectWorkflow />
      </Drawer>
    </>
  );
};

export default HelpPanel;
