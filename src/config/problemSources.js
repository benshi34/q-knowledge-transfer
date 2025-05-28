// Import and transform the ELO ratings at the top of the file
const leetcodeElosArray = require('../leetcode_elos.json');

// Transform the array into a lookup object using TitleSlug as the key
const leetcodeElos = leetcodeElosArray.reduce((acc, problem) => {
  acc[problem.TitleSlug] = problem.Rating; // Changed to use 'Rating' instead of 'elo'
  return acc;
}, {});

// Define the structure and configuration for different problem sources
export const problemSources = {
  USACO: {
    id: 'USACO',
    displayName: 'USACO Problems',
    dataFile: 'usaco_subset307_dict_standardized.json',
    difficultyLevels: ['bronze', 'silver', 'gold', 'platinum'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.title || id,
      difficulty: (problem.difficulty || 'unknown').toLowerCase(),
      description: problem.description || '',
      source: 'USACO'
    })
  },
  LeetCode: {
    id: 'LeetCode',
    displayName: 'LeetCode Problems',
    dataFile: 'leetcode_problem_dict_standardized.json',
    difficultyLevels: ['easy', 'medium', 'hard'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.id || id,
      difficulty: problem.difficulty || 'unknown',
      description: problem.description || '',
      source: 'LeetCode',
      elo: leetcodeElos[problem.titleSlug || id] || null
    })
  },
  'LeetCode-V2': {
    id: 'LeetCode-V2',
    displayName: 'LeetCode Problems V2',
    dataFile: 'leetcode_problem_dict_v2_v5_with_elo.json',
    difficultyLevels: ['easy', 'medium', 'hard'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.id || id,
      difficulty: problem.difficulty || 'unknown',
      description: problem.description || 'Problem description not available.',
      source: 'LeetCode',
      elo: leetcodeElos[problem.titleSlug || id] || null
    })
  },
  Math: {
    id: 'Math',
    displayName: 'Math Problems',
    dataFile: 'livebench_math_question_dict_standardized.json',
    difficultyLevels: ['easy', 'medium', 'hard'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.title || `Math Question ${id.substring(0, 8)}`,
      difficulty: problem.difficulty || 'unknown',
      description: problem.description || '',
      source: 'Math'
    })
  },
  'Math-V2': {
    id: 'Math-V2',
    displayName: 'Math Problems V2',
    dataFile: 'livebench_math_question_dict_no_figures.json',
    difficultyLevels: ['easy', 'medium', 'hard', 'hardest'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.title || `Math Question ${id.substring(0, 8)}`,
      difficulty: problem.difficulty || 'unknown',
      description: problem.description || '',
      source: 'Math-V2',
      elo: calculateMathElo(problem)
    })
  },
  'Learning': {
    id: 'Learning',
    displayName: 'Learning Problems',
    dataFile: 'learning_problems_standardized_fixed.json',
    difficultyLevels: ['beginner', 'intermediate', 'advanced'],
    mapProblem: (id, problem) => ({
      id,
      title: problem.title || `Learning Problem ${id.substring(0, 8)}`,
      difficulty: problem.difficulty || 'intermediate',
      description: problem.description || '',
      source: 'Learning',
      // Add any additional fields that might be useful
      category: problem.category || 'general'
    })
  }
};

const calculateMathElo = (problem) => {
  // Convert source to uppercase for consistent comparison
  const source = (problem.source || '').toUpperCase();
  const problemNum = problem.problem_num || 0;

  // Handle AMC problems
  if (source.includes('AMC')) {
    if (problemNum >= 1 && problemNum <= 10) {
      // Linear scale from 1.5 to 2.0 for problems 1-10
      return 1.5 + (0.5 * (problemNum - 1) / 9);
    } else if (problemNum >= 11 && problemNum <= 20) {
      // Linear scale from 2.5 to 3.5 for problems 11-20
      return 2.5 + (1.0 * (problemNum - 11) / 9);
    } else if (problemNum >= 21 && problemNum <= 25) {
      // Linear scale from 4.0 to 5.5 for problems 21-25
      return 4.0 + (1.5 * (problemNum - 21) / 4);
    }
  }
  
  // Handle AIME problems
  if (source.includes('AIME')) {
    if (problemNum >= 1 && problemNum <= 5) return 3;
    if (problemNum >= 6 && problemNum <= 9) return 4;
    if (problemNum >= 10 && problemNum <= 12) return 5;
    if (problemNum >= 13 && problemNum <= 15) return 6;
  }

  return null; // Return null for unknown cases
}; 