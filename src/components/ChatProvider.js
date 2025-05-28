import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getSolvedProblems, markProblemAsSolved, saveChatLogs, getChatLogs, getModelForProblem, saveModelForProblem } from '../firebase/database';
import { modelConfigs, defaultModel, isModelAvailable } from '../config/modelConfigs';
import { migrateChatLogs } from '../utils/migrateChatLogs';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [chats, setChats] = useState({});
  const [solvedProblemsMap, setSolvedProblemsMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedModel, setSelectedModel] = useState(null);
  const [arenaResponses, setArenaResponses] = useState({
    modelA: '',
    modelB: ''
  });
  const [currentArenaProblem, setCurrentArenaProblem] = useState(null);
  const [hasVotedArena, setHasVotedArena] = useState(false);

  useEffect(() => {
    console.log("ChatProvider: Starting auth listener");
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("ChatProvider: Auth state changed", currentUser ? "User logged in" : "No user");
      setUser(currentUser);
      
      // Run migration when user logs in
      if (currentUser) {
        try {
          await migrateChatLogs(currentUser.uid);
        } catch (error) {
          console.error("Error during chat logs migration:", error);
        }
      }
      
      setLoading(false);
    });

    return () => {
      console.log("ChatProvider: Cleaning up auth listener");
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      if (user && isOnline) {
        try {
          const solvedMap = {};
          for (const modelId of Object.keys(modelConfigs)) {
            const modelSolvedProblems = await getSolvedProblems(modelId);
            solvedMap[modelId] = modelSolvedProblems;
          }
          setSolvedProblemsMap(solvedMap);
        } catch (error) {
          console.error("Error fetching user data:", error);
          setSolvedProblemsMap({});
        }
      } else {
        setSolvedProblemsMap({});
      }
    };

    fetchUserData();
  }, [user, isOnline]);

  useEffect(() => {
    const loadChats = async () => {
      if (user && isOnline) {
        try {
          const userChats = {};
          for (const problemId of Object.keys(chats)) {
            const chatLogs = await getChatLogs(user.uid, problemId);
            userChats[problemId] = chatLogs;
          }
          
          setChats(userChats);

          const modelSolvedProblems = await getSolvedProblems(selectedModel);
          setSolvedProblemsMap(prev => ({
            ...prev,
            [selectedModel]: modelSolvedProblems
          }));
        } catch (error) {
          console.error("Error loading chats:", error);
        }
      }
    };

    loadChats();
  }, [user, isOnline]);

  useEffect(() => {
    const initializeModel = async () => {
      if (user?.uid && window.location.pathname.includes('/chat/')) {
        const problemId = window.location.pathname.split('/chat/')[1].split('?')[0];
        
        try {
          // Try to get existing model assignment
          let modelId = await getModelForProblem(user.uid, problemId);
          
          // If no model assigned yet, randomly assign one and save it
          if (!modelId) {
            const availableModels = Object.entries(modelConfigs)
              .filter(([_, config]) => config.isAvailable)
              .map(([modelId]) => modelId);
            
            modelId = availableModels[Math.floor(Math.random() * availableModels.length)];
            await saveModelForProblem(user.uid, problemId, modelId);
          }
          
          setSelectedModel(modelId);
        } catch (error) {
          console.error('Error initializing model:', error);
        }
      }
    };

    initializeModel();
  }, [user]);

  const updateChat = async (problemId, messages, solvedProblems = null) => {
    console.log('updateChat called:', { 
      problemId, 
      messagesLength: messages.length,
      messages: messages // Log full messages array
    });

    if (user && isOnline) {
      try {
        // Log before Firebase save
        console.log('Saving to Firebase:', {
          userId: user.uid,
          problemId,
          messages
        });

        // Wait for Firebase save to complete
        await saveChatLogs(user.uid, problemId, messages);
        
        console.log('Firebase save successful');

        // Then update local state
        setChats(prevChats => {
          const newChats = {
            ...prevChats,
            [problemId]: messages
          };
          console.log('Updated local chat state:', newChats);
          return newChats;
        });
        
        if (solvedProblems) {
          setSolvedProblemsMap(prev => ({
            ...prev,
            [selectedModel]: solvedProblems
          }));
        }
      } catch (error) {
        console.error('Error in updateChat:', error);
      }
    } else {
      console.log('Update chat skipped:', { 
        userPresent: !!user, 
        isOnline 
      });
    }
  };

  const resetChat = async (problemId) => {
    if (user && isOnline) {
      await saveChatLogs(user.uid, problemId, []);
    }
    setChats(prevChats => {
      const newChats = { ...prevChats };
      delete newChats[problemId];
      return newChats;
    });
  };

  const fetchChatLogs = async (problemId) => {
    console.log('fetchChatLogs called:', { problemId });
    if (user && isOnline) {
      try {
        const chatLogs = await getChatLogs(user.uid, problemId);
        console.log('Retrieved chat logs:', chatLogs);
        setChats(prevChats => {
          const newChats = {
            ...prevChats,
            [problemId]: chatLogs
          };
          console.log('Updated chats state with fetched logs:', newChats);
          return newChats;
        });
        return chatLogs;
      } catch (error) {
        console.error('Error in fetchChatLogs:', error);
        return [];
      }
    }
    console.log('fetchChatLogs skipped:', { userPresent: !!user, isOnline });
    return [];
  };

  const updateSolvedProblem = async (problemId) => {
    if (user) {
      const updatedSolvedProblems = await markProblemAsSolved(problemId, selectedModel);
      setSolvedProblemsMap(prev => ({
        ...prev,
        [selectedModel]: updatedSolvedProblems
      }));
    }
  };

  const value = {
    chats,
    updateChat,
    resetChat,
    fetchChatLogs,
    solvedProblemsMap,
    setSolvedProblemsMap,
    updateSolvedProblem,
    markProblemAsSolved,
    searchTerm,
    setSearchTerm,
    user,
    loading,
    isOnline,
    selectedModel,
    setSelectedModel,
    modelConfigs,
    arenaResponses,
    setArenaResponses,
    currentArenaProblem,
    setCurrentArenaProblem,
    hasVotedArena,
    setHasVotedArena,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
