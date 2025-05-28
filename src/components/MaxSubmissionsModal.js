import React from 'react';
import './MaxSubmissionsModal.css';

const MaxSubmissionsModal = ({ onClose, onSubmitTrajectory }) => {
  return (
    <div className="modal-overlay">
      <div className="max-submissions-modal">
        <h2>Maximum Submissions Reached</h2>
        <p>You have used all 10 submission attempts for this problem.</p>
        <p>While you weren't able to solve this problem within the attempt limit, your learning journey is still valuable! We encourage you to submit your trajectory to help improve our understanding of the learning process.</p>
        <div className="modal-buttons">
          <button 
            className="submit-trajectory-button"
            onClick={onSubmitTrajectory}
          >
            Submit Trajectory
          </button>
          <button 
            className="close-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaxSubmissionsModal; 