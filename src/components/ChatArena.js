import React, { useState, useEffect } from 'react';
import './ChatArena.css';
import axios from 'axios';
import { auth } from '../firebase';
import { saveVote, getUserVotesCount, getUserSettings } from '../firebase/database';
import { useChat } from './ChatProvider';
import { AI_MODELS } from '../config/models';
import model_solutions from '../model_solutions.json';
import problemDict from '../leetcode_problem_dict_standardized.json';
import livebenchMathDict from '../livebench_math_question_dict_standardized.json';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const getProblems = (problemDict, livebenchDict) => {
  // Get the problem IDs that have model solutions
  const problemIds = Object.keys(model_solutions);

  const leetcodeProblems = Object.entries(problemDict)
    .filter(([id]) => problemIds.includes(id))
    .map(([id, problem]) => ({
      id,
      title: id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: problem.description,
      difficulty: problem.difficulty,
      source: 'leetcode'
    }));

  const livebenchProblems = Object.entries(livebenchDict)
    .filter(([id]) => problemIds.includes(id))
    .map(([id, problem]) => ({
      id,
      title: problem.title || `Math Question ${problem.cp_id}`,
      description: problem.description,
      difficulty: problem.difficulty,
      source: 'livebench',
      category: problem.category,
      task: problem.task,
      subtask: problem.subtask
    }));

  return [...leetcodeProblems, ...livebenchProblems];
};

const ChatArena = () => {
  const { 
    arenaResponses, 
    setArenaResponses,
    currentArenaProblem,
    setCurrentArenaProblem,
    hasVotedArena,
    setHasVotedArena
  } = useChat();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [streamedResponses, setStreamedResponses] = useState({ modelA: '', modelB: '' });
  const [selectedModels, setSelectedModels] = useState({ modelA: null, modelB: null });
  const [problems] = useState(() => getProblems(problemDict, livebenchMathDict));
  const [userVotesCount, setUserVotesCount] = useState(0);
  const [votesTarget] = useState(50);
  const [userSettings, setUserSettings] = useState(null);
  const [settingsComplete, setSettingsComplete] = useState(false);
  const [voteReason, setVoteReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [selectedVote, setSelectedVote] = useState(null);
  const navigate = useNavigate();
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [streamingInProgress, setStreamingInProgress] = useState(false);
  const [streamingSpeed, setStreamingSpeed] = useState(10); // Default speed (middle of range)

  useEffect(() => {
    if (auth.currentUser) {
      checkUserSettings();
      fetchUserVotesCount();
    }
  }, [auth.currentUser]);

  useEffect(() => {
    if (settingsComplete) {
      selectRandomProblem();
      selectRandomModels();
    }
  }, [settingsComplete]);

  const checkUserSettings = async () => {
    if (!auth.currentUser) return;
    try {
      const settings = await getUserSettings(auth.currentUser.uid);
      console.log('Fetched settings:', settings);
      setUserSettings(settings);
      // Check if all required settings are filled out
      const isComplete = settings && 
        settings.leetcodeProficiency &&
        settings.mathProficiency &&
        settings.llmKnowledge &&
        settings.copilotUsage &&
        settings.csEducation &&
        settings.mathEducation;
      console.log('Settings complete:', isComplete);
      setSettingsComplete(isComplete);
    } catch (err) {
      console.error('Error fetching user settings:', err);
    }
  };

  const selectRandomProblem = () => {
    if (problems.length === 0) return;
    const randomIndex = Math.floor(Math.random() * problems.length);
    setCurrentArenaProblem(problems[randomIndex]);
    // Reset all relevant state when selecting new problem
    setArenaResponses({ modelA: '', modelB: '' });
    setStreamedResponses({ modelA: '', modelB: '' });
    setHasVotedArena(false);
    setSelectedVote(null);
    setVoteReason('');
    setOtherReason('');
  };

  const selectRandomModels = () => {
    const availableModels = [...AI_MODELS];
    const modelA = availableModels.splice(Math.floor(Math.random() * availableModels.length), 1)[0];
    const modelB = availableModels[Math.floor(Math.random() * availableModels.length)];
    setSelectedModels({ modelA, modelB });
  };

  const simulateStreaming = async (text, modelType) => {
    setStreamingInProgress(true);
    const chars = text.split('');
    let currentText = '';
    
    for (let char of chars) {
      if (!streamingEnabled) {
        setStreamedResponses(prev => ({
          ...prev,
          [modelType]: text
        }));
        break;
      }
      
      currentText += char;
      setStreamedResponses(prev => ({
        ...prev,
        [modelType]: currentText
      }));
      // Convert speed (1-20) to delay (10-0.5ms)
      const delay = 10.5 - (streamingSpeed * 0.5);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    setStreamingInProgress(false);
  };

  async function fetchModelResponses(problemId) {
    if (!problemId) {
        console.error('No problem ID provided to fetchModelResponses');
        return null;
    }

    setIsLoading(true);
    try {
        // Get available models for this problem
        const availableModels = Object.keys(model_solutions[problemId]);
        if (availableModels.length < 2) {
            console.error('Not enough models available for problem:', problemId);
            return null;
        }

        // Select two random distinct models
        const model1Index = Math.floor(Math.random() * availableModels.length);
        let model2Index;
        do {
            model2Index = Math.floor(Math.random() * availableModels.length);
        } while (model2Index === model1Index);

        const model1 = availableModels[model1Index];
        const model2 = availableModels[model2Index];

        // Find the corresponding model objects from AI_MODELS
        const modelAObject = AI_MODELS.find(m => m.id === model1);
        const modelBObject = AI_MODELS.find(m => m.id === model2);

        // Set both the selected models and their responses
        const responseA = model_solutions[problemId][model1];
        const responseB = model_solutions[problemId][model2];

        setSelectedModels({ 
            modelA: modelAObject, 
            modelB: modelBObject 
        });
        
        setArenaResponses({
            modelA: responseA,
            modelB: responseB
        });

        // Reset streamed responses
        setStreamedResponses({ modelA: '', modelB: '' });

        if (streamingEnabled) {
          // Start streaming simulation for both models
          await Promise.all([
            simulateStreaming(responseA, 'modelA'),
            simulateStreaming(responseB, 'modelB')
          ]);
        } else {
          // Show responses immediately
          setStreamedResponses({
            modelA: responseA,
            modelB: responseB
          });
        }
    } catch (error) {
        console.error('Error fetching model responses:', error);
        setError('Failed to fetch model responses');
    } finally {
        setIsLoading(false);
    }
  }

  const fetchUserVotesCount = async () => {
    if (!auth.currentUser) return;
    try {
      const count = await getUserVotesCount(auth.currentUser.uid);
      setUserVotesCount(count);
    } catch (err) {
      console.error('Error fetching votes count:', err);
    }
  };

  const handleVoteSelection = (vote) => {
    setSelectedVote(vote);
  };

  const handleSubmitVote = async () => {
    if (!auth.currentUser || !currentArenaProblem || !selectedVote || !voteReason) return;
    
    setIsLoading(true);
    try {
      await saveVote(
        auth.currentUser.uid,
        currentArenaProblem.id,
        selectedVote,
        selectedModels.modelA.id,
        selectedModels.modelB.id,
        arenaResponses.modelA,
        arenaResponses.modelB,
        voteReason === 'other' ? otherReason : voteReason
      );
      setHasVotedArena(true);
      await fetchUserVotesCount();
    } catch (err) {
      setError('Failed to save vote. Please try again.');
      console.error('Error saving vote:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="arena-container">
      <h2>Model Arena</h2>
      
      {!settingsComplete ? (
        <div className="settings-prompt">
          <h3>Complete Your Profile</h3>
          <p>Please complete your settings before using the Model Arena.</p>
          <button 
            onClick={() => {
              console.log('Navigating to settings...');
              navigate('/', { 
                state: { activeTab: 'settings' },
                replace: true 
              });
            }}
          >
            Go to Settings
          </button>
        </div>
      ) : (
        <>
          <div className="votes-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${Math.min((userVotesCount / votesTarget) * 100, 100)}%` }}
              />
            </div>
            <div className="progress-text">
              Votes: {userVotesCount} / {votesTarget}
            </div>
          </div>

          <div className="problem-display">
            <h3>Problem: {currentArenaProblem?.title}</h3>
            {currentArenaProblem?.difficulty && (
              <span className={`difficulty ${currentArenaProblem.difficulty}`}>
                {currentArenaProblem.difficulty.toUpperCase()}
              </span>
            )}
            {currentArenaProblem?.source === 'livebench' && (
              <span className="problem-category">
                {currentArenaProblem.category} - {currentArenaProblem.subtask}
              </span>
            )}
            {currentArenaProblem?.source === 'livebench' ? (
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {currentArenaProblem?.description || ''}
              </ReactMarkdown>
            ) : (
              <pre>{currentArenaProblem?.description || ''}</pre>
            )}
            <div className="problem-actions">
              <button onClick={selectRandomProblem} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Get New Problem'}
              </button>
              <button 
                onClick={() => currentArenaProblem && fetchModelResponses(currentArenaProblem.id)} 
                disabled={isLoading || !currentArenaProblem || (arenaResponses.modelA && arenaResponses.modelB)}
              >
                {isLoading ? 'Submitting...' : 'Submit to Models'}
              </button>
              <div className="streaming-controls">
                <label className="streaming-toggle">
                  <input
                    type="checkbox"
                    checked={streamingEnabled}
                    onChange={(e) => setStreamingEnabled(e.target.checked)}
                    disabled={streamingInProgress}
                  />
                  Enable Streaming
                </label>
                {streamingEnabled && (
                  <div className="speed-control">
                    <span>Speed:</span>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={streamingSpeed}
                      onChange={(e) => setStreamingSpeed(Number(e.target.value))}
                      disabled={streamingInProgress}
                    />
                    <span>{streamingSpeed}x</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="model-comparison">
            <div className="model-response">
              <h3>{hasVotedArena ? selectedModels.modelA?.displayName : 'Model A'}</h3>
              {isLoading ? (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >{streamedResponses.modelA || 'Loading response...'}</ReactMarkdown>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >{arenaResponses.modelA}</ReactMarkdown>
              )}
            </div>

            <div className="model-response">
              <h3>{hasVotedArena ? selectedModels.modelB?.displayName : 'Model B'}</h3>
              {isLoading ? (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >{streamedResponses.modelB || 'Loading response...'}</ReactMarkdown>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >{arenaResponses.modelB}</ReactMarkdown>
              )}
            </div>
          </div>

          <div className="voting-options">
            {!hasVotedArena && (
              <>
                <div className="vote-buttons">
                  <button 
                    disabled={isLoading || !arenaResponses.modelA} 
                    onClick={() => handleVoteSelection('A')}
                    className={selectedVote === 'A' ? 'selected' : ''}
                  >
                    🅰️ Vote for Model A
                  </button>
                  <button 
                    disabled={isLoading || !arenaResponses.modelB}
                    onClick={() => handleVoteSelection('B')}
                    className={selectedVote === 'B' ? 'selected' : ''}
                  >
                    🅱️ Vote for Model B
                  </button>
                  <button 
                    disabled={isLoading || !arenaResponses.modelA || !arenaResponses.modelB}
                    onClick={() => handleVoteSelection('both')}
                    className={selectedVote === 'both' ? 'selected' : ''}
                  >
                    👍 Both are Good
                  </button>
                  <button 
                    disabled={isLoading || !arenaResponses.modelA || !arenaResponses.modelB}
                    onClick={() => handleVoteSelection('neither')}
                    className={selectedVote === 'neither' ? 'selected' : ''}
                  >
                    👎 Both are Bad
                  </button>
                </div>

                <div className="reason-selection">
                  <select 
                    value={voteReason} 
                    onChange={(e) => setVoteReason(e.target.value)}
                    className="reason-dropdown"
                    disabled={!selectedVote}
                  >
                    <option value="">Why did you make this choice?</option>
                    <option value="code_quality">Code Quality</option>
                    <option value="explanation_clarity">Clear Explanation</option>
                    <option value="solution_efficiency">Solution Efficiency</option>
                    <option value="correctness">Correctness</option>
                    <option value="formatting">Better Formatting</option>
                    <option value="other">Other</option>
                  </select>

                  {voteReason === 'other' && (
                    <input
                      type="text"
                      value={otherReason}
                      onChange={(e) => setOtherReason(e.target.value)}
                      placeholder="Please specify your reason..."
                      className="other-reason-input"
                    />
                  )}

                  <button 
                    className="submit-vote-button"
                    disabled={!selectedVote || !voteReason || isLoading}
                    onClick={handleSubmitVote}
                  >
                    Submit Vote
                  </button>
                </div>
              </>
            )}

            {hasVotedArena && (
              <div className="vote-feedback">
                <span className="vote-confirmation">Thanks for voting!</span>
                <button 
                  onClick={selectRandomProblem}
                  disabled={isLoading}
                >
                  Try Another Problem
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatArena; 