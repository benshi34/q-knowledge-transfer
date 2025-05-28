import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from './ChatProvider';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { saveAs } from 'file-saver';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { 
  markProblemAsSolved, 
  uploadChatToGoogleDrive, 
  getCustomWorkspaces, 
  saveEditorContent, 
  getEditorContent, 
  saveSolvingModeState, 
  getSolvingModeState, 
  getTimerState, 
  getRecentModelUsage, 
  incrementTrajectoryCount, 
  incrementSubmissionCount, 
  getSubmissionCount, 
  updateUserElo, 
  getModelForProblem, 
  addVoidedProblem, 
  getUserElo, 
  getSubmittedProblems, 
  getSolvedProblems,
  saveModelUsage,
  removeModelUsage,
  uploadChatToGoogleDriveWithoutModelUsage
} from '../firebase/database';
import 'katex/dist/katex.min.css';
import '../LoadingScreen.css';
import { modelConfigs } from '../config/modelConfigs';
import { problemSources } from '../config/problemSources';

import Editor from "@monaco-editor/react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle
} from "react-resizable-panels";
import TabPanel from './TabPanel';
import 'react-chat-elements/dist/main.css';
import { FaUser } from 'react-icons/fa';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import WelcomePopup from './WelcomePopup';
import Confetti from 'react-confetti';
import ModelRankingPopup from './ModelRankingPopup';
import MaxSubmissionsModal from './MaxSubmissionsModal';
import './ChatInterface.css';
import { generateOpenAIResponse, generateOpenAIStreamingResponse } from '../api/openaiService';

// Add this new component for code blocks with execution button
const CodeBlock = ({ code, language, onCodeEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  // Ensure we're displaying the code with proper escaping
  const [editedCode, setEditedCode] = useState(code);
  
  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editedCode !== code) {  // Only notify if code actually changed
      onCodeEdit(editedCode);
    }
  };

  return (
    <div className="code-block-container">
      {isEditing ? (
        <div className="code-editor">
          <textarea
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
            className="code-textarea"
          />
          <button className="save-code-button" onClick={handleSave}>
            Save
          </button>
        </div>
      ) : (
        <>
          <SyntaxHighlighter 
            language={language} 
            wrapLines={true} 
            wrapLongLines={true}
            // Add these props to properly handle backslashes
            useInlineStyles={true}
            PreTag="div"
          >
            {editedCode}
          </SyntaxHighlighter>
          <div className="code-block-buttons">
            <button 
              className="edit-code-button"
              onClick={handleEdit}
            >
              Edit Code
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// Modify the TextBlock component to remove the simplify functionality
const TextBlock = ({ content }) => {
  return (
    <div className="text-block-container">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const SAVE_INTERVAL = 30000; // Save every 30 seconds
const LOCAL_STORAGE_KEY = (problemId) => `timer-${problemId}`;

// Add this helper function before the ChatInterface component
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const pad = (num) => num.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
  }
  return `${pad(minutes)}:${pad(remainingSeconds)}`;
};

// Update the MathAnswerSubmission component
const MathAnswerSubmission = ({ answer, setAnswer, onSubmit, submissionCount, isSubmitting, isSolvingMode, isProblemSolved }) => {
  return (
    <div className="math-answer-section">
      <div className={`math-answer-container ${!isSolvingMode ? 'editor-disabled' : ''}`}>
        {!isSolvingMode && (
          <div className="editor-overlay">
            <p>Click "Ready to Solve" to start solving.</p>
            <p>Note: Once you start solving, you won't be able to chat with the assistant.</p>
          </div>
        )}
        <h3>Your Solution</h3>
        <div className="math-input-wrapper">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="math-answer-input"
            disabled={!isSolvingMode}
          />
          <button 
            className="math-submit-button"
            onClick={onSubmit}
            disabled={submissionCount >= 5 || isSubmitting || !isSolvingMode || isProblemSolved}
          >
            {isSubmitting ? 'Grading...' : isProblemSolved ? 'Already Solved' : 'Submit'}
          </button>
        </div>
        <div className="math-answer-footer">
          <p className="math-answer-hint">
            Please provide your final answer in simplified form. 
            Double-check your work before submitting.
          </p>
          <span className="submission-count">
            Submissions: {submissionCount}/5
          </span>
        </div>
        {isSubmitting && (
          <div className="loading-container">
            <div className="loading-bar"></div>
            <div className="loading-text">
              Grading your answer...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Update the validateMathAnswer function
const validateMathAnswer = async (userAnswer, problemId) => {
  try {
    // Get the problem data from the JSON file
    const problemData = require(`../livebench_math_question_dict_standardized_expanded.json`);
    const problem = problemData[problemId];
    
    if (!problem) {
      throw new Error('Problem not found');
    }

    // Convert ground_truth from string to number if it's a valid number
    const groundTruthValue = !isNaN(problem.ground_truth) 
      ? problem.ground_truth  // Keep as string for comparison
      : problem.options?.[problem.ground_truth];
    
    if (!groundTruthValue) {
      throw new Error('Ground truth answer not found');
    }

    // Prepare the prompt for the LLM
    const prompt = `Compare these two mathematical expressions and determine if they are equivalent:
Expression 1: ${userAnswer}
Expression 2: ${groundTruthValue}

Respond with ONLY "true" if they are mathematically equivalent, or "false" if they are not equivalent.`;

    // Make API call to validate
    const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/generate', {
      messages: [{
        role: 'user',
        content: prompt
      }],
      model: 'gpt-4o', // or whatever model you want to use for validation
    });

    // Extract the response (should be just "true" or "false")
    const isCorrect = response.data.message.toLowerCase().includes('true');
    
    return {
      isCorrect,
      groundTruthLetter: problem.ground_truth,
      groundTruthValue
    };
  } catch (error) {
    console.error('Error validating math answer:', error);
    throw error;
  }
};

// Add these helper functions at the top of the file, before the ChatInterface component
const calculateEloChange = (playerElo, problemElo, isCorrect, isMathProblem) => {
  // Extract the correct ELO value based on problem type
  const currentElo = typeof playerElo === 'object' ? 
    (isMathProblem ? playerElo.math : playerElo.coding) : 
    playerElo;

  console.log('ELO Calculation Input:', {
    currentElo,  // Now using the correct ELO value
    problemElo,
    isCorrect,
    isMathProblem
  });

  // Validate inputs
  if (!Number.isFinite(currentElo) || !Number.isFinite(problemElo)) {
    console.error('Invalid ELO values:', { currentElo, problemElo });
    return isMathProblem ? 5 : 1500; // Return default values if inputs are invalid
  }

  // Increased K-factors for larger rating changes
  const K = isMathProblem ? 0.8 : 64;  // Increased from 0.2 and 32
  const scaleFactor = isMathProblem ? 1 : 200;  // Decreased from 400 to make changes more dramatic
  
  const expectedProbability = 1 / (1 + Math.pow(10, (problemElo - currentElo) / scaleFactor));
  const actualOutcome = isCorrect ? 1 : 0;
  const eloChange = K * (actualOutcome - expectedProbability);
  
  const newElo = currentElo + eloChange;
  
  console.log('ELO Calculation Output:', {
    expectedProbability,
    actualOutcome,
    eloChange,
    newElo
  });

  if (isMathProblem) {
    return Math.min(Math.max(newElo, 1), 10);
  } else {
    return Math.min(Math.max(newElo, 1000), 4000);
  }
};

// Add this new component near other components
const LearningAnswerSubmission = ({ answer, setAnswer, onSubmit, submissionCount, isSubmitting, isSolvingMode, isProblemSolved }) => {
  return (
    <div className="learning-answer-section">
      <div className={`math-answer-container ${!isSolvingMode ? 'editor-disabled' : ''}`}>
        {!isSolvingMode && (
          <div className="editor-overlay">
            <p>Click "Ready to Solve" to start solving.</p>
            <p>Note: Once you start solving, you won't be able to chat with the assistant.</p>
          </div>
        )}
        <h3>Your Answer</h3>
        <div className="math-input-wrapper">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="math-answer-input"
            disabled={!isSolvingMode || submissionCount >= 1 || isProblemSolved}
          />
          <button 
            className="math-submit-button"
            onClick={onSubmit}
            disabled={submissionCount >= 1 || isSubmitting || !isSolvingMode || isProblemSolved}
          >
            {isSubmitting ? 'Grading...' : isProblemSolved ? 'Already Solved' : submissionCount >= 1 ? 'No More Attempts' : 'Submit'}
          </button>
        </div>
        <div className="math-answer-footer">
          <p className="math-answer-hint">
            You only get one submission attempt. Make sure your answer is correct before submitting.
          </p>
          <span className="submission-count">
            Submissions: {submissionCount}/1
          </span>
        </div>
      </div>
    </div>
  );
};

// Add this validation function
const validateLearningAnswer = async (userAnswer, problemId) => {
  try {
    const problemData = require('../learning_problems_standardized.json');
    const problem = problemData[problemId];
    
    if (!problem) {
      throw new Error('Problem not found');
    }

    // Prepare the prompt for the LLM with problem description context
    const prompt = `Given this learning problem:

Problem Description:
${problem.description}

Compare these two answers and determine if they are semantically equivalent or convey the same meaning:
Answer 1: ${userAnswer}
Answer 2: ${problem.ground_truth}

Consider:
1. The specific context of the problem
2. Different ways of expressing the same concept
3. Minor variations in wording that preserve the core meaning
4. Whether both answers demonstrate the same level of understanding

Respond with ONLY "true" if they are semantically equivalent and demonstrate correct understanding, or "false" if they are not equivalent or demonstrate incorrect understanding.`;

    // Make API call to validate using LLM
    const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/generate', {
      messages: [{
        role: 'user',
        content: prompt
      }],
      model: 'gpt-4o' // or whatever model you want to use for validation
    });

    // Extract the response (should be just "true" or "false")
    const isCorrect = response.data.message.toLowerCase().includes('true');
    
    return {
      isCorrect,
      groundTruth: problem.ground_truth
    };
  } catch (error) {
    console.error('Error validating learning answer:', error);
    throw error;
  }
};

const ChatInterface = () => {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const { chats, updateChat, resetChat, fetchChatLogs, solvedProblems, selectedModel, user } = useChat();
  const [problem, setProblem] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const errorTimeoutRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isProblemSolved, setIsProblemSolved] = useState(false);
  const [problemSource, setProblemSource] = useState('');
  const descriptionRef = useRef(null);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editorContent, setEditorContent] = useState(() => {
    // Try to get saved content from localStorage first (fallback)
    const savedContent = localStorage.getItem(`editor-${problemId}`);
    return savedContent || '';
  });
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const editorRef = useRef(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userPhotoURL, setUserPhotoURL] = useState(user?.photoURL || null);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    return localStorage.getItem('selectedGroup');
  });
  const [notesContent, setNotesContent] = useState('');
  const [showWelcomePopup, setShowWelcomePopup] = useState(() => {
    // Check if this is the first time user is visiting
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    return !hasSeenWelcome;
  });
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const timerRef = useRef(null);
  const isFirstMount = useRef(true);
  const [isSolvingMode, setIsSolvingMode] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const lastSaveRef = useRef(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [showModelRankingPopup, setShowModelRankingPopup] = useState(false);
  const [recentModels, setRecentModels] = useState([]);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [hasReachedSubmissionLimit, setHasReachedSubmissionLimit] = useState(false);
  const [showMaxSubmissionsModal, setShowMaxSubmissionsModal] = useState(false);
  const [assignedModel, setAssignedModel] = useState(null);
  const [userElo, setUserElo] = useState(null);
  const [isProblemSubmitted, setIsProblemSubmitted] = useState(false);

  // Add this new state for math answer
  const [mathAnswer, setMathAnswer] = useState('');
  
  // Add this new state for grading
  const [isGrading, setIsGrading] = useState(false);
  
  // Add new state near other state declarations
  const [isResetting, setIsResetting] = useState(false);
  
  // Add this state to store the current model usage key
  const [currentModelUsageKey, setCurrentModelUsageKey] = useState(null);
  
  // Add new state for topic summary
  const [topicSummary, setTopicSummary] = useState('');
  
  // Update the handleMathAnswerSubmit function
  const handleMathAnswerSubmit = async () => {
    if (hasReachedSubmissionLimit && submissionCount >= 5) {
      if (!isProblemSolved) {
        setShowMaxSubmissionsModal(true);
      }
      return;
    }

    setIsGrading(true);
    try {
      // Increment submission count first
      const { count, hasReachedLimit } = await incrementSubmissionCount(user.uid, problemId, true);
      setSubmissionCount(count);
      setHasReachedSubmissionLimit(hasReachedLimit);
      
      if (hasReachedLimit) {
        setShowMaxSubmissionsModal(true);
      }

      // Add hidden message with submitted answer
      const submissionMessage = {
        id: 0,
        message: `User submitted answer: ${mathAnswer}`,
        isHidden: true
      };
      
      const messagesWithSubmission = [...messages, submissionMessage];
      setMessages(messagesWithSubmission);
      await updateChat(problemId, messagesWithSubmission);

      // Validate the answer
      const validation = await validateMathAnswer(mathAnswer, problemId);
      
      // Update ELO using the new calculation for math problems
      if (problem?.elo && userElo && (validation.isCorrect || hasReachedLimit)) {
        console.log('Calculating ELO change:', {
          currentElo: userElo,
          problemElo: problem.elo,
          isCorrect: validation.isCorrect
        });

        const newElo = calculateEloChange(userElo, problem.elo, validation.isCorrect, true);
        console.log('New ELO calculated:', newElo);

        try {
          await updateUserElo(user.uid, problemId, validation.isCorrect, newElo, true);
          console.log('ELO updated successfully');
          // Update local state
          setUserElo(newElo);
        } catch (error) {
          console.error('Failed to update ELO:', error);
        }
      } else {
        console.log('Skipping ELO update - missing required data:', {
          problemElo: problem?.elo,
          userElo: userElo,
          isCorrect: validation?.isCorrect,
          hasReachedLimit
        });
      }

      // Only show max submissions modal if the last submission failed AND we've reached the limit
      if (hasReachedLimit && !validation.isCorrect) {
        setShowMaxSubmissionsModal(true);
      }

      // Format the result message
      let resultMessage = `### Submission Result\n\n`;
      resultMessage += `**Attempt**: ${count}/5\n\n`;
      resultMessage += `**Your Answer**: ${mathAnswer}\n`;
      resultMessage += `**Status**: ${validation.isCorrect ? '✅ Correct' : '❌ Incorrect'}\n\n`;
      
      if (validation.isCorrect) {
        resultMessage += `\n### 🎉 Congratulations!\nYou've solved the problem correctly!\n\n**Don't forget to click "Submit Trajectory" at the top of the page to complete your submission.**\n`;
      } else {
        resultMessage += `Keep trying! Make sure your answer is in simplified form.\n`;
      }

      const executionMessage = {
        id: 2,
        message: resultMessage
      };
      
      const finalMessages = [...messagesWithSubmission, executionMessage];
      
      // If correct answer or reached limit, mark as solved
      if ((validation.isCorrect || hasReachedLimit) && !isProblemSolved) {
        setIsProblemSolved(true);
        // Only show confetti for actual correct answers, not just hitting submission limit
        if (validation.isCorrect) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
        }
        const updatedSolvedProblems = await markProblemAsSolved(problemId);
        
        // Continue with the original code
        updateChat(problemId, finalMessages, updatedSolvedProblems);
        setMessages(finalMessages);
      } else {
        setMessages(finalMessages);
        updateChat(problemId, finalMessages);
      }

    } catch (error) {
      console.error('Error submitting math answer:', error);
      const errorMessage = {
        id: 2,
        message: `### Submission Error\n\n${error.message}`
      };
      const newMessages = [...messages, errorMessage];
      setMessages(newMessages);
      updateChat(problemId, newMessages);
    } finally {
      setIsGrading(false);
    }
  };

  useEffect(() => {
    const loadProblem = async () => {
      if (problemId.startsWith('custom-')) {
        try {
          // Try to get from Firebase first
          const customWorkspaces = await getCustomWorkspaces(user?.uid);
          const workspaceData = customWorkspaces[problemId];
          
          if (workspaceData) {
            setProblem({
              id: problemId,
              title: "Custom Problem",
              description: workspaceData.description,
              source: 'custom',
              elo: workspaceData.elo
            });
            setProblemSource('custom');
          }
        } catch (error) {
          console.error('Error loading custom workspace:', error);
        }
      }
      
      // If it's a learning problem, generate the topic summary
      if (problem?.description && isLearningProblem()) {
        const summary = await generateTopicSummary(problem.description);
        setTopicSummary(summary);
      }
    };
    
    loadProblem();
  }, [problemId, user, problem]);

  useEffect(() => {
    if (problemId.startsWith('custom-')) {
      const customWorkspaces = JSON.parse(localStorage.getItem('customWorkspaces') || '{}');
      const customWorkspace = customWorkspaces[problemId];
      if (customWorkspace) {
        setProblem({
          id: problemId,
          title: customWorkspace.title,
          description: customWorkspace.description,
        });
      }
    }
  }, [problemId]);

  useEffect(() => {
    const loadChatLogs = async () => {
      if (!chats[problemId]) {
        const chatLogs = await fetchChatLogs(problemId);
        setMessages(chatLogs);
      } else {
        setMessages(chats[problemId]);
      }
    };
    loadChatLogs();
  }, [problemId, fetchChatLogs]);

  useEffect(() => {
    // Only set editor content on first mount or when problemId changes
    if (isFirstMount.current) {
      const fetchProblem = () => {
        // First check if this is a custom workspace
        if (problemId.startsWith('custom-')) {
          const customWorkspaces = JSON.parse(localStorage.getItem('customWorkspaces') || '{}');
          const customWorkspace = customWorkspaces[problemId];
          if (customWorkspace) {
            setProblem({
              id: problemId,
              title: customWorkspace.title,
              description: customWorkspace.description,
            });
            return; // Exit early, don't try to fetch from problem databases
          }
        }

        // Get source from URL params
        const source = new URLSearchParams(window.location.search).get('source');
        if (source && problemSources[source]) {
          try {
            const problemData = require(`../${problemSources[source].dataFile}`);
            const foundProblem = problemData[problemId];
            if (foundProblem) {
              console.log('Found problem with ELO:', {
                problemId,
                problemElo: foundProblem.elo
              });
              setProblem({
                id: problemId,
                title: source === 'leetcode' ? foundProblem.id : foundProblem.title,
                description: foundProblem.description,
                problem_link: foundProblem.problem_link,
                solution_link: foundProblem.solution_link,
                elo: foundProblem.elo,
                starter_code: foundProblem.starter_code
              });
              setProblemSource(source);
              
              // Only set editor content if there's no saved content
              const savedContent = localStorage.getItem(`editor-${problemId}`);
              if (!savedContent && foundProblem.starter_code) {
                setEditorContent(foundProblem.starter_code);
              }
              return; // Exit once we've found the problem
            }
          } catch (error) {
            console.error(`Error loading problem from ${source}:`, error);
          }
        }

        // Fallback: Try to find the problem in each source (for backward compatibility)
        for (const source of Object.values(problemSources)) {
          try {
            const problemData = require(`../${source.dataFile}`);
            const foundProblem = problemData[problemId];
            if (foundProblem) {
              console.log('Found problem with ELO:', {
                problemId,
                problemElo: foundProblem.elo
              });
              setProblem({
                id: problemId,
                title: source.id === 'LeetCode' ? foundProblem.id : foundProblem.title,
                description: foundProblem.description,
                problem_link: foundProblem.problem_link,
                solution_link: foundProblem.solution_link,
                elo: foundProblem.elo,
                starter_code: foundProblem.starter_code
              });
              setProblemSource(source.id.toLowerCase());
              
              // Only set editor content if there's no saved content
              const savedContent = localStorage.getItem(`editor-${problemId}`);
              if (!savedContent && foundProblem.starter_code) {
                setEditorContent(foundProblem.starter_code);
              }
              return; // Exit once we've found the problem
            }
          } catch (error) {
            console.error(`Error loading problem from ${source.id}:`, error);
          }
        }
      };
      
      fetchProblem();
      isFirstMount.current = false;
    }
  }, [problemId]);

  useEffect(() => {
    const notes = localStorage.getItem(`notes-${problemId}`);
    if (notes) {
      setNotesContent(notes);
    }
  }, [problemId]);

  const handleSend = async () => {
    console.log('handleSend called');
    if (input.trim()) {
      const userMessage = {
        id: 0,
        message: input
      };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      await updateChat(problemId, updatedMessages);
      setInput('');
      setIsLoading(true);  

      try {
        setIsGenerating(true);
        
        const currentNotes = localStorage.getItem(`notes-${problemId}`) || '';
        
        const workspaceContext = {
          currentCode: editorRef.current?.getValue() || editorContent,
          testCases: [],
          notes: currentNotes,
          problemDescription: problem.description,
          starterCode: problem?.starter_code || '',
        };

        const modelConfig = modelConfigs[selectedModel];
        // Add mode parameter based on problem type
        const mode = isLearningProblem() ? 'learning' : 'problem';
        const systemPromptWithContext = modelConfig.getSystemPrompt(workspaceContext, mode);
        
        const supportsSystemPrompts = !['o1', 'reasoner', 'o3', 'claude'].some(prefix => 
          modelConfigs[selectedModel].modelName.toLowerCase().includes(prefix)
        );
        
        const messagesWithSystemPrompt = [
          {
            role: supportsSystemPrompts ? 'system' : 'user',
            content: systemPromptWithContext
          },
          ...updatedMessages.map(msg => ({
            role: msg.id === 0 ? 'user' : 'assistant',
            content: msg.message
          }))
        ];

        console.log('Sending message to API:');
        console.log('Model:', modelConfigs[selectedModel].modelName);
        console.log('Messages:', messagesWithSystemPrompt);

        // Create a temporary message for response
        const tempMessage = {
          id: 1,
          message: ""
        };
        setMessages([...updatedMessages, tempMessage]);
        
        // Check if the model is OpenAI, Gemini, or Together (can use direct API calls)
        const isDirectApiModel = modelConfig.modelName.toLowerCase().includes('gpt') || 
                                 modelConfig.modelName.toLowerCase().includes('gemini') ||
                                 modelConfig.modelName.toLowerCase().includes('deepseek') ||
                                 modelConfig.modelName.toLowerCase().includes('llama') ||
                                 modelConfig.modelName.toLowerCase().includes('o1');
        const useStreaming = !modelConfig.disableStreaming;
        
        if (isDirectApiModel) {
          // Use direct API calls for supported models
          if (useStreaming) {
            // Set up a reference to track the last time we saved to Firebase
            lastSaveRef.current = Date.now();
            
            await generateOpenAIStreamingResponse(
              messagesWithSystemPrompt,
              modelConfig.modelName,
              (chunkText) => {
                setMessages(currentMessages => {
                  const lastMessage = currentMessages[currentMessages.length - 1];
                  if (lastMessage.id === 1) {
                    // Update the streaming message
                    const updatedMessage = {
                      ...lastMessage,
                      message: lastMessage.message + chunkText,
                      isStreaming: true 
                    };
                    
                    // Create a new array with the updated message
                    const newMessages = [...currentMessages.slice(0, -1), updatedMessage];
                    
                    // Update the chat in Firebase (debounced to avoid too many writes)
                    if (Date.now() - lastSaveRef.current > 2000) {
                      updateChat(problemId, newMessages);
                      lastSaveRef.current = Date.now();
                    }
                    
                    return newMessages;
                  }
                  return currentMessages;
                });
              }
            );
            
            // Save the final state of the message
            setMessages(currentMessages => {
              const finalMessages = currentMessages.map(msg => 
                msg.id === 1 ? { ...msg, isStreaming: false } : msg
              );
              updateChat(problemId, finalMessages);
              return finalMessages;
            });
          } else {
            // Use non-streaming API
            const aiMessage = await generateOpenAIResponse(
              messagesWithSystemPrompt,
              modelConfig.modelName
            );
            
            setMessages(currentMessages => {
              // Find the temporary message and replace it with the actual response
              const lastMessage = currentMessages[currentMessages.length - 1];
              if (lastMessage.id === 1) {
                const finalMessage = {
                  id: 1,
                  message: aiMessage,
                  isStreaming: false
                };
                
                const newMessages = [...currentMessages.slice(0, -1), finalMessage];
                updateChat(problemId, newMessages);
                return newMessages;
              }
              return currentMessages;
            });
          }
        } else {
          // Use backend for other models (keep existing code)
          if (useStreaming) {
            // Existing streaming code for non-OpenAI models
            const response = await fetch('https://code-ht-backend-ac832c92f505.herokuapp.com/generate-streaming', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messages: messagesWithSystemPrompt,
                model: modelConfigs[selectedModel].modelName,
              }),
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Set up a reference to track the last time we saved to Firebase
            lastSaveRef.current = Date.now();
            
            // Create a new EventSource-like reader for SSE
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            
            // Process streaming response
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                break;
              }
              
              // Decode the chunk and add it to the buffer
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete SSE events in the buffer
              let eventEnd = buffer.indexOf("\n\n");
              while (eventEnd > -1) {
                const eventData = buffer.substring(0, eventEnd);
                buffer = buffer.substring(eventEnd + 2); // +2 for the \n\n
                
                // Parse the SSE format: "data: content"
                const dataMatch = eventData.match(/^data: (.+)$/);
                if (dataMatch) {
                  const chunkText = dataMatch[1];
                  
                  // Update the messages state with the chunk
                  setMessages(currentMessages => {
                    const lastMessage = currentMessages[currentMessages.length - 1];
                    if (lastMessage.id === 1) {
                      // Update the streaming message
                      const updatedMessage = {
                        ...lastMessage,
                        message: lastMessage.message + chunkText,
                        isStreaming: true
                      };
                      
                      // Create a new array with the updated message
                      const newMessages = [...currentMessages.slice(0, -1), updatedMessage];
                      
                      // Update the chat in Firebase (debounced to avoid too many writes)
                      if (Date.now() - lastSaveRef.current > 2000) {
                        updateChat(problemId, newMessages);
                        lastSaveRef.current = Date.now();
                      }
                      
                      return newMessages;
                    }
                    return currentMessages;
                  });
                }
                
                eventEnd = buffer.indexOf("\n\n");
              }
            }
            
            // Save the final state of the message
            setMessages(currentMessages => {
              const finalMessages = currentMessages.map(msg => 
                msg.id === 1 ? { ...msg, isStreaming: false } : msg
              );
              updateChat(problemId, finalMessages);
              return finalMessages;
            });
          } else {
            // Existing non-streaming code for non-OpenAI models
            const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/generate', {
              messages: messagesWithSystemPrompt,
              model: modelConfigs[selectedModel].modelName,
            });
            
            // Get the AI response from the response data
            const aiMessage = response.data.message;
            
            // Update the messages state with the AI response
            setMessages(currentMessages => {
              // Find the temporary message and replace it with the actual response
              const lastMessage = currentMessages[currentMessages.length - 1];
              if (lastMessage.id === 1) {
                const finalMessage = {
                  id: 1,
                  message: aiMessage,
                  isStreaming: false
                };
                
                const newMessages = [...currentMessages.slice(0, -1), finalMessage];
                updateChat(problemId, newMessages);
                return newMessages;
              }
              return currentMessages;
            });
          }
        }
      } catch (error) {
        console.error('Error sending message to AI:', error);
        let errorMessage = 'An unexpected error occurred. Please try again.';

        if (error.message.includes('timed out')) {
          errorMessage = error.message;
        } else if (error.response) {
          if (error.response.status === 401) {
            errorMessage = 'Invalid API key. Please check your OpenAI API key and try again.';
          } else if (error.response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
          } else if (error.response.data && error.response.data.error) {
            errorMessage = `Error: ${error.response.data.error}`;
          }
        } else if (error.request) {
          errorMessage = 'No response from server. Please check your internet connection and try again.';
        }

        setError(errorMessage);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = setTimeout(() => setError(''), 5000);
      } finally {
        setIsGenerating(false);
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    if (selectedGroup) {
      navigate(`/group/${selectedGroup}`);  // Navigate to the group-specific route
    } else {
      navigate(-1);
    }
  };

  const handleResetChat = async () => {
    if (window.confirm('Are you sure you want to reset this chat? All messages will be deleted.')) {
      setIsResetting(true);
      try {
        // Save the current chat before resetting
        if (messages.length > 0) {
          try {
            await uploadChatToGoogleDriveWithoutModelUsage(
              user?.uid,
              problemId,
              selectedModel,
              messages,
              timer,
              true
            );
          } catch (error) {
            console.error('Error uploading reset chat:', error);
          }
        }
        
        setMessages([]);
        setIsSolvingMode(false);
        if (user?.uid) {
          await saveSolvingModeState(user.uid, problemId, false);
        }
        await resetChat(problemId);
      } catch (error) {
        console.error('Error resetting chat:', error);
        setError('Failed to reset chat');
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = setTimeout(() => setError(''), 5000);
      } finally {
        setIsResetting(false);
      }
    }
  };

  // Update the renderProblemDescription function
  const renderProblemDescription = () => {
    if (!problem?.description) return '';
    
    // Only hide description for learning problems
    if (!isSolvingMode && isLearningProblem()) {
      return (
        <div className="hidden-problem-message">
          <h3>Problem Description Hidden</h3>
          <p>Topic: {topicSummary}</p>
          <p>Click "Ready to Solve" to reveal the problem description.</p>
          <p>Take time to learn the concepts from the AI assistant first!</p>
        </div>
      );
    }
    
    return (
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {problem.description}
      </ReactMarkdown>
    );
  };

  // Add new function to handle code execution
  const executeCode = async (codeSnippet) => {
    if (hasReachedSubmissionLimit && submissionCount >= 10) {
      // Only show modal if we haven't solved the problem yet
      if (!isProblemSolved) {
        setShowMaxSubmissionsModal(true);
      }
      return;
    }

    setIsExecuting(true);
    try {
      // Log problem and ELO data
      console.log('Problem data:', {
        problemId,
        problemElo: problem?.elo,
        problemSource,
        problem: problem
      });
      
      console.log('User ELO data:', {
        userId: user?.uid,
        userElo: userElo,
        rawUserElo: user?.elo
      });

      // Add hidden message with submitted code
      const submissionMessage = {
        id: 0,  // user message
        message: `User submitted code:\n\`\`\`python\n${codeSnippet}\`\`\``,
        isHidden: true
      };
      
      // Create new messages array with hidden submission
      const messagesWithSubmission = [...messages, submissionMessage];
      setMessages(messagesWithSubmission);
      await updateChat(problemId, messagesWithSubmission);

      // Execute code and get response
      const executionResponse = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/execute', {
        model_output: codeSnippet,
        problem_id: problemId,
        platform: problemSource.toLowerCase().includes('leetcode') ? 'leetcode' : problemSource,
        leetcode_cookie: localStorage.getItem('leetcodeCookie'),
        leetcode_csrf_token: localStorage.getItem('leetcodeCsrfToken')
      });
      
      console.log("executionResponse", executionResponse);
      
      // Check if judge_output exists
      if (!executionResponse.data.judge_output) {
        const authErrorMessage = {
          id: 2,
          message: `### LeetCode Authentication Error\n\nUnable to execute code. This might be because:\n\n1. Your LeetCode session has expired\n2. You're logged out of LeetCode.com\n3. Your session keys need to be updated\n4. Please remove any comments in the code, and check if your function definition is the same as the one given in the problem (do not change the function definition)\n\nYou can either:\n1. Log into LeetCode.com and update your session keys\n2. Click "Void Problem" to remove this problem from your task list\n\n**Note:** Voiding a problem will not count towards your completion or payout, but will allow you to get new problems.\n\n<void-problem-button>`
        };
        const newMessages = [...messagesWithSubmission, authErrorMessage];
        setMessages(newMessages);
        updateChat(problemId, newMessages);
        return;
      }
      
      // Only increment submission count if we have a valid judge output
      // This prevents counting authentication errors as submissions
      const { count, hasReachedLimit } = await incrementSubmissionCount(user.uid, problemId, false);
      setSubmissionCount(count);
      setHasReachedSubmissionLimit(hasReachedLimit);
      
      if (hasReachedLimit) {
        setShowMaxSubmissionsModal(true);
      }
      
      const output = executionResponse.data.judge_output;
      
      // Update ELO using the new calculation for coding problems
      // Only update ELO if we're either successful or have hit the submission limit
      if (problem?.elo && userElo && (output.status_msg === 'Accepted' || hasReachedLimit)) {
        const isCorrect = output.status_msg === 'Accepted';
        console.log('Calculating ELO change:', {
          currentElo: userElo,
          problemElo: problem.elo,
          isCorrect,
          status: output.status_msg
        });

        const newElo = calculateEloChange(userElo, problem.elo, isCorrect, false);
        console.log('New ELO calculated:', newElo);

        try {
          await updateUserElo(user.uid, problemId, isCorrect, newElo);
          console.log('ELO updated successfully');
          // Update local state
          setUserElo(newElo);
        } catch (error) {
          console.error('Failed to update ELO:', error);
        }
      } else {
        console.log('Skipping ELO update - problem not completed yet');
      }
      
      // Only show max submissions modal if the last submission failed AND we've reached the limit
      if (hasReachedLimit && output.status_msg !== 'Accepted') {
        setShowMaxSubmissionsModal(true);
      }
      
      // Format the execution results message
      let resultMessage = `### Execution Results\n\n`;
      
      // Add status and overall result
      resultMessage += `**Status**: ${output.status_msg}\n`;
      
      // Add congratulations message if the answer is correct
      if (output.status_msg === 'Accepted') {
        resultMessage += `\n### 🎉 Congratulations!\nYou've solved the problem correctly!\n\n**Don't forget to click "Submit Trajectory" at the top of the page to complete your submission.**\n\n`;
      }
      
      // Add runtime error details if present
      if (output.runtime_error || output.full_runtime_error) {
        resultMessage += `\n### Runtime Error\n`;
        if (output.runtime_error) {
          resultMessage += `${output.runtime_error}\n\n`;
        }
        if (output.full_runtime_error) {
          resultMessage += `**Full Error Trace**:\n\`\`\`\n${output.full_runtime_error}\`\`\`\n\n`;
        }
      }
      
      // Handle Time Limit Exceeded case
      if (output.state === 'STARTED') {
        resultMessage += `\n${output.output || 'Your code exceeded the time limit.'}\n\n`;
      } else {
        resultMessage += `**Test Cases**: ${output.total_correct}/${output.total_testcases} passed\n\n`;
        
        // Add performance metrics if available and not "N/A"
        if (output.status_runtime && output.status_runtime !== 'N/A') {
          resultMessage += `**Runtime**: ${output.display_runtime} ms\n`;
          if (output.runtime_percentile) {
            resultMessage += `**Runtime Percentile**: ${output.runtime_percentile}\n`;
          }
        }
        
        if (output.status_memory && output.status_memory !== 'N/A') {
          resultMessage += `**Memory Usage**: ${(output.memory / 1024 / 1024).toFixed(2)} MB\n`;
          if (output.memory_percentile) {
            resultMessage += `**Memory Percentile**: ${output.memory_percentile}\n`;
          }
        }
      }
      
      // Add last test case details if there was a failure
      if (output.status_msg !== 'Accepted') {
        resultMessage += `\n### Last Test Case\n`;
        resultMessage += `**Input**: \`${output.last_testcase}\`\n`;
        if (output.expected_output) {
          resultMessage += `**Expected**: \`${output.expected_output}\`\n`;
        }
        if (output.code_output && output.code_output !== 'null') {
          resultMessage += `**Your Output**: \`${output.code_output}\`\n`;
        }
        if (output.std_output && output.std_output !== 'null') {
          resultMessage += `\n**Standard Output**:\n\`\`\`\n${output.std_output}\`\`\`\n`;
        }
      }

      // Format the execution results message
      const executionMessage = {
        id: 2,
        message: resultMessage
      };
      
      // Important: Include both the hidden submission AND the execution result
      const finalMessages = [...messagesWithSubmission, executionMessage];
      
      if ((output.status_msg === 'Accepted' || hasReachedLimit) && !isProblemSolved) {
        setIsProblemSolved(true);
        // Only show confetti for actual correct answers, not just hitting submission limit
        if (output.status_msg === 'Accepted') {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
        }
        const updatedSolvedProblems = await markProblemAsSolved(problemId);
        
        // Use the saveModelUsage function instead of direct database access
        try {
          await saveModelUsage(
            user.uid, 
            problemId, 
            selectedModel, 
            timer, 
            'Math-V2'  // Explicitly set source for math problems
          );
        } catch (error) {
          console.error('Error saving model usage data:', error);
        }
        
        // Continue with the original code
        updateChat(problemId, finalMessages, updatedSolvedProblems);
        setMessages(finalMessages);
      } else {
        setMessages(finalMessages);
        updateChat(problemId, finalMessages);
      }
    } catch (error) {
      console.error('Error executing code:', error);
      const errorMessage = {
        id: 2,
        message: `### Execution Error\n\n${error.response?.data?.error || error.message}`
      };
      const newMessages = [...messages, errorMessage];
      setMessages(newMessages);
      updateChat(problemId, newMessages);
    } finally {
      setIsExecuting(false);
    }
  };

  // Update the renderContent function
  const renderContent = React.useCallback((content, onCodeEdit, isStreaming) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    // Process the content to handle LaTeX notation correctly
    let processedContent = content;
    
    // For streaming content, we need to ensure backslashes in LaTeX are handled properly
    if (isStreaming) {
      // Match both inline LaTeX (\(...\)) and block LaTeX (\[...\])
      // This regex needs to be improved - we need to match even when there are escaped backslashes
      const latexRegex = /\\(\(|\[)([\s\S]*?)\\(\)|\])/g;
      
      // Use a more robust approach to process LaTeX expressions
      // This approach processes the entire content and ensures LaTeX is properly escaped
      processedContent = processedContent.replace(latexRegex, (match, openDelim, content, closeDelim) => {
        // We don't need to escape backslashes in LaTeX content during streaming
        // Just return the original match to ensure proper rendering
        return match;
      });
    }
    
    // Handle code blocks as before
    let codeMatches = [...processedContent.matchAll(codeBlockRegex)];
    
    if (codeMatches.length > 0) {
      // We need to work backwards to avoid changing indices
      for (let i = codeMatches.length - 1; i >= 0; i--) {
        const match = codeMatches[i];
        const codeBlock = match[2];
        // Replace all backslashes with double backslashes in code blocks
        const escapedCode = codeBlock.replace(/\\/g, '\\\\');
        processedContent = 
          processedContent.substring(0, match.index + 4 + (match[1]?.length || 0) + 1) + 
          escapedCode + 
          processedContent.substring(match.index + match[0].length - 3);
      }
    }
    
    // Reset for parsing
    lastIndex = 0;
    // Use the processed content for the rest of the function
    while ((match = codeBlockRegex.exec(processedContent)) !== null) {
      // If there's text before the code block, render it as a TextBlock
      if (match.index > lastIndex) {
        const textContent = processedContent.slice(lastIndex, match.index).trim();
        if (textContent) {
          // If the message is streaming, we'll render a simpler version
          if (isStreaming) {
            parts.push(
              <ReactMarkdown
                key={`text-${match.index}`}
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {textContent}
              </ReactMarkdown>
            );
          } else {
            parts.push(
              <TextBlock
                key={`text-${match.index}`}
                content={textContent}
              />
            );
          }
        }
      }

      // Render code block
      const language = match[1] || 'text';
      const code = match[2].trim();
      
      // For streaming messages, render a simpler code block without edit functionality
      if (isStreaming) {
        parts.push(
          <SyntaxHighlighter
            key={`code-${match.index}`}
            language={language}
            wrapLines={true}
            wrapLongLines={true}
          >
            {code}
          </SyntaxHighlighter>
        );
      } else {
        parts.push(
          <CodeBlock
            key={`code-${match.index}`}
            code={code}
            language={language}
            onCodeEdit={onCodeEdit}
          />
        );
      }
      lastIndex = match.index + match[0].length;
    }

    // Render any remaining text as a TextBlock
    if (lastIndex < processedContent.length) {
      const textContent = processedContent.slice(lastIndex).trim();
      if (textContent) {
        // If streaming, use simple ReactMarkdown
        if (isStreaming) {
          parts.push(
            <ReactMarkdown
              key={`text-${lastIndex}`}
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {textContent}
            </ReactMarkdown>
          );
        } else {
          parts.push(
            <TextBlock
              key={`text-${lastIndex}`}
              content={textContent}
            />
          );
        }
      }
    }

    return parts;
  }, [selectedModel, messages]);

  const renderMessage = React.useCallback((message, index) => {
    if (message.isHidden) {
      return null;
    }

    const isUser = message.id === 0;
    const isExecutionOutput = message.id === 2;
    const isCongrats = message.id === 3;
    const isStreaming = message.isStreaming;
    
    // Remove the check for math/learning problems to blur ALL messages in solving mode
    const shouldBlurMessage = isSolvingMode && 
      !isExecutionOutput;
    
    if (isCongrats) {
      return <div key={index} className="congrats-message">{message.message}</div>;
    }

    // Don't remove the placeholder here anymore
    // const messageContent = message.message.replace('<void-problem-button>', '');
    const messageContent = message.message;

    const handleCodeEdit = (newCode) => {
      const editMessage = {
        id: 0,
        message: `User changed the code to:\n\`\`\`${newCode}\`\`\``,
        isHidden: true
      };
      
      setMessages(prevMessages => {
        const newMessages = [...prevMessages, editMessage];
        updateChat(problemId, newMessages);
        return newMessages;
      });
    };

    // For streaming messages containing math, use a different approach
    if (isStreaming && /\\[\(\[].*?\\[\)\]]/s.test(messageContent)) {
      return (
        <div 
          key={index} 
          className={`message-bubble ${isUser ? 'user-message' : isExecutionOutput ? 'execution-message' : 'ai-message'} 
            streaming-message ${shouldBlurMessage ? 'blurred' : ''}`}
        >
          <div className="message-content">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {messageContent}
            </ReactMarkdown>
            {messageContent.includes('<void-problem-button>') && (
              <button className="void-problem-button" onClick={handleVoidProblem}>
                Void Problem
              </button>
            )}
          </div>
        </div>
      );
    }

    // For non-streaming or messages without math, use the original approach
    return (
      <div 
        key={index} 
        className={`message-bubble ${isUser ? 'user-message' : isExecutionOutput ? 'execution-message' : 'ai-message'} 
          ${isStreaming ? 'streaming-message' : ''} ${shouldBlurMessage ? 'blurred' : ''}`}
      >
        <div className="message-content">
          {renderContent(messageContent, handleCodeEdit, isStreaming)}
          {messageContent.includes('<void-problem-button>') && (
            <button 
              className="void-problem-button"
              onClick={handleVoidProblem}
            >
              Void Problem
            </button>
          )}
        </div>
      </div>
    );
  }, [renderContent, problemId, updateChat, user, navigate, isSolvingMode]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    adjustTextareaHeight(e.target);
  };

  const adjustTextareaHeight = (element) => {
    element.style.height = 'auto';
    element.style.height = (element.scrollHeight) + 'px';
  };

  useEffect(() => {
    const textarea = document.querySelector('.chat-input');
    if (textarea) {
      adjustTextareaHeight(textarea);
    }
  }, []);

  const handleModelRankingComplete = async (ranking, selfEfficacy, likertResponses, feedback) => {
    if (ranking) {  // Only proceed if not cancelled
      try {
        // Create ranking data object that includes all survey responses
        const rankingData = {
          ranking,
          selfEfficacy,
          likertResponses,
          feedback
        };

        // Now upload to Google Drive
        await uploadChatToGoogleDriveWithoutModelUsage(
          user.uid,
          problemId,
          selectedModel,
          messages,
          timer,
          false,
          selfEfficacy,
          rankingData
        );
        
        setShowModelRankingPopup(false);
        // Set isProblemSubmitted to true to prevent further submissions
        setIsProblemSubmitted(true);
        // Show success popup after upload is complete
        setShowSuccessPopup(true);
        setTimeout(() => setShowSuccessPopup(false), 3000);
      } catch (error) {
        console.error('Error uploading chat with ranking:', error);
        setError('Failed to save feedback');
        setTimeout(() => setError(''), 5000);
      }
    } else {
      // If cancelled, remove the model usage entry we created
      if (currentModelUsageKey) {
        await removeModelUsage(user.uid, currentModelUsageKey);
      }
      setShowModelRankingPopup(false);
    }
  };

  const handleUploadToStorage = async () => {
    if (!user || messages.length === 0) {
      setError('You must be logged in and have messages to upload chat logs');
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(''), 5000);
      return;
    }
    
    setIsUploading(true);
    try {
      // Add logging for trajectory count
      const trajectoryCount = await incrementTrajectoryCount(user.uid);
      console.log('Incremented trajectory count:', trajectoryCount);
      
      // Save model usage data first with a unique identifier we can reference later
      const modelUsageKey = await saveModelUsage(
        user.uid, 
        problemId, 
        selectedModel, 
        timer, 
        problemSource || (isMathProblem() ? 'Math-V2' : 'LeetCode')
      );
      
      // Store the model usage key in state so we can reference it after ranking
      setCurrentModelUsageKey(modelUsageKey);
      
      // Fetch recent models (should include the one we just added)
      const recentModelData = await getRecentModelUsage(user.uid);
      setRecentModels(recentModelData);
      
      // Show model ranking popup
      setShowModelRankingPopup(true);
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(`Failed to upload chat log: ${error.message}`);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(''), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditorChange = (value) => {
    // Store the current cursor position and selection
    const editor = editorRef.current;
    const position = editor.getPosition();
    const selection = editor.getSelection();

    setEditorContent(value);

    // After the state update, restore the cursor position and selection
    if (editor) {
      setTimeout(() => {
        editor.setPosition(position);
        editor.setSelection(selection);
        editor.layout();
      }, 0);
    }
  };

  const formatLeetCodeTitle = (title) => {
    // Remove dashes and split into words
    const words = title.split('-');
    // Capitalize first letter of each word and join with spaces
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Add this new helper function
  const formatProblemTitle = (title, source) => {
    if (source === 'leetcode') {
      return formatLeetCodeTitle(title);
    }
    // For math problems, just show "Math Problem"
    if (source?.toLowerCase().includes('math')) {
      return "Math Problem";
    }
    // For learning problems, show "Learning Problem"
    if (source?.toLowerCase() === 'learning') {
      return "Learning Problem";
    }
    // Default case, just return the title
    return title;
  };

  const handlePanelResize = () => {
    if (editorRef.current) {
      setTimeout(() => {
        editorRef.current.layout();
      }, 0);
    }
  };

  // Add this useEffect to handle initial layout and content changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.layout();
    }
  }, [editorContent]); // This will trigger when content changes

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileMenu && !event.target.closest('.user-profile')) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  useEffect(() => {
    const storedGroup = localStorage.getItem('selectedGroup');
    if (storedGroup) {
      setSelectedGroup(storedGroup);
    }
  }, []);

  const handleWelcomeClose = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcomePopup(false);
  };

  // Update the loadEditorContent useEffect
  useEffect(() => {
    const loadEditorContent = async () => {
      if (user?.uid) {
        try {
          const savedContent = await getEditorContent(user.uid, problemId);
          if (savedContent) {
            setEditorContent(savedContent);
          } else {
            // If no content in Firebase, check if problem has starter code
            if (problemSource && problem?.starter_code) {
              setEditorContent(problem.starter_code);
            }
          }
        } catch (error) {
          console.error('Error loading editor content:', error);
        }
      }
    };
    
    loadEditorContent();
  }, [problemId, user, problemSource, problem]);

  // Save editor content to both Firebase and localStorage
  useEffect(() => {
    // Save to localStorage as fallback
    localStorage.setItem(`editor-${problemId}`, editorContent);
    
    // Save to Firebase if user is logged in
    if (user?.uid) {
      const saveContent = async () => {
        try {
          await saveEditorContent(user.uid, problemId, editorContent);
        } catch (error) {
          console.error('Error saving editor content:', error);
        }
      };
      
      // Debounce the save operation to avoid too many writes
      const timeoutId = setTimeout(saveContent, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [editorContent, problemId, user]);

  // Load timer from localStorage
  useEffect(() => {
    if (!problemId) return;
    const savedTimer = parseInt(localStorage.getItem(LOCAL_STORAGE_KEY(problemId))) || 0;
    setTimer(savedTimer);
  }, [problemId]);

  // Save timer state periodically and on unmount
  useEffect(() => {
    const saveTimerState = () => {
      if (!problemId) return;
      localStorage.setItem(LOCAL_STORAGE_KEY(problemId), timer.toString());
    };

    // Save on regular intervals
    const saveInterval = setInterval(saveTimerState, SAVE_INTERVAL);

    // Save when component unmounts
    return () => {
      clearInterval(saveInterval);
      saveTimerState();
    };
  }, [timer, problemId]);

  // Timer increment logic
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const handleToggleSolvingMode = async () => {
    if (!isSolvingMode) {
      if (window.confirm('Are you sure you want to enter solving mode? You won\'t be able to chat with the AI assistant until you reset.')) {
        setIsSolvingMode(true);
        if (user?.uid) {
          await saveSolvingModeState(user.uid, problemId, true);
        }
      }
    }
  };

  // Add this new useEffect to load solving mode state
  useEffect(() => {
    const loadSolvingMode = async () => {
      if (user?.uid) {
        try {
          const savedSolvingMode = await getSolvingModeState(user.uid, problemId);
          setIsSolvingMode(savedSolvingMode);
        } catch (error) {
          console.error('Error loading solving mode state:', error);
        }
      }
    };
    
    loadSolvingMode();
  }, [user, problemId]);

  // Add this useEffect to handle window resizing
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add this function to get the editor options
  const getEditorOptions = () => ({
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    automaticLayout: false,
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    readOnly: !isSolvingMode, // Make editor read-only when not in solving mode
  });

  // Add this useEffect to load submission count on component mount
  useEffect(() => {
    const loadSubmissionCount = async () => {
      if (user?.uid && problemId) {
        try {
          const { count, hasReachedLimit } = await getSubmissionCount(user.uid, problemId, isMathProblem());
          setSubmissionCount(count);
          setHasReachedSubmissionLimit(hasReachedLimit);
        } catch (error) {
          console.error('Error loading submission count:', error);
        }
      }
    };
    
    loadSubmissionCount();
  }, [user, problemId]);

  // Add this helper function to determine if it's a math problem
  const isMathProblem = () => {
    return problemSource?.toLowerCase() === 'math' || problemSource?.toLowerCase() === 'math-v2';
  };

  // Add this useEffect to fetch and display the assigned model
  useEffect(() => {
    const fetchAssignedModel = async () => {
      if (user?.uid && problemId) {
        try {
          const modelId = await getModelForProblem(user.uid, problemId);
          setAssignedModel(modelId);
        } catch (error) {
          console.error('Error fetching assigned model:', error);
        }
      }
    };

    fetchAssignedModel();
  }, [user, problemId]);

  // Add new function to handle voiding problems
  const handleVoidProblem = async () => {
    if (window.confirm('Are you sure you want to void this problem? This cannot be undone.')) {
      try {
        await addVoidedProblem(user.uid, problemId);
        alert('Problem has been voided. You can now go back and get new problems.');
        navigate(-1);
      } catch (error) {
        console.error('Error voiding problem:', error);
        setError('Failed to void problem');
      }
    }
  };

  // Add this useEffect to load user's ELO when component mounts
  useEffect(() => {
    const loadUserElo = async () => {
      if (user?.uid) {
        try {
          const elo = await getUserElo(user.uid);
          console.log('Loaded user ELO:', elo);
          setUserElo(elo);
        } catch (error) {
          console.error('Error loading user ELO:', error);
        }
      }
    };
    
    loadUserElo();
  }, [user]);

  // Add this new useEffect to check if problem has been submitted
  useEffect(() => {
    const checkSubmissionStatus = async () => {
      if (user?.uid && problemId) {
        try {
          const submittedProblems = await getSubmittedProblems(user.uid);
          setIsProblemSubmitted(submittedProblems.includes(problemId));
        } catch (error) {
          console.error('Error checking submission status:', error);
        }
      }
    };
    
    checkSubmissionStatus();
  }, [user, problemId]);

  // Add this new useEffect near your other useEffects
  useEffect(() => {
    const checkIfProblemSolved = async () => {
      if (user?.uid && problemId) {
        try {
          const solvedProblems = await getSolvedProblems();
          setIsProblemSolved(solvedProblems.includes(problemId));
        } catch (error) {
          console.error('Error checking if problem is solved:', error);
        }
      }
    };
    
    checkIfProblemSolved();
  }, [user, problemId]);

  // Add this helper function
  const isLearningProblem = () => {
    return problemSource?.toLowerCase() === 'learning';
  };

  // Add the handleLearningAnswerSubmit function
  const handleLearningAnswerSubmit = async () => {
    if (submissionCount >= 1) {
      setShowMaxSubmissionsModal(true);
      return;
    }

    setIsGrading(true);
    try {
      // Increment submission count first
      const { count, hasReachedLimit } = await incrementSubmissionCount(user.uid, problemId, true);
      setSubmissionCount(count);
      setHasReachedSubmissionLimit(true); // Always set to true after first submission
      
      const validation = await validateLearningAnswer(mathAnswer, problemId);
      
      // Only show max submissions modal if the answer was incorrect
      if (!validation.isCorrect) {
        setShowMaxSubmissionsModal(true);
      }

      // Format the result message
      let resultMessage = `### Submission Result\n\n`;
      resultMessage += `**Your Answer**: ${mathAnswer}\n`;
      resultMessage += `**Status**: ${validation.isCorrect ? '✅ Correct' : '❌ Incorrect'}\n\n`;
      
      if (validation.isCorrect) {
        resultMessage += `\n### 🎉 Congratulations!\nYou've solved the problem correctly!\n\n**Don't forget to click "Submit Trajectory" at the top of the page to complete your submission.**\n`;
      } else {
        resultMessage += `Unfortunately, that's not correct. You've used your one submission attempt.\n`;
      }

      const executionMessage = {
        id: 2,
        message: resultMessage
      };
      
      const newMessages = [...messages, executionMessage];
      
      // Mark as solved regardless of correctness since they've used their attempt
      if (!isProblemSolved) {
        setIsProblemSolved(true);
        if (validation.isCorrect) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
        }
        const updatedSolvedProblems = await markProblemAsSolved(problemId);
        updateChat(problemId, newMessages, updatedSolvedProblems);
      } else {
        setMessages(newMessages);
        updateChat(problemId, newMessages);
      }
    } catch (error) {
      console.error('Error submitting learning answer:', error);
      setError('Failed to submit answer');
    } finally {
      setIsGrading(false);
    }
  };

  // Add new function to generate topic summary
  const generateTopicSummary = async (description) => {
    try {
      const prompt = `Given this learning problem description, provide a very brief (<10 words) summary of the main topic being taught. Don't include any specific details about the question or answer.

Description:
${description}

Respond with ONLY the brief topic summary, nothing else. Do not give away the answer in this topic, make it rather general.`;

      const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/generate', {
        messages: [{
          role: 'user',
          content: prompt
        }],
        model: 'gpt-4o-mini',
      });

      return response.data.message.trim();
    } catch (error) {
      console.error('Error generating topic summary:', error);
      return 'Learning Problem';
    }
  };

  if (!problem) {
    return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p>Loading...</p>
    </div>
    );
  }
  
  return (
    <div className="chat-container">
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
        />
      )}
      <div className="top-controls">
        <div className="left-controls">
          <button className="control-button" onClick={handleBack}>Back</button>
          <div className="submit-button-container">
            <button 
              className="control-button"
              onClick={handleUploadToStorage}
              disabled={messages.length === 0 || isUploading || (!isProblemSolved && !hasReachedSubmissionLimit) || isProblemSubmitted}
            >
              {isUploading ? 'Uploading...' : isProblemSubmitted ? 'Already Submitted' : 'Submit Trajectory'}
            </button>
            {(!isProblemSolved && !hasReachedSubmissionLimit) && !isProblemSubmitted && (
              <span className="submit-requirement-message">
                Solve the problem or reach max submissions to enable
              </span>
            )}
            {isProblemSubmitted && (
              <span className="submit-requirement-message">
                This problem has already been submitted
              </span>
            )}
          </div>
          <button 
            className="control-button control-button--reset"
            onClick={handleResetChat}
            disabled={true}  // Change this to always disable the button
          >
            Reset Chat History
          </button>
          <button 
            className={`control-button ${isSolvingMode ? 'control-button--solving' : ''}`}
            onClick={handleToggleSolvingMode}
            disabled={isSolvingMode}
          >
            {isSolvingMode ? 'In Solving Mode' : 'Ready to Solve'}
          </button>
        </div>
        
        <div className="right-controls">
          <div className="timer">
            {formatTime(timer)}
          </div>
          {user && (
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
                  <div className="profile-email">{user.email}</div>
                  <div className="profile-menu-item" onClick={handleLogout}>
                    Logout
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="problem-chat-layout">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={35} minSize={20} style={{ overflow: 'auto' }}>
            <div className="problem-section">
              <h2 className="problem-title">
                {formatProblemTitle(problem.title, problemSource)}
                {isProblemSolved && <span className="solved-checkmark">✅</span>}
              </h2>
              <div className="problem-description">
                {renderProblemDescription()}
              </div>
            </div>
          </Panel>
          
          <PanelResizeHandle className="panel-resize-handle" />
          
          <Panel defaultSize={65}>
            <PanelGroup direction="vertical" onResize={handlePanelResize}>
              <Panel defaultSize={30} minSize={20}>
                <div className="editor-section">
                  {isLearningProblem() ? (
                    <LearningAnswerSubmission 
                      answer={mathAnswer} // We can reuse the mathAnswer state for learning problems
                      setAnswer={setMathAnswer}
                      onSubmit={handleLearningAnswerSubmit}
                      submissionCount={submissionCount}
                      isSubmitting={isGrading}
                      isSolvingMode={isSolvingMode}
                      isProblemSolved={isProblemSolved}
                    />
                  ) : isMathProblem() ? (
                    <MathAnswerSubmission 
                      answer={mathAnswer}
                      setAnswer={setMathAnswer}
                      onSubmit={handleMathAnswerSubmit}
                      submissionCount={submissionCount}
                      isSubmitting={isGrading}
                      isSolvingMode={isSolvingMode}
                      isProblemSolved={isProblemSolved}
                    />
                  ) : (
                    <>
                      <div className="editor-header">
                        <select 
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          disabled={!isSolvingMode}
                        >
                          <option value="python">Python</option>
                          <option value="javascript">JavaScript</option>
                          <option value="java">Java</option>
                        </select>
                        {selectedLanguage === 'python' && (
                          <>
                            <button 
                              className="execute-code-button"
                              onClick={() => executeCode(editorContent)}
                              disabled={isExecuting || !isSolvingMode || hasReachedSubmissionLimit || isProblemSolved}
                            >
                              {isExecuting ? 'Executing...' : isProblemSolved ? 'Already Solved' : 'Submit to Full Evaluation'}
                            </button>
                            <span className="submission-count">
                              Submissions: {submissionCount}/10
                            </span>
                          </>
                        )}
                      </div>
                      <div className={`editor-wrapper ${!isSolvingMode ? 'editor-disabled' : ''}`}>
                        {!isSolvingMode && (
                          <div className="editor-overlay">
                            <p>Click "Ready to Solve" to start coding.</p>
                            <p>Note: Once you start coding, you won't be able to chat with the assistant.</p>
                          </div>
                        )}
                        <Editor
                          height="100%"
                          defaultLanguage="python"
                          language={selectedLanguage}
                          value={editorContent}
                          onChange={handleEditorChange}
                          theme="vs-dark"
                          onMount={(editor) => {
                            editorRef.current = editor;
                            editor.layout();
                          }}
                          options={getEditorOptions()}
                        />
                      </div>
                    </>
                  )}
                </div>
              </Panel>
              
              <PanelResizeHandle className="panel-resize-handle" />
              
              <Panel defaultSize={70} minSize={30}>
                <TabPanel
                  activeTab="chat"
                  tabs={{
                    chat: {
                      label: "Chat Assistant",
                      content: (
                        <div className="chat-section">
                          <div className="chat-box" key={isSolvingMode ? 'solving' : 'not-solving'}>
                            {isResetting ? (
                              <div className="loading-container">
                                <div className="loading-bar"></div>
                                <div className="loading-text">
                                  Resetting chat...
                                </div>
                              </div>
                            ) : (
                              <>
                                {messages.map((message, index) => renderMessage(message, index))}
                                {(isGenerating || isExecuting || isLoadingComplete) && (
                                  <div className={`loading-container ${(!isGenerating && !isExecuting) ? 'fade-out' : ''}`}>
                                    <div className="loading-bar"></div>
                                    <div className="loading-text">
                                      {isGenerating ? 'AI is generating response...' : isExecuting ? 'Executing code...' : 'Complete'}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="input-area">
                            <textarea
                              value={input}
                              onChange={handleInputChange}
                              onKeyDown={handleKeyDown}
                              placeholder={isSolvingMode ? "Chat disabled during solving mode" : "Message the AI..."}
                              className="chat-input"
                              disabled={isLoading || isSolvingMode}
                            />
                            <button 
                              className="send-button" 
                              onClick={handleSend} 
                              disabled={isLoading || !input.trim() || isSolvingMode}
                            >
                              {isLoading ? 'Sending...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      )
                    }
                  }}
                />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      
      {showWelcomePopup && (
        <WelcomePopup onClose={handleWelcomeClose} />
      )}
      
      {showModelRankingPopup && (
        <ModelRankingPopup
          onClose={handleModelRankingComplete}
          recentModels={recentModels}
        />
      )}
      
      {showSuccessPopup && (
        <div className="success-popup">
          <div className="success-content">
            <span className="success-icon">✓</span>
            <p>Your trajectory has been submitted successfully!</p>
          </div>
        </div>
      )}
      
      {showMaxSubmissionsModal && (
        <MaxSubmissionsModal
          onClose={() => setShowMaxSubmissionsModal(false)}
          onSubmitTrajectory={() => {
            setShowMaxSubmissionsModal(false);
            handleUploadToStorage();
          }}
        />
      )}
    </div>
  );
};

export default ChatInterface;
