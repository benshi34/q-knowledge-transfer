import React, { useState, useEffect } from 'react';
import { problemSources } from '../config/problemSources';
import { 
  getSolvedProblems, 
  getSubmittedProblems, 
  saveCodingTasks, 
  getCodingTasks, 
  saveMathTasks, 
  getMathTasks, 
  getUserElo, 
  getUserSettings, 
  getVoidedProblems, 
  getUsedModels, 
  saveUsedModels,
  saveModelForProblem,
  getTotalPayout,
  updateTotalPayout,
  isPayoutLimitExceeded,
  getUserTaskTypes,
  addVoidedProblem,
  getPaidProblems,
  markProblemAsPaid,
  initializeTotalPayout,
  getLearningTasks,
  saveLearningTasks
} from '../firebase/database';
import { auth } from '../firebase';
import './TaskManager.css';
import { useChat } from './ChatProvider';
import { modelConfigs, isModelAvailable } from '../config/modelConfigs';
import { useNavigate } from 'react-router-dom';
import { FaUser } from 'react-icons/fa';
import { signOut } from 'firebase/auth';

// Update the getTaskPoints function
const getTaskPoints = (problem) => {
  if (problem.source === 'Math-V2') {
    return problem.id.toLowerCase().includes('aime') ? 1.25 : 0.75;
  }
  if (problem.source === 'Learning') {
    return 0.5; // Learning problems are worth 0.5 points
  }
  // Coding problems are now worth 1.5 points
  return 1.5;
};

// Update the getRandomAvailableModel function
const getRandomAvailableModel = async (userId) => {
  // 1. Get all available models from modelConfigs
  const availableModels = Object.entries(modelConfigs)
    .filter(([_, config]) => config.isAvailable)
    .map(([modelId]) => modelId);

  // 2. Get previously used models for this user
  const usedModels = await getUsedModels(userId);

  // 3. Count the usage of each model
  const modelUsageCounts = {};
  availableModels.forEach(model => modelUsageCounts[model] = 0);
  usedModels.forEach(model => {
    modelUsageCounts[model] = (modelUsageCounts[model] || 0) + 1;
  });

  // 4. Find the models with minimum usage
  const minUsageCount = Math.min(...Object.values(modelUsageCounts));
  const leastUsedModels = Object.entries(modelUsageCounts)
    .filter(([_, count]) => count === minUsageCount)
    .map(([model]) => model);

  // 5. Randomly select one of the least used models
  const randomIndex = Math.floor(Math.random() * leastUsedModels.length);
  const selectedModel = leastUsedModels[randomIndex];

  // 6. Add selected model to used models list
  await saveUsedModels(userId, [...usedModels, selectedModel]);

  return selectedModel;
};

const TaskManager = () => {
  const { selectedModel, setSelectedModel } = useChat();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState(null);
  const [assignedProblems, setAssignedProblems] = useState([]);
  const [mathProblems, setMathProblems] = useState([]);
  const [isLoadingMath, setIsLoadingMath] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eloScores, setEloScores] = useState({
    coding: null,
    math: null,
    learning: null
  });
  const [settingsComplete, setSettingsComplete] = useState(false);
  const [userSettings, setUserSettings] = useState(null);
  const [payoutLimitExceeded, setPayoutLimitExceeded] = useState(false);
  const [userPhotoURL, setUserPhotoURL] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [learningProblems, setLearningProblems] = useState([]);
  const [isLoadingLearning, setIsLoadingLearning] = useState(false);

  // Update the limit logic
  const MAX_POINTS = 20; // Change from MAX_TASKS to MAX_POINTS
  const completedProblems = [...assignedProblems, ...mathProblems, ...learningProblems].filter(
    problem => (problem.isSolved && problem.isSubmitted) || problem.isVoided
  ).length;

  // Calculate total points from completed problems
  const totalPoints = [...assignedProblems, ...mathProblems, ...learningProblems]
    .filter(problem => problem.isSolved && problem.isSubmitted && !problem.isVoided)
    .reduce((sum, problem) => sum + getTaskPoints(problem), 0);

  // Calculate points that would be earned if all assigned problems were completed
  const potentialTotalPoints = [...assignedProblems, ...mathProblems, ...learningProblems]
    .filter(problem => !problem.isVoided) // Only count non-voided problems
    .reduce((sum, problem) => sum + getTaskPoints(problem), 0);

  const pointsRemaining = MAX_POINTS - potentialTotalPoints;
  const hasReachedPointLimit = potentialTotalPoints >= MAX_POINTS;

  // Add this useEffect to check if the payout limit has been exceeded
  useEffect(() => {
    const checkPayoutLimit = async () => {
      const exceeded = await isPayoutLimitExceeded();
      setPayoutLimitExceeded(exceeded);
    };

    checkPayoutLimit();
  }, []);

  // Add this useEffect near the top of the component
  useEffect(() => {
    // Initialize total payout when component mounts
    const initialize = async () => {
      try {
        await initializeTotalPayout();
      } catch (error) {
        console.error('Error initializing total payout:', error);
      }
    };
    
    initialize();
  }, []);

  // Update the useEffect to also listen for solved and submitted problems
  useEffect(() => {
    const loadAssignedProblems = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Check payout limit
        const exceeded = await isPayoutLimitExceeded();
        setPayoutLimitExceeded(exceeded);

        // Get all necessary data
        const existingTasks = await getCodingTasks(user.uid);
        const existingMathTasks = await getMathTasks(user.uid);
        const solvedProblems = await getSolvedProblems(user.uid);
        const submittedProblems = await getSubmittedProblems(user.uid);
        const voidedProblems = await getVoidedProblems(user.uid);
        const paidProblems = await getPaidProblems(user.uid);
        
        // Update the tasks with their solved/submitted status
        const updatedCodingTasks = await Promise.all(existingTasks.map(async task => {
          const isSolved = solvedProblems.includes(task.id);
          const isSubmitted = submittedProblems.includes(task.id);
          const isVoided = voidedProblems.includes(task.id);
          const isPaid = paidProblems.includes(task.id);
          
          // Check if this problem is completed but not paid
          if (isSolved && isSubmitted && !isVoided && !isPaid) {
            await updatePayoutForCompletedTask('LeetCode', task.id);
            await markProblemAsPaid(user.uid, task.id);
          }
          
          return {
            ...task,
            isSolved,
            isSubmitted,
            isVoided
          };
        }));

        const updatedMathTasks = await Promise.all(existingMathTasks.map(async task => {
          const isSolved = solvedProblems.includes(task.id);
          const isSubmitted = submittedProblems.includes(task.id);
          const isVoided = voidedProblems.includes(task.id);
          const isPaid = paidProblems.includes(task.id);
          
          // Check if this problem is completed but not paid
          if (isSolved && isSubmitted && !isVoided && !isPaid) {
            await updatePayoutForCompletedTask('Math-V2', task.id);
            await markProblemAsPaid(user.uid, task.id);
          }
          
          return {
            ...task,
            isSolved,
            isSubmitted,
            isVoided
          };
        }));
        
        setAssignedProblems(updatedCodingTasks || []);
        setMathProblems(updatedMathTasks || []);

        // Load learning tasks
        const existingLearningTasks = await getLearningTasks(user.uid);
        const updatedLearningTasks = await Promise.all(existingLearningTasks.map(async task => {
          const isSolved = solvedProblems.includes(task.id);
          const isSubmitted = submittedProblems.includes(task.id);
          const isVoided = voidedProblems.includes(task.id);
          const isPaid = paidProblems.includes(task.id);
          
          if (isSolved && isSubmitted && !isVoided && !isPaid) {
            await updatePayoutForCompletedTask('Learning', task.id);
            await markProblemAsPaid(user.uid, task.id);
          }
          
          return {
            ...task,
            isSolved,
            isSubmitted,
            isVoided
          };
        }));
        
        setLearningProblems(updatedLearningTasks || []);

      } catch (error) {
        console.error('Error loading assigned problems:', error);
        setAssignedProblems([]);
        setMathProblems([]);
        setLearningProblems([]);
      }
    };

    loadAssignedProblems();
  }, []);

  // Add useEffect to fetch ELO scores
  useEffect(() => {
    const loadEloScores = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const elo = await getUserElo(user.uid);
        if (elo) {
          setEloScores(elo);
        }
      } catch (error) {
        console.error('Error loading ELO scores:', error);
      }
    };

    loadEloScores();
  }, []);

  // Add this useEffect to check settings
  useEffect(() => {
    if (auth.currentUser) {
      checkUserSettings();
    }
  }, [auth.currentUser]);

  const checkUserSettings = async () => {
    if (!auth.currentUser) return;
    try {
      const settings = await getUserSettings(auth.currentUser.uid);
      setUserSettings(settings);
      // Check if all required settings are filled out
      const isComplete = settings && 
        settings.leetcodeProficiency &&
        settings.mathProficiency &&
        settings.llmKnowledge &&
        settings.copilotUsage &&
        settings.csEducation &&
        settings.mathEducation;
      setSettingsComplete(isComplete);
    } catch (err) {
      console.error('Error fetching user settings:', err);
    }
  };

  // Add this function to update the total payout when a user completes a task
  const updatePayoutForCompletedTask = async (problemType, problemId) => {
    // Only update if the task wasn't previously completed
    const user = auth.currentUser;
    if (!user) return;

    let taskPoints;
    if (problemType === 'Math-V2') {
      taskPoints = problemId.toLowerCase().includes('aime') ? 1.25 : 0.75;
    } else if (problemType === 'Learning') {
      taskPoints = 0.5;  // Learning problems are worth 0.5 points
    } else {
      taskPoints = 1.5;  // Coding problems are worth 1.5 points
    }
        
    const dollarAmount = taskPoints * 10;
    
    try {
      // Update the global payout counter
      const newTotalPayout = await updateTotalPayout(dollarAmount);
      console.log(`Updated total payout to $${newTotalPayout.toFixed(2)}`);
      
      // Check if we've exceeded the limit
      if (newTotalPayout >= 9000) {
        setPayoutLimitExceeded(true);
      }
    } catch (error) {
      console.error('Error updating total payout:', error);
    }
  };

  // Modify handleGetMoreTasks to use async model selection
  const handleGetMoreTasks = async () => {
    if (hasReachedPointLimit) {
      console.log('Maximum points (20) limit reached');
      return;
    }

    // Check payout limit before proceeding
    const exceeded = await isPayoutLimitExceeded();
    if (exceeded) {
      setPayoutLimitExceeded(true);
      return;
    }

    setIsLoading(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const solvedProblems = await getSolvedProblems();
      const submittedProblems = await getSubmittedProblems(user.uid);
      const userElo = await getUserElo(user.uid);
      const currentElo = userElo?.coding || 1200;

      let availableProblems = [];
      const leetcodeV2Config = Object.values(problemSources).find(source => source.id === 'LeetCode-V2');

      if (leetcodeV2Config) {
        try {
          const problemData = require(`../${leetcodeV2Config.dataFile}`);
          const existingProblemIds = assignedProblems.map(p => p.id);
          
          // Filter problems based on ELO and other criteria
          const sourceProblems = Object.keys(problemData)
            .filter(id => !existingProblemIds.includes(id))
            .filter(id => !solvedProblems.includes(id))
            .filter(id => !submittedProblems.includes(id))
            .map(id => ({
              id,
              ...leetcodeV2Config.mapProblem(id, problemData[id]),
              source: 'LeetCode'
            }));

          // If no problems with higher ELO are found, get the highest available problems
          let filteredProblems = sourceProblems.filter(problem => problem.elo > currentElo);
          if (filteredProblems.length === 0) {
            // Sort by ELO in descending order and take the highest ones
            filteredProblems = sourceProblems
              .sort((a, b) => b.elo - a.elo)
              .slice(0, 10); // Take top 10 to randomize from
          }

          // Split problems into two groups based on ELO ranges
          const normalRangeProblems = filteredProblems.filter(
            p => p.elo <= currentElo + 200 || (filteredProblems[0].elo <= currentElo)
          );
          const challengingRangeProblems = filteredProblems.filter(
            p => p.elo > currentElo + 200 && p.elo <= currentElo + 400
          );

          // Get 3 problems if it's the first time (empty array), otherwise get 2
          const numProblemsToGet = assignedProblems.length === 0 ? 3 : 2;
          
          const selectedProblems = [];
          for (let i = 0; i < numProblemsToGet; i++) {
            const useNormalRange = Math.random() < 0.75;
            const candidateProblems = useNormalRange ? normalRangeProblems : challengingRangeProblems;

            if (candidateProblems.length > 0) {
              const randomIndex = Math.floor(Math.random() * candidateProblems.length);
              const selectedProblem = candidateProblems[randomIndex];
              
              // Get a new model for this problem
              const modelForProblem = await getRandomAvailableModel(user.uid);
              await saveModelForProblem(user.uid, selectedProblem.id, modelForProblem);
              
              selectedProblems.push({
                ...selectedProblem,
                assignedModel: modelForProblem
              });

              normalRangeProblems.splice(normalRangeProblems.indexOf(selectedProblem), 1);
              challengingRangeProblems.splice(challengingRangeProblems.indexOf(selectedProblem), 1);
            }
          }

          // Add metadata to selected problems
          const randomProblems = selectedProblems.map(problem => ({
            ...problem,
            isSolved: false,
            isSubmitted: false,
            dueDate: 'May 5th'
          }));

          const updatedProblems = [...assignedProblems, ...randomProblems];
          setAssignedProblems(updatedProblems);
          await saveCodingTasks(user.uid, updatedProblems);

        } catch (error) {
          console.error('Error loading LeetCode V2 problem data:', error);
        }
      }
    } catch (error) {
      console.error('Error getting more tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update handleGetMoreMathTasks to filter out voided problems
  const handleGetMoreMathTasks = async () => {
    if (hasReachedPointLimit) {
      console.log('Maximum points (20) limit reached');
      return;
    }

    // Check payout limit before proceeding
    const exceeded = await isPayoutLimitExceeded();
    if (exceeded) {
      setPayoutLimitExceeded(true);
      return;
    }

    setIsLoadingMath(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const mathV2Config = problemSources['Math-V2'];
      const userElo = await getUserElo(user.uid);
      const currentElo = userElo?.math || 1200;
      let availableProblems = [];

      try {
        const problemData = require(`../${mathV2Config.dataFile}`);
        const existingProblemIds = mathProblems.map(p => p.id);
        const voidedProblems = await getVoidedProblems(user.uid);
        
        const sourceProblems = Object.keys(problemData)
          .filter(id => !existingProblemIds.includes(id))
          .filter(id => !voidedProblems.includes(id))
          .map(id => ({
            id,
            ...mathV2Config.mapProblem(id, problemData[id]),
            source: 'Math-V2'
          }));
        
        // Split problems into two groups based on ELO ranges, similar to coding problems
        const normalRangeProblems = sourceProblems.filter(
          p => p.elo <= currentElo + 0.75
        );
        const challengingRangeProblems = sourceProblems.filter(
          p => p.elo > currentElo + 0.75 && p.elo <= currentElo + 1.25
        );

        // If no problems in normal range, take the lowest available problems
        if (normalRangeProblems.length === 0) {
          availableProblems = sourceProblems
            .sort((a, b) => a.elo - b.elo) // Sort by ELO in ascending order
            .slice(0, 10); // Take lowest 10 to randomize from
        } else {
          // Get problems with 75% chance from normal range, 25% chance from challenging range
          const numProblemsToGet = mathProblems.length === 0 ? 3 : 2;
          const selectedProblems = [];

          for (let i = 0; i < numProblemsToGet; i++) {
            const useNormalRange = Math.random() < 0.75;
            const candidateProblems = useNormalRange ? normalRangeProblems : challengingRangeProblems;

            if (candidateProblems.length > 0) {
              const randomIndex = Math.floor(Math.random() * candidateProblems.length);
              const selectedProblem = candidateProblems[randomIndex];
              selectedProblems.push(selectedProblem);

              // Remove selected problem from both arrays to avoid duplicates
              const normalIndex = normalRangeProblems.indexOf(selectedProblem);
              if (normalIndex > -1) normalRangeProblems.splice(normalIndex, 1);
              
              const challengingIndex = challengingRangeProblems.indexOf(selectedProblem);
              if (challengingIndex > -1) challengingRangeProblems.splice(challengingIndex, 1);
            }
          }

          availableProblems = selectedProblems;
        }
      } catch (error) {
        console.error('Error loading Math-V2 problem data:', error);
      }

      // Select and assign models to problems
      const selectedProblems = [];
      const randomizedProblems = availableProblems.sort(() => Math.random() - 0.5);
      const numProblemsToGet = mathProblems.length === 0 ? 3 : 2;

      for (let i = 0; i < Math.min(numProblemsToGet, randomizedProblems.length); i++) {
        const selectedProblem = randomizedProblems[i];
        
        // Get a new model for this problem
        const modelForProblem = await getRandomAvailableModel(user.uid);
        await saveModelForProblem(user.uid, selectedProblem.id, modelForProblem);
        
        selectedProblems.push({
          ...selectedProblem,
          assignedModel: modelForProblem,
          isSolved: false,
          isSubmitted: false,
          dueDate: 'May 5th'
        });
      }

      const updatedProblems = [...mathProblems, ...selectedProblems];
      setMathProblems(updatedProblems);
      await saveMathTasks(user.uid, updatedProblems);
    } catch (error) {
      console.error('Error getting more math tasks:', error);
    } finally {
      setIsLoadingMath(false);
    }
  };

  // Add this new handler function near the other task handlers
  const handleGetMoreLearningTasks = async () => {
    if (hasReachedPointLimit) {
      console.log('Maximum points (20) limit reached');
      return;
    }

    // Check payout limit before proceeding
    const exceeded = await isPayoutLimitExceeded();
    if (exceeded) {
      setPayoutLimitExceeded(true);
      return;
    }

    setIsLoadingLearning(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const learningConfig = problemSources['Learning'];
      let availableProblems = [];

      try {
        const problemData = require(`../${learningConfig.dataFile}`);
        const existingProblemIds = learningProblems.map(p => p.id);
        const solvedProblems = await getSolvedProblems(user.uid);
        const submittedProblems = await getSubmittedProblems(user.uid);
        const voidedProblems = await getVoidedProblems(user.uid);
        
        // Filter problems that haven't been assigned, solved, submitted, or voided
        const sourceProblems = Object.keys(problemData)
          .filter(id => !existingProblemIds.includes(id))
          .filter(id => !solvedProblems.includes(id))
          .filter(id => !submittedProblems.includes(id))
          .filter(id => !voidedProblems.includes(id))
          .map(id => ({
            id,
            ...learningConfig.mapProblem(id, problemData[id]),
            source: 'Learning'
          }));
        
        availableProblems = sourceProblems;
      } catch (error) {
        console.error('Error loading Learning problem data:', error);
      }

      // Get 3 problems if it's the first time (empty array), otherwise get 2
      const numProblemsToGet = learningProblems.length === 0 ? 3 : 2;

      // Randomly select problems
      const selectedProblems = [];
      const randomizedProblems = availableProblems.sort(() => Math.random() - 0.5);

      for (let i = 0; i < Math.min(numProblemsToGet, randomizedProblems.length); i++) {
        const selectedProblem = randomizedProblems[i];
        
        // Get a new model for this problem
        const modelForProblem = await getRandomAvailableModel(user.uid);
        await saveModelForProblem(user.uid, selectedProblem.id, modelForProblem);
        
        selectedProblems.push({
          ...selectedProblem,
          assignedModel: modelForProblem,
          isSolved: false,
          isSubmitted: false,
          dueDate: 'May 5th'
        });
      }

      const updatedProblems = [...learningProblems, ...selectedProblems];
      setLearningProblems(updatedProblems);
      await saveLearningTasks(user.uid, updatedProblems);
    } catch (error) {
      console.error('Error getting more learning tasks:', error);
    } finally {
      setIsLoadingLearning(false);
    }
  };

  // Add this effect to load user photo URL
  useEffect(() => {
    if (auth.currentUser) {
      setUserPhotoURL(auth.currentUser.photoURL);
    }
  }, []);

  // Add this effect to close the menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileMenu && !event.target.closest('.user-profile')) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/'); // Redirect to home page after logout
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  // Add this function to handle settings navigation
  const handleSettingsClick = () => {
    navigate('/', { 
      state: { activeTab: 'settings' },
      replace: true 
    });
  };

  // Add this function near other handlers
  const handleVoidProblem = async (problemId) => {
    if (window.confirm('Are you sure you want to void this problem? This cannot be undone.')) {
      try {
        await addVoidedProblem(auth.currentUser.uid, problemId);
        // Update the local state to reflect the change
        setMathProblems(prevProblems => 
          prevProblems.map(problem => 
            problem.id === problemId 
              ? { ...problem, isVoided: true }
              : problem
          )
        );
      } catch (error) {
        console.error('Error voiding problem:', error);
      }
    }
  };

  // If coding task is selected, show problem list view
  if (selectedTask === 'coding') {
    return (
      <div className="task-manager-container">
        <button 
          className="back-button"
          onClick={() => setSelectedTask(null)}
        >
          ← Back to Tasks
        </button>

        <div className="problem-list-header">
          <h2>Assigned Coding Problems</h2>
        </div>

        <div className="problem-table-container">
          <table className="problem-table">
            <thead>
              <tr>
                <th>Solved</th>
                <th>Submitted</th>
                <th>Problem</th>
                <th>Difficulty</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {assignedProblems.map((problem, index) => (
                <tr key={problem.id} className={problem.isVoided ? 'voided-problem' : ''}>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSolved ? (
                      <span className="status-icon solved">✅</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSubmitted ? (
                      <span className="status-icon submitted">📤</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="voided">Problem {index + 1}</span>
                    ) : (
                      <a 
                        href={`/chat/${problem.id}?source=${problem.source.toLowerCase()}`} 
                        className={`problem-link ${problem.isVoided ? 'voided' : ''}`}
                        style={problem.isVoided ? { textDecoration: 'line-through' } : {}}
                      >
                        Problem {index + 1}
                      </a>
                    )}
                  </td>
                  <td className={`difficulty ${problem.difficulty}`}>
                    {problem.difficulty}
                  </td>
                  <td>1.5</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="get-more-tasks">
            <button 
              onClick={handleGetMoreTasks}
              disabled={(assignedProblems.length > 0 && 
                !assignedProblems.every(p => (p.isSolved && p.isSubmitted) || p.isVoided)) || 
                isLoading || 
                hasReachedPointLimit}
              className="get-more-tasks-button"
            >
              {isLoading ? 'Loading...' : hasReachedPointLimit ? 'Max Points Limit Reached' : 'Get More Tasks'}
            </button>
            {!hasReachedPointLimit && (
              <p className="tasks-incomplete-message">
                Complete all current tasks (solve and submit) to get more problems
              </p>
            )}
          </div>
        </div>

        <p className="difficulty-help-message" style={{ 
          marginTop: '40px', 
          textAlign: 'center', 
          color: '#666',
          borderTop: '1px solid #eee',
          paddingTop: '20px'
        }}>
          If you find the difficulty of these tasks impossible to complete even with AI assistance, 
          please contact qbshi@princeton.edu
        </p>
      </div>
    );
  }

  // If math task is selected, show math problem list view
  if (selectedTask === 'math') {
    const allMathTasksCompleted = mathProblems.length > 0 && 
      mathProblems.every(problem => 
        (problem.isSolved && problem.isSubmitted) || problem.isVoided
      );

    return (
      <div className="task-manager-container">
        <button 
          className="back-button"
          onClick={() => setSelectedTask(null)}
        >
          ← Back to Tasks
        </button>

        <div className="problem-list-header">
          <h2>Assigned Math Problems</h2>
        </div>

        <div className="problem-table-container">
          <table className="problem-table">
            <thead>
              <tr>
                <th>Solved</th>
                <th>Submitted</th>
                <th>Problem</th>
                <th>Difficulty</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mathProblems.map((problem, index) => (
                <tr key={problem.id} className={problem.isVoided ? 'voided-problem' : ''}>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSolved ? (
                      <span className="status-icon solved">✅</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSubmitted ? (
                      <span className="status-icon submitted">📤</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="voided">Problem {index + 1}</span>
                    ) : (
                      <a 
                        href={`/chat/${problem.id}?source=${problem.source}`} 
                        className={`problem-link ${problem.isVoided ? 'voided' : ''}`}
                        style={problem.isVoided ? { textDecoration: 'line-through' } : {}}
                      >
                        Problem {index + 1}
                      </a>
                    )}
                  </td>
                  <td className={`difficulty ${problem.difficulty}`}>
                    {problem.difficulty}
                  </td>
                  <td>
                    {problem.id.toLowerCase().includes('aime') ? '1.25' : '0.75'}
                  </td>
                  <td>
                    {!problem.isVoided && !problem.isSolved && (
                      <button 
                        className="void-problem-button"
                        onClick={() => handleVoidProblem(problem.id)}
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="get-more-tasks">
            <button 
              onClick={handleGetMoreMathTasks}
              disabled={(mathProblems.length > 0 && !allMathTasksCompleted) || isLoadingMath || hasReachedPointLimit}
              className="get-more-tasks-button"
            >
              {isLoadingMath ? 'Loading...' : hasReachedPointLimit ? 'Max Points Limit Reached' : 'Get More Math Tasks'}
            </button>
            {!allMathTasksCompleted && (
              <p className="tasks-incomplete-message">
                Complete all current tasks (solve and submit) to get more problems
              </p>
            )}
          </div>
        </div>

        <p className="difficulty-help-message" style={{ 
          marginTop: '40px', 
          textAlign: 'center', 
          color: '#666',
          borderTop: '1px solid #eee',
          paddingTop: '20px'
        }}>
          If you find the difficulty of these tasks impossible to complete even with AI assistance, 
          please contact qbshi@princeton.edu
        </p>
      </div>
    );
  }

  // Add learning task view
  if (selectedTask === 'learning') {
    const allLearningTasksCompleted = learningProblems.length > 0 && 
      learningProblems.every(problem => 
        (problem.isSolved && problem.isSubmitted) || problem.isVoided
      );

    return (
      <div className="task-manager-container">
        <button 
          className="back-button"
          onClick={() => setSelectedTask(null)}
        >
          ← Back to Tasks
        </button>

        <div className="problem-list-header">
          <h2>Assigned Learning Problems</h2>
        </div>

        <div className="problem-table-container">
          <table className="problem-table">
            <thead>
              <tr>
                <th>Solved</th>
                <th>Submitted</th>
                <th>Problem</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {learningProblems.map((problem, index) => (
                <tr key={problem.id} className={problem.isVoided ? 'voided-problem' : ''}>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSolved ? (
                      <span className="status-icon solved">✅</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="status-icon voided">❌</span>
                    ) : problem.isSubmitted ? (
                      <span className="status-icon submitted">📤</span>
                    ) : (
                      <span className="status-icon pending">⭕</span>
                    )}
                  </td>
                  <td>
                    {problem.isVoided ? (
                      <span className="voided">Problem {index + 1}</span>
                    ) : (
                      <a 
                        href={`/chat/${problem.id}?source=${problem.source}`} 
                        className={`problem-link ${problem.isVoided ? 'voided' : ''}`}
                        style={problem.isVoided ? { textDecoration: 'line-through' } : {}}
                      >
                        Problem {index + 1}
                      </a>
                    )}
                  </td>
                  <td>0.5</td>
                  <td>
                    {!problem.isVoided && !problem.isSolved && (
                      <button 
                        className="void-problem-button"
                        onClick={() => handleVoidProblem(problem.id)}
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="get-more-tasks">
            <button 
              onClick={handleGetMoreLearningTasks}
              disabled={(learningProblems.length > 0 && !allLearningTasksCompleted) || 
                isLoadingLearning || 
                hasReachedPointLimit}
              className="get-more-tasks-button"
            >
              {isLoadingLearning ? 'Loading...' : hasReachedPointLimit ? 'Max Points Limit Reached' : 'Get More Learning Tasks'}
            </button>
            {!allLearningTasksCompleted && (
              <p className="tasks-incomplete-message">
                Complete all current tasks (solve and submit) to get more problems
              </p>
            )}
          </div>
        </div>

        <p className="difficulty-help-message" style={{ 
          marginTop: '40px', 
          textAlign: 'center', 
          color: '#666',
          borderTop: '1px solid #eee',
          paddingTop: '20px'
        }}>
          If you find the difficulty of these tasks impossible to complete even with AI assistance, 
          please contact qbshi@princeton.edu
        </p>
      </div>
    );
  }

  // Modify the return statement to show settings prompt if not complete
  if (!settingsComplete) {
    return (
      <div className="task-manager-container">
        <div className="settings-prompt">
          <h3>Complete Your Profile</h3>
          <p>Please complete your settings before accessing the Task Manager.</p>
          <button 
            onClick={() => {
              navigate('/', { 
                state: { activeTab: 'settings' },
                replace: true 
              });
            }}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  // Add payout limit exceeded message to the UI
  if (payoutLimitExceeded) {
    return (
      <div className="task-manager-container">
        <div className="payout-limit-exceeded">
          <h2>Maximum Payout Limit Reached</h2>
          <p>We're sorry, but we've reached our maximum payout budget of $9,000 for this study.</p>
          <p>Thank you for your participation! No new tasks can be assigned at this time.</p>
        </div>
      </div>
    );
  }

  // Original task manager view
  return (
    <div className="task-manager-container">
      <div className="instructions-section">
        <h2>Instructions</h2>
        <div className="instructions-box">
          <div style={{
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <p style={{ margin: '0' }}>
              📖 <a 
                href="https://docs.google.com/document/d/1L3Qta4nDzw3VqlYe0a5iazxMEWb26wglnpKkWQBLDxs/edit?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#007bff',
                  fontWeight: 'bold',
                  textDecoration: 'underline'
                }}
              >
                Click here for detailed instructions and guidelines
              </a>
            </p>
          </div>

          <p className="instructions-text">
            Welcome to your task list! Here are some important points to keep in mind:
            <ul>
              <li>All tasks must be completed by May 5th</li>
              <li>Each task requires collaboration with an AI assistant</li>
              <li>Complete tasks in any order you prefer</li>
            </ul>

            <h3>Important Rules:</h3>
            <ul>
              <li><strong>No External Resources:</strong> You may not consult the internet or any external resources during task completion</li>
              <li><strong>Model Interaction Rules:</strong> While chatting with the model, you may not make calculations on scratch paper for math questions, and you may not write code in other editors</li>
              <li><strong>AI Interaction:</strong> Interact with AI models in accordance with provider guidelines (OpenAI, Anthropic). Use the models as intended for normal human interaction</li>
              <li><strong>Feedback Quality:</strong> We encourage thoughtful responses in the feedback questionnaire and careful consideration of your rankings. Extra task points will be awarded for high-quality responses</li>
            </ul>

            <div className="warning-box">
              <p><strong>⚠️ Notice:</strong> Interactions on this platform are recorded. Any evidence of system abuse or foul play will result in:</p>
              <ul>
                <li>Immediate reset of all task points to 0</li>
                <li>Permanent ban from future participation</li>
              </ul>
            </div>

            <div className="warning-box" style={{ marginTop: '15px' }}>
              <p><strong>⚠️ Important:</strong> Only interact with the task category you were assigned to:</p>
              <ul>
                <li>Task points from other categories will not count towards your total</li>
                <li>Attempting other categories may cause unexpected system behavior</li>
                <li>Stick to your assigned category to ensure proper tracking and payment</li>
              </ul>
            </div>
          </p>
        </div>
      </div>

      <div className="completion-bar-container">
        <div className="completion-stats">
          <span>Point Progress <span className="progress-explanation">(maximum: 20 points)</span></span>
          <span>{totalPoints.toFixed(2)}/{MAX_POINTS} Points</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${(totalPoints / MAX_POINTS) * 100}%` }}
          ></div>
        </div>
        <div className="stats-container">
          <div className="payout-info">
            <span className="payout-label">Estimated Payout:</span> 
            <span className="payout-value">${(totalPoints * 10).toFixed(2)}</span>
          </div>
          <div className="elo-scores">
            <div className="elo-score coding">
              <span className="elo-label">Coding ELO:</span>
              <span className="elo-value">
                {eloScores.coding 
                  ? eloScores.coding.toFixed(2)
                  : 'Not initialized'}
              </span>
            </div>
            <div className="elo-score math">
              <span className="elo-label">Math ELO:</span>
              <span className="elo-value">
                {eloScores.math 
                  ? eloScores.math.toFixed(2)
                  : 'Not initialized'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="task-manager-header">
        <h2>Task Manager</h2>
        {auth.currentUser && (
          <div className="user-profile">
            <div className="profile-icon" onClick={() => setShowProfileMenu(!showProfileMenu)}>
              {userPhotoURL ? (
                <img 
                  src={userPhotoURL} 
                  alt="Profile" 
                  className="user-avatar"
                />
              ) : (
                <FaUser size={20} color="#666" />
              )}
            </div>
            {showProfileMenu && (
              <div className="profile-menu">
                <div className="profile-email">{auth.currentUser.email}</div>
                <div className="profile-menu-item" onClick={handleSettingsClick}>
                  Settings
                </div>
                <div className="profile-menu-item" onClick={handleLogout}>
                  Logout
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="task-list">
        <div 
          className="task-card pending"
          onClick={() => setSelectedTask('coding')}
          style={{ cursor: 'pointer' }}
        >
          <h3>Coding Challenge</h3>
          <p>Solve programming problem with AI assistance</p>
          <div className="task-meta">
            <span>Due: May 5th</span>
            <span>Coding</span>
          </div>
        </div>
        
        <div 
          className="task-card in-progress"
          onClick={() => setSelectedTask('math')}
          style={{ cursor: 'pointer' }}
        >
          <h3>Math Problem</h3>
          <p>Solve mathematics problem with AI assistance</p>
          <div className="task-meta">
            <span>Due: May 5th</span>
            <span>Math</span>
          </div>
        </div>
        
        <div 
          className="task-card learning"
          onClick={() => setSelectedTask('learning')}
          style={{ cursor: 'pointer' }}
        >
          <h3>Learning Tasks</h3>
          <p>Complete learning exercises with AI assistance</p>
          <div className="task-meta">
            <span>Due: May 5th</span>
            <span>Learning</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskManager;