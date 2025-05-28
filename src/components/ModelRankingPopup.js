import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './ModelRankingPopup.css';
import { auth } from '../firebase';
import { saveModelRanking, getLatestModelRanking } from '../firebase/database';

const ModelRankingPopup = ({ onClose, recentModels }) => {
  const [experiences, setExperiences] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [selfEfficacy, setSelfEfficacy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likertResponses, setLikertResponses] = useState({
    teaching: '',
    solution: '',
    implementation: '',
    organization: ''
  });
  const [selectedProblem, setSelectedProblem] = useState(null);

  useEffect(() => {
    const initializeExperiences = async () => {
      const user = auth.currentUser;
      if (!user) return;

      // Get previous ranking
      const previousRanking = await getLatestModelRanking(user.uid);
      
      // Calculate the cutoff date (14 days ago instead of 5 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      // Sort models by timestamp and filter out old ones
      const sortedModels = [...recentModels]
        .filter(model => new Date(model.timestamp) >= fourteenDaysAgo)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 4);
      
      // Create experiences array
      const newExperiences = sortedModels.map((model) => {
        const date = new Date(model.timestamp);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = date.toLocaleDateString();
        
        // Update source determination logic to include learning problems
        const source = model.source || 
          (model.problemId && (
            // Check for AMC/AIME math problems
            model.problemId.includes('AMC') || model.problemId.includes('AIME') ? 'Math-V2' :
            // Check for learning problems (64 character hex string)
            /^[a-f0-9]{64}$/.test(model.problemId) ? 'learning' :
            // Default to LeetCode
            'LeetCode'
          ));
        
        return {
          id: model.id,
          problemId: model.problemId,
          modelId: model.modelId,
          modelName: model.modelMetadata?.displayName || 'AI Assistant',
          name: `Problem ${model.problemId}`,
          timestamp: model.timestamp,
          description: `Solved on ${dateString} at ${timeString}`,
          source: source
        };
      });

      if (previousRanking) {
        // Create a map of previously ranked experiences by their unique identifier
        const rankedMap = new Map(
          previousRanking.map(r => [`${r.problemId}-${r.modelId}`, r.rank])
        );

        // Sort experiences based on previous ranking or put at the beginning if new
        const sortedExperiences = [...newExperiences].sort((a, b) => {
          const rankA = rankedMap.get(`${a.problemId}-${a.modelId}`);
          const rankB = rankedMap.get(`${b.problemId}-${b.modelId}`);
          
          if (rankA && rankB) {
            return rankA - rankB;
          }
          if (!rankA && !rankB) {
            return b.timestamp - a.timestamp;
          }
          if (!rankA) return -1; // New items go to the top
          if (!rankB) return 1;
          return 0;
        });

        setExperiences(sortedExperiences);
      } else {
        setExperiences(newExperiences);
      }
    };

    initializeExperiences();
  }, [recentModels]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(experiences);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setExperiences(items);
  };

  const handleLikertChange = (field) => (e) => {
    setLikertResponses(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleSubmit = async () => {
    if (experiences.length === 0) {
      alert('Please rank at least one model before submitting.');
      return;
    }
    if (!selfEfficacy) {
      alert('Please complete the self-assessment question.');
      return;
    }

    // Get whether it's a coding problem
    const firstExperience = experiences[0];
    const isCoding = firstExperience && isCodingProblem(firstExperience);

    // Only check required questions based on problem type
    const requiredResponses = {
      teaching: true,
      solution: true,
      implementation: isCoding,
      organization: true
    };

    // Check if any required questions are unanswered
    if (Object.entries(likertResponses).some(([key, value]) => 
      requiredResponses[key] && !value
    )) {
      alert('Please complete all evaluation questions.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ranking = experiences.map((exp, index) => ({
        rank: index + 1,
        problemId: exp.problemId,
        modelId: exp.modelId,
        modelName: exp.modelName,
        timestamp: exp.timestamp
      }));

      // Save to Firebase for historical records
      await saveModelRanking(
        auth.currentUser?.uid, 
        ranking, 
        feedback, 
        selfEfficacy,
        likertResponses
      );

      // Pass all data back to parent component
      onClose(
        ranking,
        selfEfficacy,
        likertResponses,
        feedback
      );
    } catch (error) {
      console.error('Error saving ranking:', error);
      alert('Error saving your feedback. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Update handleViewProblem to handle AMC problems
  const handleViewProblem = async (experience) => {
    try {
      let problemData;
      console.log('Loading problem:', experience); // Debug log

      if (experience.source === 'Math-V2') {
        try {
          const mathData = require('../livebench_math_question_dict_standardized_expanded_with_elo.json');
          problemData = mathData[experience.problemId];
          
          console.log('Math problem data:', {
            problemId: experience.problemId,
            found: !!problemData,
            availableKeys: Object.keys(mathData).slice(0, 5)
          });
        } catch (error) {
          console.error('Error loading math problem data:', error);
        }
      } else if (experience.source === 'LeetCode') {
        const leetcodeData = require('../leetcode_problem_dict_v2_v5_with_elo.json');
        problemData = leetcodeData[experience.problemId];
      } else if (experience.source === 'learning') {
        // Handle USABO and other learning problems directly from the problemId
        const learningData = require('../learning_problems_standardized_fixed.json')
        problemData = learningData[experience.problemId]
        console.log('Learning problem data:', {
          problemId: experience.problemId,
          found: !!problemData,
        });
      }

      if (problemData) {
        setSelectedProblem({
          ...problemData,
          id: experience.problemId,
          source: experience.source,
          title: problemData.title || `Problem ${experience.problemId}`,
          description: problemData.description || 'Problem description not available.'
        });
      } else {
        console.error('Problem data not found:', {
          problemId: experience.problemId,
          source: experience.source
        });
        alert('Could not load problem details. Please try again.');
      }
    } catch (error) {
      console.error('Error loading problem details:', error);
      alert('Error loading problem details. Please try again.');
    }
  };

  // Update the ProblemDetailsModal component
  const ProblemDetailsModal = ({ problem, onClose }) => {
    if (!problem) return null;

    return (
      // Change to problem-viewer-overlay to differentiate from main modal
      <div className="problem-viewer-overlay">
        <div className="problem-viewer-content">
          <h3>{problem.title || `Problem ${problem.id}`}</h3>
          <div className="problem-viewer-description">
            {problem.description}
          </div>
          <button onClick={onClose} className="problem-viewer-close">
            Close
          </button>
        </div>
      </div>
    );
  };

  // Add this helper function to determine if it's a coding problem
  const isCodingProblem = (experience) => {
    return experience.source === 'LeetCode';
  };

  // Get the first experience to determine problem type
  const firstExperience = experiences[0];
  const showCodingQuestions = firstExperience && isCodingProblem(firstExperience);

  return (
    <div className="modal-overlay">
      <div className="modal-content wide-modal">
        <h2>Help Us Improve!</h2>
        
        <div className="modal-layout">
          <div className="ranking-section">
            <h3>Model Ranking</h3>
            <p>Please rank the models you used based on their helpfulness by dragging and dropping your recently used models in order:</p>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="experience-list">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="model-list"
                  >
                    {experiences.map((exp, index) => (
                      <Draggable
                        key={exp.id}
                        draggableId={exp.id}
                        index={index}
                      >
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="model-item"
                          >
                            <div className="rank-number">{index + 1}</div>
                            <div className="model-info">
                              <h3>
                                {exp.name.length > 30 ? `${exp.name.substring(0, 30)}...` : exp.name}
                                {new Date(exp.timestamp).getTime() === Math.max(...experiences.map(e => new Date(e.timestamp).getTime())) && 
                                  <span className="new-tag">NEW</span>}
                              </h3>
                              <p>{exp.description}</p>
                              <button 
                                onClick={() => handleViewProblem(exp)}
                                className="view-problem-button"
                              >
                                View Problem
                              </button>
                            </div>
                            <div className="drag-handle">⋮⋮</div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="questionnaire-section">
            <div className="assessment-grid">
              <div className="self-efficacy-section">
                <h3>Self-Assessment</h3>
                <p>Do you believe you could have solved this problem without AI assistance?</p>
                <select 
                  value={selfEfficacy} 
                  onChange={(e) => setSelfEfficacy(e.target.value)}
                  className="dropdown-select"
                >
                  <option value="">Please select...</option>
                  <option value="1">Definitely No</option>
                  <option value="2">Probably No</option>
                  <option value="3">Unsure</option>
                  <option value="4">Probably Yes</option>
                  <option value="5">Definitely Yes</option>
                </select>
              </div>

              <div className="likert-section">
                <h3>AI Assistance Evaluation</h3>
                <p>Please rate your agreement with the following statements:</p>
                
                {[
                  {
                    key: 'teaching',
                    question: 'The AI effectively explained concepts and provided educational value'
                  },
                  {
                    key: 'solution',
                    question: 'The AI provided accurate and correct solutions'
                  },
                  // Only show implementation question for coding problems
                  ...(showCodingQuestions ? [{
                    key: 'implementation',
                    question: 'The AI provided useful implementation tips and coding suggestions'
                  }] : []),
                  {
                    key: 'organization',
                    question: 'The AI\'s responses were well-organized and easy to follow'
                  }
                ].map(item => (
                  <div key={item.key} className="likert-question">
                    <p>{item.question}</p>
                    <select 
                      value={likertResponses[item.key]} 
                      onChange={handleLikertChange(item.key)}
                      className="dropdown-select"
                    >
                      <option value="">Please select...</option>
                      <option value="1">Strongly Disagree</option>
                      <option value="2">Disagree</option>
                      <option value="3">Neutral</option>
                      <option value="4">Agree</option>
                      <option value="5">Strongly Agree</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="feedback-section">
              <h3>Additional Feedback (Optional but highly encouraged: We want to know why did you rank the models the way that you did?)</h3>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Please share what you liked and didn't like about the models you used that wasn't covered in the questionnaire above. Your detailed feedback helps us improve!"
                className="feedback-textarea"
              />
            </div>
          </div>
        </div>

        <div className="modal-buttons">
          <button 
            onClick={handleSubmit}
            disabled={experiences.length === 0 || !selfEfficacy || isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
          <button onClick={() => onClose(null)} className="cancel-button">
            Cancel
          </button>
        </div>

        {/* Add the problem details modal */}
        {selectedProblem && (
          <ProblemDetailsModal 
            problem={selectedProblem} 
            onClose={() => setSelectedProblem(null)} 
          />
        )}
      </div>
    </div>
  );
};

export default ModelRankingPopup; 