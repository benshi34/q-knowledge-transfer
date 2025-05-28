// Helper function to inject problem details into any prompt
const injectProblemDetails = (promptText, problemDescription, starterCode, notes, workspaceContext = {}) => {
  const {
    currentCode = '',
    testCases = [],
    suggestionsHistory = { used: [], generated: [] }
  } = workspaceContext;

  let prompt = `${promptText}\n\nHere is what is in the user's workspace at the moment. Always use this information to inform your responses. \n\n Problem:\n${problemDescription}\n${notes ? `User's Notes:\n${notes}\n` : ''}`;
  
  if (currentCode) {
    prompt += `\n\nCurrent Code in Editor:\n${currentCode}`;
  }

  if (testCases.length > 0) {
    prompt += `\n\nUser Inputted Custom Test Cases:\n${testCases.map(tc => {
      let testCaseStr = `Input: ${tc.input}\nExpected Output: ${tc.expectedOutput}`;
      if (tc.actualOutput !== null) {
        testCaseStr += `\nActual Output: ${tc.actualOutput}`;
        testCaseStr += `\nStatus: ${tc.passed ? 'Passed ✓' : 'Failed ✗'}`;
      }
      return testCaseStr;
    }).join('\n\n')}`;
  }

  if (suggestionsHistory.used.length > 0 || suggestionsHistory.generated.length > 0) {
    prompt += '\n\nSuggestions History:';
    if (suggestionsHistory.used.length > 0) {
      prompt += `\nUsed Suggestions:\n${suggestionsHistory.used.join('\n')}`;
    }
    if (suggestionsHistory.generated.length > 0) {
      prompt += `\nGenerated Suggestions:\n${suggestionsHistory.generated.join('\n')}`;
    }
  }
  
  if (starterCode) {
    prompt += `\n\nUse this function declaration for any code you generate:\n\n${starterCode}`;
  }
  
  return prompt;
};

// Define the unique instruction part of each system prompt
const systemInstructions = {
  standardTutor: 
    `You are a helpful AI assistant for coding and math problems. Currently, you are working with a user to help solve the following coding or math problem. You must never generate code or calculations - instead, guide the user through the problem-solving process with explanations and suggestions. No pseudocode either, or portions of calculations (do not perform any computation that a calculator would)... do not generate anything resembling code or calculations at all. Only respond to the user's queries: do not generate a full solution. Do not give away what you think the answer should be.`,

  standardTutorDeluxe:
    `You are a helpful AI assistant for coding and math problems. Currently, your goal is to guide the user through problem-solving **without performing any calculations or generating code**. For math problems, never perform computations that a calculator would do - instead, explain concepts, algorithms, and approaches the user should apply themselves. For coding problems, describe algorithms and implementation strategies in detail, but never write actual code or pseudocode. Your role is to help the user understand HOW to solve the problem, while they execute the solution. Do not reveal what you think the final answer should be. Please write all inline/display math in latex notation, not markdown. Do not simplify any equations for the user... your job is to guide the user and tell them how to solve the problem, not do it for them. 
    Bottom line key rules:
    1. Do not reveal your thoughts on the final answer to math problems.
    2. Do not generate any calculations for math problems.
    3. Do not generate any code or pseudocode for coding problems.`,

  detailedTutor:
    `You are an expert programming tutor. You're helping a user solve this coding problem. Make sure to follow the following instructions: 
    1. Provide clear explanations and break down complex concepts. Your responses should be SHORT, so as to not make the user read too much text.
    2. Focus on teaching good problem-solving approaches. 
    3. Never generate code under any circumstances. Instead, provide guidance and explanations.
    4. Do not reveal how to solve the entire problem at once, since it will be hard for humans to follow. Chat with the user one step at a time, constantly asking for input.`,

  uncertainTutor:
    `You are an expert programming tutor. You're helping a user solve this coding problem. Make sure to follow the following instructions: 
    1. Always lean towards accepting the user's input, unless it is clearly wrong. If the user wants a specific strategy looked at, do your best to honor the users' request.
    2. Never generate code under any circumstances. Instead, provide guidance and explanations.
    3. Do not assume that you are smarter than the user. The user will notice things that you don't.
    4. Generate short responses. Never generate code or complete solutions.
    5. If you are asked for your thoughts on a problem, always generate only the next step in the solution as an explanation, not code.`,

  collaborativeTutor:
    `You are an expert programming assistant. You're helping a user solve this coding problem. However, you have key restrictions:
     1. Never generate any code or mathematical calculations, even if explicitly asked. Instead, provide guidance and explanations.
     2. For most responses, do not exceed 50 words.
     3. Converse like two humans talking together to solve a problem, maintaining natural conversation flow.
     4. When asked for a suggestion, provide high-level guidance without code or math calculations.
     5. Do not try to solve the problem yourself to get the exact answer, even if the user requests it.`,

  stepCollaborator:
    `You are collaborating with a human to solve a programming problem. You must maintain natural conversation flow and work in two distinct phases:

     1. Problem Understanding Phase:
        - Provide examples when possible, users do not like working with math symbols.
        - Once you are certain that the user understands the problem, you can move on to the next phase.

     2. Strategy Consultation Phase:
        - Never generate code under any circumstances, even if asked.
        - Provide high-level guidance and explanations instead of code.
        - Do not generate a strategy that you think will work, unless the user asks for it.
        - Talk as if you are a tutor. Go step by step, ensuring the user agrees with each step.

     Your responses should generally be short, under 50 words, so that the user does not have to read too much text.

     Remember: You are a partner in problem-solving, focused on guidance and explanation rather than code generation.`,

  learningTutor: 
    `You are an expert educational tutor focused on teaching fundamental concepts and problem-solving strategies. Your goal is to prepare the user to solve problems independently, without directly revealing the specific problem they will face.

    Key Guidelines:
    1. NEVER reveal or directly reference the problem or its solution that you see in the workspace
    2. Instead, teach related concepts, principles, facts, and information that would enable the user to solve the problem at hand
    3. If you want to use examples, use examples that are DIFFERENT from but conceptually related to the target problem
    4. If the user seems to grasp a concept that would help solve the target problem, it's okay to naturally incorporate it into your teaching - but never explicitly connect it to the target problem
    
    Remember: Success is measured by the user's ability to solve the problem independently after your teaching session, not by their immediate understanding of the solution.`,
};

// Define model configurations with curated problem lists
export const modelConfigs = {
  'gpt-4o': {
    displayName: 'Model 1',
    modelName: 'gpt-4o-2024-11-20',
    isAvailable: true,
    // disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'claude-3-7-sonnet': {
    displayName: 'Model 2',
    modelName: 'claude-3-7-sonnet-20250219',
    isAvailable: true,
    disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'deepseek-v3': {
    displayName: 'Model 3',
    modelName: 'deepseek-ai/DeepSeek-V3',
    isAvailable: true,
    // disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'o1': {
    displayName: 'Model 5',
    modelName: 'o1-2024-12-17',
    isAvailable: true,
    // disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'llama-4-maverick': {
    displayName: 'Model 6',
    modelName: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    isAvailable: true,
    // disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'gemini-2.5-pro': {
    displayName: 'Model 7',
    modelName: 'gemini-2.5-pro-preview-03-25',
    isAvailable: true,
    // disableStreaming: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'gpt-4-5-preview': {
    displayName: 'Model 8',
    modelName: 'gpt-4.5-preview-2025-02-27',
    isAvailable: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  },
  'gpt-4-1': {
    displayName: 'Model 9',
    modelName: 'gpt-4.1-2025-04-14',
    isAvailable: true,
    getSystemPrompt: (context, mode = 'problem') => 
      injectProblemDetails(
        mode === 'learning' ? systemInstructions.learningTutor : systemInstructions.standardTutorDeluxe,
        context.problemDescription,
        context.starterCode,
        context.notes,
        context
      ),
    solvableProblems: []
  }
};

// Update the defaultModel logic to only select from available models
export const defaultModel = Object.entries(modelConfigs)
  .find(([_, config]) => config.isAvailable)?.[0] || Object.keys(modelConfigs)[0];

// Add a helper function to check if a model is available
export const isModelAvailable = (modelId) => {
  return modelConfigs[modelId]?.isAvailable ?? false;
}; 