import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import ProblemList from './components/ProblemList';
import ChatInterface from './components/ChatInterface';
import LoginInterface from './components/LoginInterface';
import { ChatProvider, useChat } from './components/ChatProvider';
import './LoadingScreen.css';
import SignupInterface from './components/SignupInterface';

const ProtectedRoute = ({ children }) => {
  const { user, loading, isOnline } = useChat();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }
  
  if (!isOnline) {
    return <div>You are offline. Please check your internet connection.</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

function App() {
  return (
    <ChatProvider>
      <Routes>
        <Route path="/login" element={<LoginInterface />} />
        <Route path="/" element={
          <ProtectedRoute>
            <ProblemList />
          </ProtectedRoute>
        } />
        <Route path="/group/:groupId" element={
          <ProtectedRoute>
            <ProblemList />
          </ProtectedRoute>
        } />
        <Route path="/chat/:problemId" element={
          <ProtectedRoute>
            <ChatInterface />
          </ProtectedRoute>
        } />
        <Route path="/signup" element={<SignupInterface />} />
      </Routes>
    </ChatProvider>
  );
}

export default App;
