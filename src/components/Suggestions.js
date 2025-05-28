import React, { useState, useEffect } from 'react';
import './Suggestions.css';
import axios from 'axios';

const Suggestions = ({ onSendToChat, problemDescription }) => {
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [userThoughts, setUserThoughts] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        // Try to get cached suggestions first
        const cachedSuggestions = localStorage.getItem(`suggestions-${window.location.pathname}`);
        if (cachedSuggestions) {
          setSuggestions(JSON.parse(cachedSuggestions));
          setIsLoading(false);
          return;
        }

        const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/generate', {
          messages: [
            {
              role: 'system',
              content: `You are a coding assistant. Given this problem:\n\n${problemDescription}\n\nGenerate 4 different high-level approach suggestions for solving it. Focus on algorithmic strategies and data structures that would be effective. Your response must be a valid JSON array that can be parsed.

Example format:
[
  {
    "type": "dynamic-programming",
    "title": "Bottom-up DP with Memoization",
    "content": "This approach would use dynamic programming by..."
  },
  {
    "type": "two-pointers",
    "title": "Two Pointer Sliding Window",
    "content": "Using two pointers to maintain a window..."
  }
]`
            },
            {
              role: 'user',
              content: 'Generate exactly 4 different solution approaches for this specific problem. Return ONLY the JSON array with no additional text or explanation. Each approach should have a "type", "title", and "content" field. The content should explain how this approach specifically applies to solving this problem.'
            }
          ],
          model: 'gpt-4o'
        });

        // Parse the JSON from the AI response
        const suggestionsText = response.data.message;
        const suggestionsData = JSON.parse(suggestionsText);

        // Add IDs to the suggestions
        const suggestionsWithIds = suggestionsData.map((suggestion, index) => ({
          ...suggestion,
          id: index + 1
        }));

        // Cache the suggestions
        localStorage.setItem(
          `suggestions-${window.location.pathname}`, 
          JSON.stringify(suggestionsWithIds)
        );

        setSuggestions(suggestionsWithIds);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([{
          id: 1,
          type: 'error',
          title: 'Error Loading Suggestions',
          content: 'Failed to load AI-generated suggestions. Please try refreshing the page.'
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch suggestions if we have a problem description
    if (problemDescription) {
      fetchSuggestions();
    }
  }, [problemDescription]);

  // Add a function to force refresh suggestions
  const handleRefreshSuggestions = async () => {
    // Clear the cache for this problem
    localStorage.removeItem(`suggestions-${window.location.pathname}`);
    setIsLoading(true);
    
    // Re-run the fetch suggestions logic
    if (problemDescription) {
      const fetchSuggestions = async () => {
        // ... (same fetchSuggestions code as above)
      };
      await fetchSuggestions();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSelectedSuggestion(suggestion);
    setUserThoughts('');
  };

  const handleAddToChat = () => {
    if (selectedSuggestion && userThoughts.trim()) {
      const message = `Regarding the suggestion about ${selectedSuggestion.title}:\n${selectedSuggestion.content}\n\nMy thoughts: ${userThoughts}`;
      onSendToChat(message);
      setSelectedSuggestion(null);
      setUserThoughts('');
    }
  };

  return (
    <div className="suggestions-container">
      <div className="suggestions-header">
        <h3>Solution Suggestions</h3>
        <div className="suggestions-controls">
          <small>AI-generated approaches for this problem</small>
          <button 
            className="refresh-suggestions-button"
            onClick={handleRefreshSuggestions}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="suggestions-loading">Loading suggestions...</div>
      ) : (
        <div className="suggestions-list">
          {suggestions.map((suggestion) => (
            <div 
              key={suggestion.id} 
              className={`suggestion-card ${suggestion.type} ${selectedSuggestion?.id === suggestion.id ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <h4>{suggestion.title}</h4>
              <p>{suggestion.content}</p>
            </div>
          ))}
        </div>
      )}
      {selectedSuggestion && (
        <div className="thoughts-input-container">
          <textarea
            value={userThoughts}
            onChange={(e) => setUserThoughts(e.target.value)}
            placeholder="Add your thoughts about this suggestion..."
            className="thoughts-input"
          />
          <button 
            className="add-to-chat-button"
            onClick={handleAddToChat}
            disabled={!userThoughts.trim()}
          >
            Add to Chat
          </button>
        </div>
      )}
    </div>
  );
};

export default Suggestions; 