import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { signInWithEmail, signInWithGoogle } from '../firebase/database';
import './LoginInterface.css';

const LoginInterface = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await signInWithEmail(email, password);
      navigate('/');
    } catch (error) {
      setError(error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="login-container">
      <h2>CodeHT</h2>
      <form onSubmit={handleAuth}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit">Login</button>
      </form>
      <div className="divider">
        <span>or</span>
      </div>
      <button 
        onClick={handleGoogleSignIn}
        className="google-button"
      >
        <FcGoogle size={20} />
        Continue with Google
      </button>
      <p>
        Don't have an account?
        <button 
          onClick={() => navigate('/signup')}
          className="secondary"
        >
          Sign Up
        </button>
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default LoginInterface;
