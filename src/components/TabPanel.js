import React from 'react';
import './TabPanel.css';

const TabPanel = ({ activeTab, tabs, onNotesChange }) => {
  const [currentTab, setCurrentTab] = React.useState(activeTab || Object.keys(tabs)[0]);

  return (
    <div className="tab-container">
      <div className="tab-header">
        {Object.keys(tabs).map((tabKey) => (
          <button
            key={tabKey}
            className={`tab-button ${currentTab === tabKey ? 'active' : ''}`}
            onClick={() => setCurrentTab(tabKey)}
          >
            {tabs[tabKey].label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tabs[currentTab].content}
      </div>
    </div>
  );
};

export default TabPanel; 