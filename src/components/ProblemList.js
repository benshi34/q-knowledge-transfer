import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useChat } from './ChatProvider';
import './ProblemList.css';
import { problemSources } from '../config/problemSources';
import { auth } from '../firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { saveCustomWorkspace, getCustomWorkspaces, deleteCustomWorkspace, getUserSettings, getTrajectoryCount } from '../firebase/database';
import '../LoadingScreen.css';
import { modelConfigs, isModelAvailable } from '../config/modelConfigs';
import { problemGroups } from '../config/problemGroups';
import { FaUser, FaTrashAlt, FaCode, FaGamepad, FaCog, FaTasks } from 'react-icons/fa';
import ChatArena from './ChatArena';
import TaskManager from './TaskManager';
import Settings from './Settings';

const AdminPasswordModal = ({ onClose, onSubmit }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (password === 'password158') {
      localStorage.setItem('isAdmin', 'true');
      onSubmit();
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <div className="modal-overlay">
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Admin Access Required</h3>
        <div className="password-input-container">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Enter admin password"
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {error && <p className="error-message">{error}</p>}
        </div>
        <div className="modal-buttons">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={handleSubmit}
            disabled={!password.trim()}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

const CustomWorkspaceModal = ({ 
  customQuestion, 
  setCustomQuestion, 
  onClose, 
  onSubmit 
}) => {
  return (
    <div className="modal-overlay">
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Create Custom Workspace</h3>
        <textarea
          autoFocus
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          placeholder="Enter your question or problem description..."
          rows={6}
        />
        <div className="modal-buttons">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={onSubmit}
            disabled={!customQuestion.trim()}
          >
            Create Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

const ProblemList = () => {
  const { 
    chats, 
    searchTerm, 
    setSearchTerm, 
    isOnline,
    updateSolvedProblem,
    selectedModel = getRandomAvailableModel(),
    setSelectedModel,
    solvedProblemsMap,
  } = useChat();

  const { groupId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [recentProblems, setRecentProblems] = useState([]);
  const [inProgressProblems, setInProgressProblems] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    return groupId || localStorage.getItem('selectedGroup') || null;
  });
  const [showCustomWorkspaceModal, setShowCustomWorkspaceModal] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userPhotoURL, setUserPhotoURL] = useState(null);
  const [customWorkspaces, setCustomWorkspaces] = useState([]);
  const [filterByModel, setFilterByModel] = useState(() => {
    const savedFilter = localStorage.getItem('filterByModel');
    return savedFilter !== null ? JSON.parse(savedFilter) : false;
  });
  const [activeTab, setActiveTab] = useState(() => {
    const tab = location.state?.activeTab || 'task-manager';
    console.log('Initial activeTab:', tab);
    return tab;
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isAdmin') === 'true';
  });
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [trajectoryCount, setTrajectoryCount] = useState(0);
  const [dropdownValue, setDropdownValue] = useState('random');

  useEffect(() => {
    if (location.state?.activeTab) {
      console.log('Setting active tab to:', location.state.activeTab);
      setActiveTab(location.state.activeTab);
      navigate('/', { replace: true });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    localStorage.setItem('filterByModel', JSON.stringify(filterByModel));
  }, [filterByModel]);

  useEffect(() => {
    console.log("ProblemList: Starting auth check");
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("ProblemList: Auth state changed", user ? "User logged in" : "No user");
      setAuthChecked(true);
      setUser(user);
      setUserPhotoURL(user?.photoURL || null);
      if (!user) {
        console.log("ProblemList: No user, navigating to home");
        navigate('/');
      }
    });

    // Load recent problems from localStorage
    const storedRecentProblems = localStorage.getItem('recentProblems');
    if (storedRecentProblems) {
      setRecentProblems(JSON.parse(storedRecentProblems));
    }

    return () => {
      console.log("ProblemList: Cleaning up auth listener");
      unsubscribe();
    };
  }, [navigate]);

  // Update the inProgressProblems useEffect
  useEffect(() => {
    const problemsInProgress = Object.keys(chats).filter(problemId => {
      // Check if there are any messages
      if (!chats[problemId] || chats[problemId].length === 0) {
        // If no messages in memory, check localStorage
        const localStorageKey = `chat-${problemId}`;
        const savedChat = localStorage.getItem(localStorageKey);
        if (!savedChat) return false;
        
        try {
          const parsedChat = JSON.parse(savedChat);
          // Check if there are messages but no completion message
          return parsedChat.length > 0 && !parsedChat.some(message => 
            message.message?.includes("Congratulations on solving the problem! It was great working with you! Don't forget to click the 'Submit Trajectory' button at the top to save your progress!")
          );
        } catch (error) {
          console.error('Error parsing saved chat:', error);
          return false;
        }
      }
      
      // Check if any message indicates problem completion
      const hasCompletionMessage = chats[problemId].some(message => 
        message.message?.includes("Congratulations on solving the problem! It was great working with you! Don't forget to click the 'Submit Trajectory' button at the top to save your progress!")
      );
      
      // Problem is in progress if it has messages but no completion message
      return !hasCompletionMessage;
    });
    
    setInProgressProblems(problemsInProgress);
  }, [chats]);

  // Update the allProblems useMemo to handle multiple sources
  const allProblems = useMemo(() => {
    const currentModelSolvedProblems = solvedProblemsMap[selectedModel] || [];
    
    // Create an array to store problems from all sources
    let problems = [];
    
    // Load problems from all sources
    Object.values(problemSources).forEach(sourceConfig => {
      try {
        const problemData = require(`../${sourceConfig.dataFile}`);
        const sourceProblems = Object.entries(problemData).map(([id, problem]) => ({
          ...sourceConfig.mapProblem(id, problem),
          solved: currentModelSolvedProblems.includes(id),
          inProgress: inProgressProblems.includes(id),
          source: sourceConfig.id // Add source identifier to each problem
        }));
        problems = [...problems, ...sourceProblems];
      } catch (error) {
        console.error(`Error loading problem data for ${sourceConfig.id}:`, error);
      }
    });
    
    return problems;
  }, [solvedProblemsMap, selectedModel, inProgressProblems]);

  // Modify the filteredProblems to only show problems from selected group
  const filteredProblems = useMemo(() => {
    if (!selectedGroup || !problemGroups[selectedGroup]) return [];
    
    const currentModelConfig = modelConfigs[selectedModel] || {};
    const solvableProblems = currentModelConfig.solvableProblems || [];
    const currentModelSolvedProblems = solvedProblemsMap[selectedModel] || [];
    const groupProblems = problemGroups[selectedGroup]?.problems || [];
    
    return allProblems
      .filter(problem => 
        !filterByModel || solvableProblems.includes(problem.id)
      )
      .filter(problem => 
        groupProblems.includes(problem.id)
      )
      .filter(problem =>
        problem.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map(problem => ({
        ...problem,
        solved: currentModelSolvedProblems.includes(problem.id)
      }));
  }, [allProblems, searchTerm, selectedModel, solvedProblemsMap, selectedGroup, filterByModel]);

  // Update the stats calculation
  const stats = useMemo(() => {
    const currentModelConfig = modelConfigs[selectedModel] || {};
    const solvableProblems = currentModelConfig.solvableProblems || [];
    const currentModelSolvedProblems = solvedProblemsMap[selectedModel] || [];
    
    // First filter by selected group
    const relevantProblems = selectedGroup && problemGroups[selectedGroup]
      ? allProblems.filter(problem => problemGroups[selectedGroup].problems.includes(problem.id))
      : allProblems;

    // Debug logs
    console.log('Debug stats calculation:');
    console.log('Relevant problems:', relevantProblems);
    console.log('Sample problem structure:', relevantProblems[0]);
    
    const solvedByDifficulty = {
      leetcode: {
        easy: 0,
        medium: 0,
        hard: 0
      }
    };
    const totalByDifficulty = {
      leetcode: {
        easy: 0,
        medium: 0,
        hard: 0
      }
    };

    // Calculate difficulty stats with debug logging
    relevantProblems.forEach(problem => {
      console.log('Processing problem:', {
        id: problem.id,
        source: problem.source,
        difficulty: problem.difficulty,
        isSolved: currentModelSolvedProblems.includes(problem.id)
      });
      
      if (problem.source?.toLowerCase().includes('leetcode')) {
        totalByDifficulty.leetcode[problem.difficulty]++;
        if (currentModelSolvedProblems.includes(problem.id)) {
          solvedByDifficulty.leetcode[problem.difficulty]++;
        }
      }
    });

    console.log('Final difficulty stats:', {
      solvedByDifficulty,
      totalByDifficulty
    });

    // Rest of the stats calculation...
    const totalProblems = filterByModel 
      ? relevantProblems.filter(problem => solvableProblems.includes(problem.id)).length
      : relevantProblems.length;

    const totalSolved = currentModelSolvedProblems
      .filter(id => !selectedGroup || problemGroups[selectedGroup].problems.includes(id))
      .filter(id => !filterByModel || solvableProblems.includes(id))
      .length;

    const totalInProgress = inProgressProblems
      .filter(id => !selectedGroup || problemGroups[selectedGroup].problems.includes(id))
      .filter(id => !filterByModel || solvableProblems.includes(id))
      .length;
    
    const solvedPercentage = totalProblems > 0 ? (totalSolved / totalProblems) * 100 : 0;
    const inProgressPercentage = totalProblems > 0 ? (totalInProgress / totalProblems) * 100 : 0;

    return { 
      totalSolved, 
      totalProblems, 
      totalInProgress,
      solvedPercentage, 
      inProgressPercentage,
      solvedByDifficulty, 
      totalByDifficulty 
    };
  }, [allProblems, solvedProblemsMap, inProgressProblems, selectedModel, selectedGroup, filterByModel]);

  const updateRecentProblems = (problemId) => {
    const updatedRecentProblems = [problemId, ...recentProblems.filter(id => id !== problemId)].slice(0, 5);
    setRecentProblems(updatedRecentProblems);
    localStorage.setItem('recentProblems', JSON.stringify(updatedRecentProblems));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  const handleProblemClick = (problemId) => {
    updateRecentProblems(problemId);
  };

  // Add loading state for model changes
  const [isModelLoading, setIsModelLoading] = useState(false);

  // Update the getRandomAvailableModel function to include logging
  const getRandomAvailableModel = () => {
    const availableModels = Object.entries(modelConfigs)
      .filter(([_, config]) => config.isAvailable)
      .map(([modelId]) => modelId);
    const randomIndex = Math.floor(Math.random() * availableModels.length);
    const selectedModel = availableModels[randomIndex];
    console.log('Random model selected:', selectedModel);
    return selectedModel;
  };

  // Update the handleModelChange function with more logging
  const handleModelChange = async (e) => {
    const newDropdownValue = e.target.value;
    setDropdownValue(newDropdownValue);
    
    const newModel = newDropdownValue === 'random' 
      ? getRandomAvailableModel()
      : newDropdownValue;
    
    console.log('Model selection changed:', {
      dropdownValue: newDropdownValue,
      actualModel: newModel
    });
    
    if (isModelAvailable(newModel)) {
      setIsModelLoading(true);
      setSelectedModel(newModel);
      
      // Wait for next render cycle to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 0));
      
      setIsModelLoading(false);
    }
  };

  // Add a back button handler
  const handleBackToGroups = () => {
    setSelectedGroup(null);
    localStorage.removeItem('selectedGroup');
    navigate('/');  // Navigate to root URL when going back to groups
  };

  // Add this function to handle custom workspace creation
  const handleCreateCustomWorkspace = async () => {
    if (customQuestion.trim() && user) {
      try {
        const customId = `custom-${Date.now()}`;
        const workspaceData = {
          id: customId,
          title: "Custom Problem",
          description: customQuestion,
          timestamp: Date.now(),
          source: 'custom'
        };
        
        // Save to Firebase
        await saveCustomWorkspace(user.uid, workspaceData);
        
        // Update local state
        setCustomWorkspaces(prev => 
          [workspaceData, ...prev].slice(0, 6)
        );
        
        // Clear the form and close the modal
        setCustomQuestion('');
        setShowCustomWorkspaceModal(false);
        
        // Navigate to the chat interface
        navigate(`/chat/${customId}`);
      } catch (error) {
        console.error("Error creating custom workspace:", error);
        // Optionally add error handling UI here
      }
    }
  };

  // Add this useEffect to load custom workspaces
  useEffect(() => {
    const loadCustomWorkspaces = async () => {
      if (user) {
        const workspaces = await getCustomWorkspaces(user.uid);
        const workspaceArray = Object.entries(workspaces)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 6);
        setCustomWorkspaces(workspaceArray);
      }
    };
    loadCustomWorkspaces();
  }, [user]);

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

  // Add this effect to update localStorage when selectedGroup changes
  useEffect(() => {
    if (selectedGroup) {
      localStorage.setItem('selectedGroup', selectedGroup);
    } else {
      localStorage.removeItem('selectedGroup');
    }
  }, [selectedGroup]);

  const handleDeleteWorkspace = async (e, workspaceId) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    if (window.confirm('Are you sure you want to delete this workspace?')) {
      try {
        await deleteCustomWorkspace(user.uid, workspaceId);
        setCustomWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
      } catch (error) {
        console.error('Error deleting workspace:', error);
      }
    }
  };

  // Add this useEffect to load the trajectory count
  useEffect(() => {
    const loadTrajectoryCount = async () => {
      if (user?.uid) {
        try {
          const count = await getTrajectoryCount(user.uid);
          setTrajectoryCount(count);
        } catch (error) {
          console.error('Error loading trajectory count:', error);
        }
      }
    };

    loadTrajectoryCount();
  }, [user]);

  // Add this new effect to handle random model refresh on page load
  useEffect(() => {
    if (dropdownValue === 'random') {
      const newModel = getRandomAvailableModel();
      setSelectedModel(newModel);
    }
  }, []); // Empty dependency array means this runs once on mount

  // Update the render logic to show loading state
  if (!authChecked || isModelLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading{isModelLoading ? ' model' : ''}...</p>
      </div>
    );
  }

  // Update group selection handler
  const handleGroupSelection = (groupId) => {
    setSelectedGroup(groupId);
    localStorage.setItem('selectedGroup', groupId);
    navigate(`/group/${groupId}`);  // Update URL when selecting a group
  };

  // Render the main component
  return (
    <div className="app-container">
      <div className="sidebar-navigation">
        <div 
            className={`nav-item ${activeTab === 'task-manager' ? 'active' : ''}`}
            onClick={() => setActiveTab('task-manager')}
        >
          <FaTasks />
          <span>Task Manager</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'problems' ? 'active' : ''}`}
          onClick={() => setActiveTab('problems')}
        >
          <FaCode />
          <span>Problems</span>
        </div>
        <div 
          className={`nav-item disabled ${activeTab === 'arena' ? 'active' : ''}`}
          onClick={() => alert('The Arena is currently not available.')}
        >
          <FaGamepad />
          <span>Arena</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <FaCog />
          <span>Settings</span>
        </div>
      </div>

      <div className="main-content">
        {activeTab === 'problems' ? (
          !isAdmin ? (
            <div className="settings-prompt">
              <h3>Admin Access Required</h3>
              <p>You need admin access to view problems.</p>
              <button 
                onClick={() => {
                  setShowAdminModal(true);
                }}
              >
                Enter Admin Password
              </button>
            </div>
          ) : (
            <div className="problem-list-container">
              {selectedGroup && (
                <button onClick={handleBackToGroups} className="back-button">
                  ← Back to Groups
                </button>
              )}
              <div className="problem-list-header">
                <h2>{selectedGroup && problemGroups[selectedGroup] 
                  ? problemGroups[selectedGroup].title 
                  : 'CodeHT'}</h2>
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
                        <div className="profile-menu-item" onClick={() => setActiveTab('settings')}>
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
              <div className="problem-list-controls">
                <select
                  value={dropdownValue}
                  onChange={handleModelChange}
                  className="model-selector"
                >
                  <option value="random">Random Model</option>
                  {Object.entries(modelConfigs).map(([modelId, config]) => (
                    <option 
                      key={modelId} 
                      value={modelId}
                      disabled={!config.isAvailable}
                    >
                      {config.displayName}{!config.isAvailable ? ' (Unavailable)' : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="problem-search-input"
                />
              </div>
              {selectedGroup ? (
                <div className="problem-list-content">
                  <div className="problem-table-container">
                    <table className="problem-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Title</th>
                          <th>Difficulty</th>
                          <th>ELO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProblems.map((problem) => (
                          <tr key={problem.id} className={problem.solved ? 'solved' : problem.inProgress ? 'in-progress' : ''}>
                            <td>
                              {problem.solved ? (
                                <span className="status-icon solved">✅</span>
                              ) : problem.inProgress ? (
                                <span className="status-icon in-progress">🔄</span>
                              ) : null}
                            </td>
                            <td>
                              <Link 
                                to={`/chat/${problem.id}?source=${problem.source.toLowerCase()}`} 
                                className="problem-link"
                                onClick={() => handleProblemClick(problem.id)}
                              >
                                {problem.title}
                              </Link>
                            </td>
                            <td className={`difficulty ${problem.difficulty}`}>
                              {problem.difficulty}
                            </td>
                            <td>{problem.elo ? problem.elo.toFixed(2) : 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sidebar">
                    <div className="problem-stats">
                      <h3>Problem Solving Progress</h3>
                      <div className="trajectory-stats">
                        <p className="trajectory-count">Total Trajectories Submitted: {trajectoryCount}</p>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar solved" style={{ width: `${stats.solvedPercentage}%` }}></div>
                        <div className="progress-bar in-progress" style={{ width: `${stats.inProgressPercentage}%` }}></div>
                      </div>
                      <p className="solved-count">
                        {stats.totalSolved} solved, {stats.totalInProgress} in progress / {stats.totalProblems} total
                      </p>
                      <label className="filter-toggle">
                        <input
                          type="checkbox"
                          checked={filterByModel}
                          onChange={(e) => setFilterByModel(e.target.checked)}
                        />
                        Filter by model capability
                      </label>
                      <h4>LeetCode</h4>
                      {['easy', 'medium', 'hard'].map(difficulty => (
                        <div key={difficulty} className="difficulty-progress">
                          <p>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}: {stats.solvedByDifficulty.leetcode[difficulty]} / {stats.totalByDifficulty.leetcode[difficulty]}</p>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar ${difficulty}`} 
                              style={{ 
                                width: `${stats.totalByDifficulty.leetcode[difficulty] > 0 
                                  ? (stats.solvedByDifficulty.leetcode[difficulty] / stats.totalByDifficulty.leetcode[difficulty]) * 100 
                                  : 0}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="recent-problems-container">
                      <h3>Recently Viewed Problems</h3>
                      <ul className="recent-problems-list">
                        {recentProblems.map(id => {
                          const problem = allProblems.find(p => p.id === id);
                          return problem ? (
                            <li key={id}>
                              <Link 
                                to={`/chat/${id}`}
                                onClick={() => updateRecentProblems(id)}
                              >
                                {problem.title}
                              </Link>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="problem-groups-grid">
                  {customWorkspaces.length > 0 && (
                    <div className="custom-workspaces-section">
                      <h3>Recent Custom Workspaces</h3>
                      <div className="custom-workspaces-grid">
                        {customWorkspaces.map(workspace => (
                          <div 
                            key={workspace.id}
                            className="problem-group-card custom-workspace"
                            onClick={() => navigate(`/chat/${workspace.id}`)}
                            style={{
                              borderLeft: '4px solid #6c5ce7',
                              backgroundColor: '#6c5ce710',
                              position: 'relative'
                            }}
                          >
                            <button
                              className="delete-workspace-btn"
                              onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                              title="Delete workspace"
                            >
                              <FaTrashAlt />
                            </button>
                            <h3>Custom Workspace</h3>
                            <p>{workspace.description.length > 100 
                              ? workspace.description.substring(0, 100) + '...' 
                              : workspace.description}</p>
                            <div className="group-stats">
                              <span>{new Date(workspace.timestamp).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div 
                    className="problem-group-card custom-workspace"
                    onClick={() => setShowCustomWorkspaceModal(true)}
                    style={{
                      borderLeft: '4px solid #6c5ce7',
                      backgroundColor: '#6c5ce710'
                    }}
                  >
                    <h3>Custom Workspace</h3>
                    <p>Create a blank workspace with your own question or problem.</p>
                    <div className="group-stats">
                      <span>✨ Create New</span>
                    </div>
                  </div>

                  {Object.values(problemGroups)
                    .filter(group => 
                      group.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      group.description.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(group => (
                      <div 
                        key={group.id} 
                        className="problem-group-card"
                        onClick={() => handleGroupSelection(group.id)}
                        style={{
                          borderLeft: `4px solid ${group.color}`,
                          backgroundColor: `${group.color}10`
                        }}
                      >
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                        <div className="group-stats">
                          <span>{group.problems.length} Problems</span>
                          <span>
                            {group.problems.filter(id => 
                              solvedProblemsMap[selectedModel]?.includes(id)
                            ).length} Solved
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {showCustomWorkspaceModal && (
                <CustomWorkspaceModal
                  customQuestion={customQuestion}
                  setCustomQuestion={setCustomQuestion}
                  onClose={() => setShowCustomWorkspaceModal(false)}
                  onSubmit={handleCreateCustomWorkspace}
                />
              )}
            </div>
          )
        ) : activeTab === 'task-manager' ? (
          <TaskManager />
        ) : activeTab === 'arena' ? (
          <div className="arena-disabled-message">
            <h2>Arena Coming Soon</h2>
            <p>The Arena feature is currently not available. Please check back later!</p>
          </div>
        ) : (
          <Settings />
        )}

        {showAdminModal && (
          <AdminPasswordModal
            onClose={() => setShowAdminModal(false)}
            onSubmit={() => {
              setIsAdmin(true);
              setShowAdminModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ProblemList;
