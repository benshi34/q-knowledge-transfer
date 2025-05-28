import axios from 'axios';

// Get API key based on model type, checking multiple environment variable naming conventions
const getApiKey = (model) => {
  // For Gemini models, check different environment variable names
  if (model.toLowerCase().includes('gemini')) {
    // Check both naming conventions and localStorage
    const envGeminiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const localStorageGeminiKey = localStorage.getItem('geminiApiKey');
    return envGeminiKey || localStorageGeminiKey;
  } 
  
  // For Together models (DeepSeek and Llama)
  if (model.toLowerCase().includes('deepseek') || model.toLowerCase().includes('llama')) {
    const envTogetherKey = process.env.REACT_APP_TOGETHER_API_KEY || process.env.TOGETHER_API_KEY;
    const localStorageTogetherKey = localStorage.getItem('togetherApiKey');
    return envTogetherKey || localStorageTogetherKey;
  }
  
  // For OpenAI models, check different environment variable names
  const envOpenAIKey = process.env.REACT_APP_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const localStorageOpenAIKey = localStorage.getItem('openaiApiKey');
  return envOpenAIKey || localStorageOpenAIKey;
};

// Get the appropriate base URL based on the model
const getBaseUrl = (model) => {
  if (model.toLowerCase().includes('gemini')) {
    return "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  if (model.toLowerCase().includes('deepseek') || model.toLowerCase().includes('llama')) {
    return "https://api.together.xyz/v1";
  }
  return "https://api.openai.com/v1";
};

// Helper function to determine the API type
const getApiType = (model) => {
  if (model.toLowerCase().includes('gemini')) {
    return 'gemini';
  }
  if (model.toLowerCase().includes('deepseek') || model.toLowerCase().includes('llama')) {
    return 'together';
  }
  return 'openai';
};

// Helper function to check if temperature should be included
const shouldIncludeTemperature = (model) => {
  // GPT-4o-mini (o1) doesn't support temperature parameter
  return !model.toLowerCase().includes('gpt-4o-mini') && !model.toLowerCase().includes('o1');
};

export const generateOpenAIResponse = async (messages, model = 'gpt-4o') => {
  const apiKey = getApiKey(model);
  const apiType = getApiType(model);
  
  if (!apiKey) {
    throw new Error(`API key not found for ${model}. Please add it to your environment variables (.env file) or settings.`);
  }

  const baseUrl = getBaseUrl(model);

  // Log which key source is being used (remove in production)
  const keySource = (process.env.REACT_APP_OPENAI_API_KEY || process.env.OPENAI_API_KEY || 
                     process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY ||
                     process.env.REACT_APP_TOGETHER_API_KEY || process.env.TOGETHER_API_KEY) 
                     ? 'Environment' : 'LocalStorage';
  console.log('Using API key from:', keySource);
  console.log('Using model:', model, 'with baseUrl:', baseUrl, 'API type:', apiType);

  try {
    // Create request body based on model compatibility
    const requestBody = {
      model,
      messages,
    };
    
    // Only add temperature for models that support it
    if (shouldIncludeTemperature(model)) {
      requestBody.temperature = 0.7;
    }

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(`${apiType.toUpperCase()} API error:`, error);
    
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error(`Invalid API key. Please check your ${apiType.toUpperCase()} API key.`);
      } else if (error.response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`${apiType.toUpperCase()} API error: ${error.response.data.error?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error(`No response from ${apiType.toUpperCase()}. Please check your internet connection.`);
    } else {
      throw new Error(`Error setting up request: ${error.message}`);
    }
  }
};

// For streaming responses
export const generateOpenAIStreamingResponse = async (messages, model = 'gpt-4o', onChunk) => {
  const apiKey = getApiKey(model);
  const apiType = getApiType(model);
  
  if (!apiKey) {
    throw new Error(`API key not found for ${model}. Please add it to your environment variables (.env file) or settings.`);
  }

  const baseUrl = getBaseUrl(model);

  try {
    // Create request body based on model compatibility
    const requestBody = {
      model,
      messages,
      stream: true,
    };
    
    // Only add temperature for models that support it
    if (shouldIncludeTemperature(model)) {
      requestBody.temperature = 0.7;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Server responded with status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.substring(6));
            const content = data.choices[0]?.delta?.content || '';
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e);
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`${apiType.toUpperCase()} streaming API error:`, error);
    throw error;
  }
}; 