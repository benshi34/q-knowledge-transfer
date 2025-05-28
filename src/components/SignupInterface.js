import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { signUpWithEmail, signInWithGoogle } from '../firebase/database';
import './LoginInterface.css';

const SignupInterface = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    try {
      await signUpWithEmail(email, password);
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
      <h2>Create Account</h2>
      <form onSubmit={handleSignup}>
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
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm Password"
          required
        />
        <button type="submit">Sign Up</button>
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
        Already have an account?
        <button 
          onClick={() => navigate('/login')}
          className="secondary"
        >
          Login
        </button>
      </p>
      
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default SignupInterface; 