import React, { useEffect, useState } from 'react';
import { useChat } from './ChatProvider';
import './Settings.css';
import { auth } from '../firebase';
import { saveUserSettings, getUserSettings, saveUserElo, getUserElo, calculateInitialCodingElo, calculateInitialMathElo, saveUserTaskTypes, getUserTaskTypes } from '../firebase/database';

const Settings = () => {
  const { 
    modelConfigs 
  } = useChat();

  // Add state for all settings
  const [userSettings, setUserSettings] = React.useState({
    leetcodeProficiency: '',
    mathProficiency: '',
    llmKnowledge: '',
    copilotUsage: '',
    csEducation: '',
    mathEducation: '',
    leetcodeCookie: '',
    leetcodeCsrfToken: ''
  });
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Add new state for showing success popup
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // Add new state for ELO scores
  const [eloScores, setEloScores] = useState({
    coding: null,
    math: null,
    learning: null
  });

  // Add state to track if expertise settings are initialized
  const [expertiseInitialized, setExpertiseInitialized] = useState(false);

  // Add this near the top with other state declarations
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Load existing settings
        const settings = await getUserSettings(user.uid);
        if (settings) {
          Object.entries(settings).forEach(([key, value]) => {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
          });
          setUserSettings(prevSettings => ({
            ...prevSettings,
            ...settings
          }));

          // Check if expertise settings are initialized
          const expertiseFields = ['leetcodeProficiency', 'mathProficiency', 'llmKnowledge', 
                                 'copilotUsage', 'csEducation', 'mathEducation'];
          const hasExpertiseSettings = expertiseFields.some(field => settings[field]);
          setExpertiseInitialized(hasExpertiseSettings);
        }

        // Load or initialize ELO scores
        const existingElo = await getUserElo(user.uid);
        if (existingElo) {
          setEloScores(existingElo);
        } else if (settings?.leetcodeProficiency || settings?.mathProficiency) {
          // Initialize ELO scores if they don't exist but we have proficiency settings
          const initialElo = {
            coding: settings.leetcodeProficiency ? calculateInitialCodingElo(settings.leetcodeProficiency) : null,
            math: settings.mathProficiency ? calculateInitialMathElo(settings.mathProficiency) : null,
            learning: null  // We'll implement this later
          };
          await saveUserElo(user.uid, initialElo);
          setEloScores(initialElo);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const saveSettings = async (setting, value) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      // Get current settings
      let currentSettings = await getUserSettings(user.uid) || {};
      
      // Update the specific setting
      currentSettings = {
        ...currentSettings,
        [setting]: value
      };

      // Save to localStorage and database
      localStorage.setItem(setting, typeof value === 'string' ? value : JSON.stringify(value));
      await saveUserSettings(user.uid, currentSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Update the settings handler
  const handleSettingChange = async (setting, value) => {
    setUserSettings(prev => ({
      ...prev,
      [setting]: value
    }));
    setHasUnsavedChanges(true);
  };

  // Add this helper function near the top
  const validateExpertiseFields = () => {
    const expertiseFields = [
      'leetcodeProficiency',
      'mathProficiency',
      'llmKnowledge',
      'copilotUsage',
      'csEducation',
      'mathEducation'
    ];
    
    const missingFields = expertiseFields.filter(field => !userSettings[field]);
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  };

  // Update the handleSaveSettings function
  const handleSaveSettings = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Only validate expertise if it hasn't been initialized yet
    if (!expertiseInitialized) {
      const { isValid, missingFields } = validateExpertiseFields();
      
      if (!isValid) {
        // Show error message about missing fields
        alert(`Please fill in all expertise fields before saving:\n${missingFields.map(field => 
          field.replace(/([A-Z])/g, ' $1').toLowerCase()
        ).join('\n')}`);
        return;
      }
      
      // If all fields are valid, show confirmation modal
      setShowConfirmModal(true);
      setPendingSave(true);
      return;
    }

    // If expertise is already initialized, proceed with normal save
    await saveSettingsToDatabase();
  };

  // Add new function to handle the actual saving
  const saveSettingsToDatabase = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await saveUserSettings(user.uid, userSettings);
      
      let newEloScores = { ...eloScores };
      let needsEloUpdate = false;
      
      if (!eloScores.coding && userSettings.leetcodeProficiency) {
        newEloScores.coding = calculateInitialCodingElo(userSettings.leetcodeProficiency);
        needsEloUpdate = true;
      }
      
      if (!eloScores.math && userSettings.mathProficiency) {
        newEloScores.math = calculateInitialMathElo(userSettings.mathProficiency);
        needsEloUpdate = true;
      }
      
      if (needsEloUpdate) {
        setEloScores(newEloScores);
        await saveUserElo(user.uid, newEloScores);
      }
      
      Object.entries(userSettings).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
      
      setHasUnsavedChanges(false);
      setShowSuccessPopup(true);
      setTimeout(() => setShowSuccessPopup(false), 3000);
      
      // Set expertise as initialized after successful save
      setExpertiseInitialized(true);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Add these handlers for the confirmation modal
  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    setPendingSave(false);
    await saveSettingsToDatabase();
  };

  const handleCancelSave = () => {
    setShowConfirmModal(false);
    setPendingSave(false);
  };

  return (
    <div className="settings-container">
      <h2>Settings</h2>
      
      <section className="settings-section">
        <h3>LeetCode Credentials</h3>
        <div className="settings-notice info-notice">
          <p>These credentials can be freely modified and may need to be updated periodically. Remember to click "Save Changes" after updating your tokens to save them.</p>
        </div>
        <div className="setting-item">
          <label>LeetCode Cookie</label>
          <input
            type="password"
            value={userSettings.leetcodeCookie || ''}
            onChange={(e) => handleSettingChange('leetcodeCookie', e.target.value)}
            placeholder="Enter your LeetCode cookie"
          />
          <p className="setting-description">
            Your LeetCode session cookie is required to execute code on LeetCode. This is stored securely and only used for LeetCode API calls.
          </p>
        </div>

        <div className="setting-item">
          <label>LeetCode CSRF Token</label>
          <input
            type="password"
            value={userSettings.leetcodeCsrfToken || ''}
            onChange={(e) => handleSettingChange('leetcodeCsrfToken', e.target.value)}
            placeholder="Enter your LeetCode CSRF token"
          />
          <p className="setting-description">
            Your LeetCode CSRF token is required for secure API calls. This is stored securely and only used for LeetCode API calls.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h3>User Expertise</h3>
        {!expertiseInitialized && (
          <div className="settings-notice">
            <p>All expertise fields are required for initial setup. These settings can only be saved once.</p>
          </div>
        )}
        {expertiseInitialized && (
          <div className="settings-notice">
            <p>Expertise settings cannot be modified after initial setup. If you need to make changes due to exceptional circumstances, please contact qbshi@princeton.edu.</p>
          </div>
        )}
        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>LeetCode Proficiency</label>
          <select
            value={userSettings.leetcodeProficiency || ''}
            onChange={(e) => handleSettingChange('leetcodeProficiency', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your proficiency level</option>
            <option value="0">0: Cannot solve leetcode problems</option>
            <option value="1">1: Can sometimes solve easy problems</option>
            <option value="2">2: Can consistently solve easy problems</option>
            <option value="3">3: Can sometimes solve medium problems</option>
            <option value="4">4: Can consistently solve medium problems</option>
            <option value="5">5: Can sometimes solve hard problems</option>
            <option value="6">6: Can consistently solve hard problems</option>
            <option value="no_context">I do not have enough context on Leetcode to rate my abilities.</option>
          </select>
          <p className="setting-description">
            Please select the level that best describes your current LeetCode problem-solving ability.
          </p>
        </div>

        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>Mathematics Proficiency</label>
          <select
            value={userSettings.mathProficiency || ''}
            onChange={(e) => handleSettingChange('mathProficiency', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your proficiency level</option>
            <option value="0">0: Cannot solve competition math problems</option>
            <option value="1">1: Can solve early problems on AMC10/12</option>
            <option value="2">2: Can solve majority of problems on AMC10</option>
            <option value="3">3: Can solve majority of problems on AMC12/Consistent AIME qualifier</option>
            <option value="4">4: Can solve majority of problems on AIME</option>
            <option value="5">5: USAMO participant</option>
            <option value="6">6: Putnam/IMO</option>
            <option value="no_context">I do not have enough context on math competitions to rate my abilities.</option>
          </select>
          <p className="setting-description">
            Please select the level that best matches your mathematical problem-solving ability, using math competitions as reference points.
          </p>
        </div>

        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>LLM Knowledge</label>
          <select
            value={userSettings.llmKnowledge || ''}
            onChange={(e) => handleSettingChange('llmKnowledge', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your knowledge level</option>
            <option value="1">1: Never used/heard of AI products (ChatGPT, Claude)</option>
            <option value="2">2: Occasionally use them, don't know how they work</option>
            <option value="3">3: Occasionally use them, and I generally understand their internal functionality</option>
            <option value="4">4: Use them in my everyday workflow, don't know how they work</option>
            <option value="5">5: Use them in my everyday workflow, and I generally understand their internal functionality</option>
          </select>
          <p className="setting-description">
            Please select the level that best describes your experience and knowledge with Large Language Models (LLMs).
          </p>
        </div>

        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>GitHub Copilot Usage</label>
          <select
            value={userSettings.copilotUsage || ''}
            onChange={(e) => handleSettingChange('copilotUsage', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your Copilot usage</option>
            <option value="never">Never used Copilot</option>
            <option value="sometimes">Sometimes use Copilot</option>
            <option value="frequently">Frequently use Copilot</option>
          </select>
          <p className="setting-description">
            Please indicate your level of experience with GitHub Copilot or similar AI code completion tools.
          </p>
        </div>

        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>Computer Science Education</label>
          <select
            value={userSettings.csEducation || ''}
            onChange={(e) => handleSettingChange('csEducation', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your CS education level</option>
            <option value="1">1 - No formal CS education</option>
            <option value="2">2 - Intro CS (Basic programming, data types, loops)</option>
            <option value="3">3 - Data Structures & Algorithms</option>
            <option value="4">4 - Advanced algorithms, Operating Systems, Databases</option>
            <option value="5">5 - Systems Design, Computer Architecture, Networks</option>
            <option value="6">6 - Advanced CS (Compilers, Distributed Systems, etc.)</option>
          </select>
          <p className="setting-description">
            Please select the level that best matches your computer science education or equivalent self-taught knowledge.
          </p>
        </div>

        <div className="setting-item">
          <label className={!expertiseInitialized ? "required-field" : ""}>Mathematics Education</label>
          <select
            value={userSettings.mathEducation || ''}
            onChange={(e) => handleSettingChange('mathEducation', e.target.value)}
            disabled={expertiseInitialized}
          >
            <option value="" disabled>Select your math education level</option>
            <option value="1">1 - High School Math (Up to Pre-Calculus)</option>
            <option value="2">2 - Calculus I & II (Derivatives, Integrals, Series)</option>
            <option value="3">3 - Linear Algebra & Multivariable Calculus</option>
            <option value="4">4 - Discrete Math, Probability & Statistics</option>
            <option value="5">5 - Abstract Algebra, Real Analysis</option>
            <option value="6">6 - Advanced Math (Complex Analysis, Topology, etc.)</option>
          </select>
          <p className="setting-description">
            Please select the level that best matches your mathematics education or equivalent self-taught knowledge.
          </p>
        </div>
      </section>

      {/* Add more settings sections as needed */}
      
      {/* Add save button at the bottom */}
      <div className="settings-save-button">
        <button 
          onClick={handleSaveSettings}
          disabled={!hasUnsavedChanges}
          className={`save-button ${hasUnsavedChanges ? 'has-changes' : ''}`}
        >
          Save Changes
        </button>
      </div>

      {/* Add success popup */}
      {showSuccessPopup && (
        <div className="success-popup">
          <div className="success-content">
            <span className="success-icon">✓</span>
            <p>Settings saved!</p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Important Notice</h3>
            <p>Once you save these expertise settings, they cannot be modified later. Are you sure you want to proceed?</p>
            <div className="modal-buttons">
              <button className="modal-button cancel" onClick={handleCancelSave}>
                Go Back
              </button>
              <button className="modal-button confirm" onClick={handleConfirmSave}>
                Yes, Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings; 