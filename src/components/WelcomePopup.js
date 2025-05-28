import React from 'react';
import './WelcomePopup.css';

const WelcomePopup = ({ onClose }) => {
  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <div className="welcome-popup-content">
          <h2>👋 Welcome to Your Coding Workspace!</h2>
          
          <div className="welcome-sections">
            <div className="welcome-section">
              <h3>📝 Problem Description</h3>
              <p>On the left panel, you'll find the complete problem description and requirements.</p>
            </div>

            <div className="welcome-section">
              <h3>💻 Code Editor</h3>
              <p>The top-right panel contains your code editor where you can:</p>
              <ul>
                <li>Write and edit your code</li>
                <li>Select your preferred programming language</li>
                <li>Submit your code for evaluation (Python only)</li>
              </ul>
            </div>

            <div className="welcome-section">
              <h3>🛠️ Workspace Tools</h3>
              <p>The bottom-right panel includes:</p>
              <ul>
                <li><strong>Chat Assistant:</strong> Get help with understanding, debugging, and optimizing</li>
                <li><strong>Suggestions:</strong> Receive contextual prompts to guide your problem-solving</li>
                <li><strong>Test Cases:</strong> Create and run custom test cases</li>
                <li><strong>Notes:</strong> Keep track of your thoughts and approaches</li>
              </ul>
            </div>
          </div>

          <button className="welcome-popup-button" onClick={onClose}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup; 