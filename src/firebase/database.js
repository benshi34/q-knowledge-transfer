import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { ref, set, get, remove, push } from "firebase/database";
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { auth, database, storage } from '../firebase';
import { modelConfigs } from '../config/modelConfigs';
import { doc, setDoc } from 'firebase/firestore';

export const saveSolvedProblems = async (solvedProblems, modelId) => {
  const user = auth.currentUser;
  if (user) {
    const userRef = ref(database, `users/${user.uid}/solvedProblems/${modelId}`);
    await set(userRef, solvedProblems);
  }
};

export const getSolvedProblems = async () => {
  const user = auth.currentUser;
  if (user) {
    const userRef = ref(database, `users/${user.uid}/solvedProblems`);
    const snapshot = await get(userRef);
    return Array.isArray(snapshot.val()) ? snapshot.val() : [];
  }
  return [];
};

export const markProblemAsSolved = async (problemId) => {
  const user = auth.currentUser;
  if (user) {
    const userRef = ref(database, `users/${user.uid}/solvedProblems`);
    const snapshot = await get(userRef);
    const currentSolvedProblems = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    if (!currentSolvedProblems.includes(problemId)) {
      const updatedSolvedProblems = [...currentSolvedProblems, problemId];
      await set(userRef, updatedSolvedProblems);
      return updatedSolvedProblems;
    }
    return currentSolvedProblems;
  }
  return [];
};

export const saveChatLogs = async (userId, problemId, chatLogs) => {
  const chatRef = ref(database, `users/${userId}/chatLogs/${problemId}`);
  const sanitizedChatLogs = chatLogs.map(message => ({
    id: message.id,
    message: message.message
  }));
  
  await set(chatRef, sanitizedChatLogs);
};

export const getChatLogs = async (userId, problemId) => {
  console.log('getChatLogs called:', { userId, problemId });
  const chatRef = ref(database, `users/${userId}/chatLogs/${problemId}`);
  const snapshot = await get(chatRef);
  console.log('getChatLogs returning:', { chatLogsLength: snapshot.val() ? snapshot.val().length : 0 });
  return snapshot.val() || [];
};

export const uploadChatToGoogleDrive = async (userId, problemId, modelId, chatLogs, timer, isResetChat = false, selfEfficacy = null, rankingData = null) => {
  try {
    // Get the full model config data
    const modelConfig = modelConfigs[modelId];
    
    // Determine if it's a math problem (based on problemId format)
    const isMathProblem = problemId.includes('AMC') || problemId.includes('AIME');
    
    // Get user's current ELO only if it's not a learning problem
    let currentElo = null;
    if (!isLearningProblem(problemId)) {
      const eloRef = ref(database, `users/${userId}/elo/${isMathProblem ? 'math' : 'coding'}`);
      const eloSnapshot = await get(eloRef);
      currentElo = eloSnapshot.val();
      console.log('uploadChatToGoogleDrive - Retrieved ELO:', {
        userId,
        problemId,
        isMathProblem,
        currentElo,
        eloPath: `users/${userId}/elo/${isMathProblem ? 'math' : 'coding'}`
      });
    } else {
      console.log('uploadChatToGoogleDrive - Skipping ELO for learning problem:', problemId);
    }
    
    // Save the model usage data to Firebase using push() to generate a unique key
    const modelUsageRef = ref(database, `users/${userId}/modelUsage`);
    const newModelUsageRef = push(modelUsageRef);
    await set(newModelUsageRef, {
      modelId,
      modelMetadata: {
        displayName: modelConfig.displayName,
        modelName: modelConfig.modelName,
      },
      problemId,
      timestamp: new Date().toISOString(),
      chatStatus: isResetChat ? 'reset' : 'complete',
      timer: timer,
      selfEfficacy: selfEfficacy,
      currentElo: currentElo, // Will be null for learning problems
      modelRanking: rankingData?.ranking,
      surveyResponses: {
        selfEfficacy: rankingData?.selfEfficacy,
        likertResponses: rankingData?.likertResponses,
        feedback: rankingData?.feedback
      }
    });
    
    // Prepare the data to send to backend
    const uploadData = {
      userId,
      problemId,
      modelId,
      modelDisplayName: modelConfig.displayName,
      timestamp: new Date().toISOString(),
      messages: chatLogs,
      chatStatus: isResetChat ? 'reset' : 'complete',
      timer: timer,
      currentElo: currentElo, // Add current ELO
      // Include all survey data in a structured way
      surveyData: {
        modelRanking: rankingData?.ranking || [],
        selfEfficacy: rankingData?.selfEfficacy,
        likertResponses: rankingData?.likertResponses || {},
        feedback: rankingData?.feedback || ''
      }
    };

    // Log the upload data before sending
    console.log('uploadChatToGoogleDrive - Preparing upload data:', {
      userId,
      problemId,
      modelId,
      currentElo,
      isLearningProblem: isLearningProblem(problemId)
    });

    // Make API call to backend
    const response = await fetch('https://code-ht-backend-ac832c92f505.herokuapp.com/upload-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // After successful upload, mark the problem as submitted
    if (!isResetChat) {
      await markProblemAsSubmitted(userId, problemId);
    }

    return data.drive_url;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
};

export const uploadChatToGoogleDriveWithoutModelUsage = async (userId, problemId, modelId, chatLogs, timer, isResetChat = false, selfEfficacy = null, rankingData = null) => {
  try {
    // Get the full model config data
    const modelConfig = modelConfigs[modelId];

    // Determine if it's a math problem (based on problemId format)
    const isMathProblem = problemId.includes('AMC') || problemId.includes('AIME');
    
    // Get user's current ELO only if it's not a learning problem
    let currentElo = null;
    if (!isLearningProblem(problemId)) {
      const eloRef = ref(database, `users/${userId}/elo/${isMathProblem ? 'math' : 'coding'}`);
      const eloSnapshot = await get(eloRef);
      currentElo = eloSnapshot.val();
      console.log('uploadChatToGoogleDriveWithoutModelUsage - Retrieved ELO:', {
        userId,
        problemId,
        isMathProblem,
        currentElo,
        eloPath: `users/${userId}/elo/${isMathProblem ? 'math' : 'coding'}`
      });
    } else {
      console.log('uploadChatToGoogleDriveWithoutModelUsage - Skipping ELO for learning problem:', problemId);
    }

    // Prepare the data to send to backend
    const uploadData = {
      userId,
      problemId,
      modelId,
      modelDisplayName: modelConfig.displayName,
      timestamp: new Date().toISOString(),
      messages: chatLogs,
      chatStatus: isResetChat ? 'reset' : 'complete',
      timer: timer,
      currentElo: currentElo, // Add current ELO
      // Include all survey data in a structured way
      surveyData: {
        modelRanking: rankingData?.ranking || [],
        selfEfficacy: rankingData?.selfEfficacy,
        likertResponses: rankingData?.likertResponses || {},
        feedback: rankingData?.feedback || ''
      }
    };

    // Log the upload data before sending
    console.log('uploadChatToGoogleDriveWithoutModelUsage - Preparing upload data:', {
      userId,
      problemId,
      modelId,
      currentElo,
      isLearningProblem: isLearningProblem(problemId)
    });

    // Make API call to backend
    const response = await fetch('https://code-ht-backend-ac832c92f505.herokuapp.com/upload-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // After successful upload, mark the problem as submitted
    if (!isResetChat) {
      await markProblemAsSubmitted(userId, problemId);
    }

    return data.drive_url;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
};

export const saveNotes = async (userId, problemId, notes) => {
  if (!userId || !problemId) return;
  
  const notesRef = ref(database, `users/${userId}/notes/${problemId}`);
  await set(notesRef, notes);
};

export const getNotes = async (userId, problemId) => {
  if (!userId || !problemId) return null;
  
  const notesRef = ref(database, `users/${userId}/notes/${problemId}`);
  const snapshot = await get(notesRef);
  return snapshot.val();
};

export const signUpWithEmail = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Create a user document in database
    await set(ref(database, `users/${userCredential.user.uid}/profile`), {
      email: email,
      createdAt: new Date().toISOString(),
    });
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const signInWithEmail = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    
    // Create/update user document in database
    await set(ref(database, `users/${userCredential.user.uid}/profile`), {
      email: userCredential.user.email,
      createdAt: new Date().toISOString(),
    });
    
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const saveTestCases = async (userId, problemId, testCases) => {
  if (!userId || !problemId) return;
  
  const testCasesRef = ref(database, `users/${userId}/testCases/${problemId}`);
  await set(testCasesRef, testCases);
};

export const getTestCases = async (userId, problemId) => {
  if (!userId || !problemId) return [];
  
  const testCasesRef = ref(database, `users/${userId}/testCases/${problemId}`);
  const snapshot = await get(testCasesRef);
  const testCases = snapshot.val() || [];
  
  // Ensure all test cases have the required fields
  return testCases.map(testCase => ({
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput: testCase.actualOutput || null,
    passed: testCase.passed || null
  }));
};

export const saveCustomWorkspace = async (userId, workspaceData) => {
  try {
    const customWorkspaceRef = ref(database, `users/${userId}/customWorkspaces/${workspaceData.id}`);
    await set(customWorkspaceRef, workspaceData);
  } catch (error) {
    console.error("Error saving custom workspace:", error);
  }
};

export const getCustomWorkspaces = async (userId) => {
  try {
    const customWorkspacesRef = ref(database, `users/${userId}/customWorkspaces`);
    const snapshot = await get(customWorkspacesRef);
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error getting custom workspaces:", error);
    return {};
  }
};

export const deleteCustomWorkspace = async (userId, workspaceId) => {
  try {
    const workspaceRef = ref(database, `users/${userId}/customWorkspaces/${workspaceId}`);
    await remove(workspaceRef);
    return true;
  } catch (error) {
    console.error('Error deleting custom workspace:', error);
    return false;
  }
};

export const saveEditorContent = async (userId, problemId, content) => {
  if (!userId || !problemId) return;
  
  const editorRef = ref(database, `users/${userId}/editorContent/${problemId}`);
  await set(editorRef, content);
};

export const getEditorContent = async (userId, problemId) => {
  if (!userId || !problemId) return null;
  
  const editorRef = ref(database, `users/${userId}/editorContent/${problemId}`);
  const snapshot = await get(editorRef);
  return snapshot.val();
};

export const saveVote = async (userId, problemId, vote, modelAId = 'gpt-4', modelBId = 'gpt-3.5-turbo', modelAOutput = '', modelBOutput = '') => {
  console.log('Attempting to save vote:', { userId, problemId, vote, modelAId, modelBId });
  
  if (!userId || !problemId) {
    console.log('Missing userId or problemId:', { userId, problemId });
    return;
  }
  
  const voteData = {
    problemId,
    vote, // Can be 'A', 'B', 'both', or 'neither'
    modelA: modelAId,
    modelB: modelBId,
    modelAOutput, // Add model A's output
    modelBOutput, // Add model B's output
    timestamp: new Date().toISOString()
  };
  
  try {
    console.log('Vote data to save:', voteData);
    // Store under user's votes path with a unique push ID
    const votesRef = ref(database, `users/${userId}/votes/${problemId}`);
    const newVoteRef = push(votesRef);
    await set(newVoteRef, voteData);
    console.log('Vote successfully saved');
    return voteData;
  } catch (error) {
    console.error('Error saving vote:', error);
    throw error;
  }
};

export const saveUserSettings = async (userId, settings) => {
  if (!userId) return;
  
  const settingsRef = ref(database, `users/${userId}/settings`);
  await set(settingsRef, settings);
};

export const getUserSettings = async (userId) => {
  if (!userId) return null;
  
  const settingsRef = ref(database, `users/${userId}/settings`);
  const snapshot = await get(settingsRef);
  return snapshot.val();
};

export const getUserVotesCount = async (userId) => {
  if (!userId) return 0;
  
  try {
    const votesRef = ref(database, `users/${userId}/votes`);
    const snapshot = await get(votesRef);
    
    if (!snapshot.exists()) return 0;
    
    // Count all votes across all problems
    let totalVotes = 0;
    const problemsData = snapshot.val();
    
    Object.values(problemsData).forEach(problemVotes => {
      totalVotes += Object.keys(problemVotes).length;
    });
    
    return totalVotes;
  } catch (error) {
    console.error('Error getting votes count:', error);
    return 0;
  }
};

export const saveSolvingModeState = async (userId, problemId, isSolvingMode) => {
  if (!userId || !problemId) return;
  
  const solvingModeRef = ref(database, `users/${userId}/solvingMode/${problemId}`);
  await set(solvingModeRef, isSolvingMode);
};

export const getSolvingModeState = async (userId, problemId) => {
  if (!userId || !problemId) return false;
  
  const solvingModeRef = ref(database, `users/${userId}/solvingMode/${problemId}`);
  const snapshot = await get(solvingModeRef);
  return snapshot.val() || false;
};

export const saveTimerState = async (userId, problemId, timerValue) => {
  if (!userId || !problemId) return;
  
  const timerRef = ref(database, `users/${userId}/timers/${problemId}`);
  await set(timerRef, timerValue);
};

export const getTimerState = async (userId, problemId) => {
  if (!userId || !problemId) return 0;
  
  const timerRef = ref(database, `users/${userId}/timers/${problemId}`);
  const snapshot = await get(timerRef);
  return snapshot.val() || 0;
};

// Add a new function to get recent model usage
export const getRecentModelUsage = async (userId, limit = 5) => {
  try {
    const modelUsageRef = ref(database, `users/${userId}/modelUsage`);
    const snapshot = await get(modelUsageRef);
    
    if (!snapshot.exists()) {
      return [];
    }

    // Convert to array and sort by timestamp
    const allUsageData = Object.entries(snapshot.val())
      .map(([key, data]) => ({
        id: key,
        problemId: data.problemId,
        modelId: data.modelId,
        modelMetadata: data.modelMetadata,
        timestamp: data.timestamp,
        chatStatus: data.chatStatus
      }))
      .filter(item => item.chatStatus === 'complete')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter to keep only the most recent instance of each problem
    const seenProblems = new Set();
    const uniqueUsageData = allUsageData.filter(item => {
      if (seenProblems.has(item.problemId)) {
        return false;
      }
      seenProblems.add(item.problemId);
      return true;
    });

    return uniqueUsageData.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent model usage:', error);
    return [];
  }
};

// Add these new functions for trajectory tracking
export const incrementTrajectoryCount = async (userId) => {
  if (!userId) return;
  
  const userRef = ref(database, `users/${userId}/trajectoryCount`);
  try {
    // Get current count
    const snapshot = await get(userRef);
    const currentCount = snapshot.val() || 0;
    
    // Increment and save
    await set(userRef, currentCount + 1);
    return currentCount + 1;
  } catch (error) {
    console.error('Error incrementing trajectory count:', error);
    throw error;
  }
};

export const getTrajectoryCount = async (userId) => {
  if (!userId) return 0;
  
  const userRef = ref(database, `users/${userId}/trajectoryCount`);
  try {
    const snapshot = await get(userRef);
    return snapshot.val() || 0;
  } catch (error) {
    console.error('Error getting trajectory count:', error);
    return 0;
  }
};

export const saveModelRanking = async (userId, ranking, feedback = '', selfEfficacy = null, likertResponses = null) => {
  if (!userId) return;
  
  try {
    console.log('Starting saveModelRanking:', { userId, ranking, feedback, selfEfficacy, likertResponses });
    
    // Save to Firebase
    const rankingRef = ref(database, `users/${userId}/modelRankings`);
    const newRankingRef = push(rankingRef);
    const timestamp = new Date().toISOString();
    
    await set(newRankingRef, {
      ranking,
      feedback,
      selfEfficacy,
      likertResponses,
      timestamp
    });
    console.log('Successfully saved to Firebase');
    return { success: true };
  } catch (error) {
    console.error('Error in saveModelRanking:', error);
    return { success: false, error: error.message };
  }
};

export const getLatestModelRanking = async (userId) => {
  if (!userId) return null;
  
  try {
    const rankingRef = ref(database, `users/${userId}/modelRankings`);
    const snapshot = await get(rankingRef);
    
    if (!snapshot.exists()) return null;
    
    // Convert to array and find most recent ranking
    const rankings = Object.values(snapshot.val());
    return rankings.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    )[0]?.ranking || null;
  } catch (error) {
    console.error('Error getting latest model ranking:', error);
    return null;
  }
};

// Update these functions to handle different submission limits
export const incrementSubmissionCount = async (userId, problemId, isMathProblem = false) => {
  if (!userId || !problemId) return null;
  
  const submissionRef = ref(database, `users/${userId}/submissions/${problemId}`);
  try {
    // Get current count
    const snapshot = await get(submissionRef);
    const currentCount = snapshot.val()?.count || 0;
    
    // Set max attempts based on problem type
    const maxAttempts = isMathProblem ? 5 : 10;
    
    // Check if we've reached the limit
    if (currentCount >= maxAttempts) {
      return { count: currentCount, hasReachedLimit: true };
    }
    
    // Increment and save
    const newCount = currentCount + 1;
    await set(submissionRef, {
      count: newCount,
      lastUpdated: new Date().toISOString()
    });
    
    return { 
      count: newCount, 
      hasReachedLimit: newCount >= maxAttempts 
    };
  } catch (error) {
    console.error('Error incrementing submission count:', error);
    throw error;
  }
};

export const getSubmissionCount = async (userId, problemId, isMathProblem = false) => {
  if (!userId || !problemId) return null;
  
  const submissionRef = ref(database, `users/${userId}/submissions/${problemId}`);
  try {
    const snapshot = await get(submissionRef);
    const count = snapshot.val()?.count || 0;
    const maxAttempts = isMathProblem ? 5 : 10;
    
    return {
      count,
      hasReachedLimit: count >= maxAttempts
    };
  } catch (error) {
    console.error('Error getting submission count:', error);
    return { count: 0, hasReachedLimit: false };
  }
};

// Add new function to mark a problem as submitted
export const markProblemAsSubmitted = async (userId, problemId) => {
  if (!userId) return;
  
  const submittedRef = ref(database, `users/${userId}/submittedProblems`);
  try {
    // Get current submitted problems
    const snapshot = await get(submittedRef);
    const currentSubmitted = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    
    // Add problem if not already in the list
    if (!currentSubmitted.includes(problemId)) {
      const updatedSubmitted = [...currentSubmitted, problemId];
      await set(submittedRef, updatedSubmitted);
      return updatedSubmitted;
    }
    return currentSubmitted;
  } catch (error) {
    console.error('Error marking problem as submitted:', error);
    return [];
  }
};

// Add function to get submitted problems
export const getSubmittedProblems = async (userId) => {
  if (!userId) return [];
  
  const submittedRef = ref(database, `users/${userId}/submittedProblems`);
  try {
    const snapshot = await get(submittedRef);
    return Array.isArray(snapshot.val()) ? snapshot.val() : [];
  } catch (error) {
    console.error('Error getting submitted problems:', error);
    return [];
  }
};

export const saveCodingTasks = async (userId, tasks) => {
  if (!userId) return;
  
  const tasksRef = ref(database, `users/${userId}/tasks/coding`);
  await set(tasksRef, tasks);
};

export const getCodingTasks = async (userId) => {
  if (!userId) return [];
  
  const tasksRef = ref(database, `users/${userId}/tasks/coding`);
  const snapshot = await get(tasksRef);
  return snapshot.val() || [];
};

export const saveMathTasks = async (userId, tasks) => {
  if (!userId) return;
  
  const tasksRef = ref(database, `users/${userId}/tasks/math`);
  await set(tasksRef, tasks);
};

export const getMathTasks = async (userId) => {
  if (!userId) return [];
  
  const tasksRef = ref(database, `users/${userId}/tasks/math`);
  const snapshot = await get(tasksRef);
  return snapshot.val() || [];
};

export const saveUserElo = async (userId, eloScores) => {
  if (!userId) return;
  
  const eloRef = ref(database, `users/${userId}/elo`);
  await set(eloRef, eloScores);
};

export const getUserElo = async (userId) => {
  if (!userId) return null;
  
  const eloRef = ref(database, `users/${userId}/elo`);
  const snapshot = await get(eloRef);
  return snapshot.val() || null;
};

// Add new helper function to calculate initial math ELO
export const calculateInitialMathElo = (mathProficiency) => {
  const proficiencyMap = {
    '0': 1.75,  // Cannot solve competition math problems
    '1': 1.75,  // Can solve early problems on AMC10/12
    '2': 2.4,   // Can solve majority of problems on AMC10
    '3': 3.0,   // Consistent AIME qualifier
    '4': 4.0,   // Can solve majority of problems on AIME
    '5': 5.0,   // USAMO participant
    '6': 6.0,   // Putnam/IMO
    'no_context': 1.75  // Not enough context on math competitions
  };
  
  return proficiencyMap[mathProficiency] || 1.75; // Default to 1.75 if not found
};

// Update the existing calculateInitialCodingElo function to handle 'no_context'
export const calculateInitialCodingElo = (leetcodeProficiency) => {
  const proficiencyMap = {
    '0': 1100,  // Cannot solve leetcode problems
    '1': 1250,  // Sometimes solve easy
    '2': 1350,  // Consistently solve easy
    '3': 1450,  // Sometimes solve medium
    '4': 1800,  // Consistently solve medium
    '5': 2000,  // Sometimes solve hard
    '6': 2400,  // Consistently solve hard
    'no_context': 1100  // Not enough context on Leetcode
  };
  
  return proficiencyMap[leetcodeProficiency] || 1100; // Default to 1100 if not found
};

// Helper function to check if a problem is a learning problem
const isLearningProblem = (problemId) => {
  // Check if problemId is a 64-character hex string
  return /^[a-f0-9]{64}$/.test(problemId);
};

export const updateUserElo = async (userId, problemId, isSuccess, newElo, isMathProblem = false) => {
  console.log('Starting updateUserElo with params:', {
    userId,
    problemId,
    isSuccess,
    newElo,
    isMathProblem
  });

  if (!userId || !problemId || newElo === undefined) {
    console.warn('Missing required parameters:', {
      hasUserId: !!userId,
      hasProblemId: !!problemId,
      hasNewElo: newElo !== undefined
    });
    return null;
  }

  // Skip ELO updates for learning problems
  if (isLearningProblem(problemId)) {
    console.log('Skipping ELO update for learning problem:', problemId);
    return null;
  }
  
  try {
    // Choose the right path based on problem type
    const eloType = isMathProblem ? 'math' : 'coding';
    const userEloRef = ref(database, `users/${userId}/elo/${eloType}`);
    
    const currentEloSnapshot = await get(userEloRef);
    const currentElo = currentEloSnapshot.val();
    
    console.log(`Current vs New ${eloType.toUpperCase()} ELO:`, {
      currentElo,
      newElo,
      difference: newElo - (currentElo || 0)
    });

    // Save the new ELO
    console.log(`Attempting to save new ${eloType.toUpperCase()} ELO...`);
    await set(userEloRef, newElo);
    console.log('Successfully saved new ELO');

    // Verify the save
    const verifySnapshot = await get(userEloRef);
    const savedElo = verifySnapshot.val();
    console.log('Verification check:', {
      expectedElo: newElo,
      actualSavedElo: savedElo,
      saveSuccessful: savedElo === newElo
    });

    return newElo;
  } catch (error) {
    console.error('Error in updateUserElo:', {
      error,
      errorMessage: error.message,
      errorStack: error.stack
    });
    throw error;
  }
};

// Add these new functions
export const saveModelForProblem = async (userId, problemId, modelId) => {
  if (!userId || !problemId) return;
  
  const modelRef = ref(database, `users/${userId}/problemModels/${problemId}`);
  await set(modelRef, modelId);
};

export const getModelForProblem = async (userId, problemId) => {
  if (!userId || !problemId) return null;
  
  const modelRef = ref(database, `users/${userId}/problemModels/${problemId}`);
  const snapshot = await get(modelRef);
  return snapshot.val();
};

// Add these new functions for voided problems
export const addVoidedProblem = async (userId, problemId) => {
  if (!userId || !problemId) return;
  
  const voidedRef = ref(database, `users/${userId}/voidedProblems`);
  try {
    // Get current voided problems
    const snapshot = await get(voidedRef);
    const currentVoided = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    
    // Add problem if not already in the list
    if (!currentVoided.includes(problemId)) {
      const updatedVoided = [...currentVoided, problemId];
      await set(voidedRef, updatedVoided);
      return updatedVoided;
    }
    return currentVoided;
  } catch (error) {
    console.error('Error adding voided problem:', error);
    return [];
  }
};

export const getVoidedProblems = async (userId) => {
  if (!userId) return [];
  
  const voidedRef = ref(database, `users/${userId}/voidedProblems`);
  try {
    const snapshot = await get(voidedRef);
    return Array.isArray(snapshot.val()) ? snapshot.val() : [];
  } catch (error) {
    console.error('Error getting voided problems:', error);
    return [];
  }
};

// Add these new functions for tracking used models
export const getUsedModels = async (userId) => {
  if (!userId) return [];
  
  const usedModelsRef = ref(database, `users/${userId}/usedModels`);
  const snapshot = await get(usedModelsRef);
  return snapshot.val() || [];
};

export const saveUsedModels = async (userId, usedModels) => {
  if (!userId) return;
  
  const usedModelsRef = ref(database, `users/${userId}/usedModels`);
  await set(usedModelsRef, usedModels);
};

// Add this new function to save model usage data
export const saveModelUsage = async (userId, problemId, modelId, timer, source = null) => {
  if (!userId) return null;
  
  try {
    // Get the full model config data
    const modelConfig = modelConfigs[modelId];
    
    // Save the model usage data to Firebase with a unique key
    const modelUsageRef = ref(database, `users/${userId}/modelUsage`);
    const newModelUsageRef = push(modelUsageRef);
    
    await set(newModelUsageRef, {
      modelId,
      modelMetadata: {
        displayName: modelConfig.displayName,
        modelName: modelConfig.modelName,
      },
      problemId,
      timestamp: new Date().toISOString(),
      chatStatus: 'complete',
      timer: timer,
      source: source
    });
    
    // Return the key so we can update this record later
    return newModelUsageRef.key;
  } catch (error) {
    console.error('Error saving model usage:', error);
    return null;
  }
};

// Add this function to update model usage with ranking data
export const updateModelUsageWithRanking = async (userId, modelUsageKey, ranking, selfEfficacy, likertResponses, feedback) => {
  if (!userId || !modelUsageKey) return false;
  
  try {
    const modelUsageRef = ref(database, `users/${userId}/modelUsage/${modelUsageKey}`);
    
    // Get current data
    const snapshot = await get(modelUsageRef);
    const currentData = snapshot.val();
    
    if (!currentData) return false;
    
    // Update with ranking data
    await set(modelUsageRef, {
      ...currentData,
      modelRanking: ranking,
      surveyResponses: {
        selfEfficacy,
        likertResponses,
        feedback
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating model usage with ranking:', error);
    return false;
  }
};

// Add this function to remove model usage if needed
export const removeModelUsage = async (userId, modelUsageKey) => {
  if (!userId || !modelUsageKey) return;
  
  try {
    const modelUsageRef = ref(database, `users/${userId}/modelUsage/${modelUsageKey}`);
    await remove(modelUsageRef);
    return true;
  } catch (error) {
    console.error('Error removing model usage:', error);
    return false;
  }
};

// Add these new functions for tracking total payout
export const getTotalPayout = async () => {
  try {
    const payoutRef = ref(database, 'public/totalPayout');
    const snapshot = await get(payoutRef);
    return snapshot.val() || 0;
  } catch (error) {
    console.error('Error getting total payout:', error);
    return 0;
  }
};

export const updateTotalPayout = async (additionalPayout) => {
  try {
    // Initialize if needed
    await initializeTotalPayout();
    
    // Get current payout
    const currentPayout = await getTotalPayout();
    const newPayout = currentPayout + additionalPayout;
    
    // Update the total payout
    const payoutRef = ref(database, 'public/totalPayout');
    await set(payoutRef, newPayout);
    
    return newPayout;
  } catch (error) {
    console.error('Error updating total payout:', error);
    throw error;
  }
};

export const isPayoutLimitExceeded = async () => {
  try {
    const totalPayout = await getTotalPayout();
    return totalPayout >= 9000;
  } catch (error) {
    console.error('Error checking payout limit:', error);
    return false; // Default to false to prevent blocking if there's an error
  }
};

// Add new functions to track paid problems
export const markProblemAsPaid = async (userId, problemId) => {
  if (!userId || !problemId) return;
  
  const paidRef = ref(database, `users/${userId}/paidProblems`);
  try {
    const snapshot = await get(paidRef);
    const currentPaid = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    
    if (!currentPaid.includes(problemId)) {
      await set(paidRef, [...currentPaid, problemId]);
    }
  } catch (error) {
    console.error('Error marking problem as paid:', error);
  }
};

export const getPaidProblems = async (userId) => {
  if (!userId) return [];
  
  const paidRef = ref(database, `users/${userId}/paidProblems`);
  try {
    const snapshot = await get(paidRef);
    return Array.isArray(snapshot.val()) ? snapshot.val() : [];
  } catch (error) {
    console.error('Error getting paid problems:', error);
    return [];
  }
};

// Add this function to initialize the total payout if it doesn't exist
export const initializeTotalPayout = async () => {
  try {
    const payoutRef = ref(database, 'public/totalPayout');
    const snapshot = await get(payoutRef);
    
    // Only initialize if it doesn't exist
    if (!snapshot.exists()) {
      await set(payoutRef, 0);
    }
    return true;
  } catch (error) {
    console.error('Error initializing total payout:', error);
    return false;
  }
};

export const saveLearningTasks = async (userId, tasks) => {
  if (!userId) return;
  
  const tasksRef = ref(database, `users/${userId}/tasks/learning`);
  await set(tasksRef, tasks);
};

export const getLearningTasks = async (userId) => {
  if (!userId) return [];
  
  const tasksRef = ref(database, `users/${userId}/tasks/learning`);
  const snapshot = await get(tasksRef);
  return snapshot.val() || [];
};
