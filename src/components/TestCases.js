import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TestCases.css';
import { useChat } from './ChatProvider';
import { saveTestCases, getTestCases } from '../firebase/database';
import { useParams } from 'react-router-dom';

const TestCases = ({ editorContent, onTestCasesUpdate }) => {
  const [testCases, setTestCases] = useState([]);
  const [input, setInput] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const { user } = useChat();
  const { problemId } = useParams();

  useEffect(() => {
    const loadTestCases = async () => {
      if (user && problemId) {
        const savedTestCases = await getTestCases(user.uid, problemId);
        if (savedTestCases) {
          setTestCases(savedTestCases);
          onTestCasesUpdate(savedTestCases);
        }
      }
    };
    loadTestCases();
  }, [user, problemId, onTestCasesUpdate]);

  const addTestCase = async () => {
    if (input.trim() && expectedOutput.trim()) {
      const newTestCases = [
        ...testCases,
        {
          input: input.trim(),
          expectedOutput: expectedOutput.trim(),
          actualOutput: null,
          passed: null
        }
      ];
      setTestCases(newTestCases);
      
      if (user && problemId) {
        await saveTestCases(user.uid, problemId, newTestCases);
      }
      
      onTestCasesUpdate(newTestCases);
      
      setInput('');
      setExpectedOutput('');
    }
  };

  const runTestCase = async (index) => {
    setIsRunning(true);
    try {
      const response = await axios.post('https://code-ht-backend-ac832c92f505.herokuapp.com/execute-test-case', {
        code: editorContent,
        input: testCases[index].input,
        expected_output: testCases[index].expectedOutput
      });

      const updatedTestCases = [...testCases];
      updatedTestCases[index] = {
        ...updatedTestCases[index],
        actualOutput: response.data.output,
        passed: response.data.passed
      };
      setTestCases(updatedTestCases);
      
      if (user && problemId) {
        await saveTestCases(user.uid, problemId, updatedTestCases);
      }
    } catch (error) {
      const updatedTestCases = [...testCases];
      updatedTestCases[index] = {
        ...updatedTestCases[index],
        actualOutput: error.response?.data?.output || `Error: ${error.message}`,
        passed: false
      };
      setTestCases(updatedTestCases);
      
      if (user && problemId) {
        await saveTestCases(user.uid, problemId, updatedTestCases);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const removeTestCase = async (index) => {
    const newTestCases = testCases.filter((_, i) => i !== index);
    setTestCases(newTestCases);
    
    if (user && problemId) {
      await saveTestCases(user.uid, problemId, newTestCases);
    }
    
    onTestCasesUpdate(newTestCases);
  };

  return (
    <div className="test-cases-container">
      <div className="test-case-input-section">
        <div className="input-group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Input"
            className="test-input"
          />
          <textarea
            value={expectedOutput}
            onChange={(e) => setExpectedOutput(e.target.value)}
            placeholder="Expected Output"
            className="test-input"
          />
          <button onClick={addTestCase} className="add-test-button">
            Add Test Case
          </button>
        </div>
      </div>

      <div className="test-cases-list">
        {testCases.map((testCase, index) => (
          <div key={index} className="test-case-item">
            <div className="test-case-header">
              <span>Test Case #{index + 1}</span>
              <button
                onClick={() => removeTestCase(index)}
                className="remove-test-button"
              >
                ×
              </button>
            </div>
            <div className="test-case-content">
              <div className="test-case-io">
                <div>Input: {testCase.input}</div>
                <div>Expected: {testCase.expectedOutput}</div>
                {testCase.actualOutput !== null && (
                  <>
                    <div>Actual: {testCase.actualOutput}</div>
                    <div>
                      Status: 
                      <span className={`status-indicator ${testCase.passed ? 'passed' : 'failed'}`}>
                        {testCase.passed ? 'Passed ✓' : 'Failed ✗'}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => runTestCase(index)}
                disabled={isRunning}
                className="run-test-button"
              >
                {isRunning ? 'Running...' : 'Run'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TestCases; 