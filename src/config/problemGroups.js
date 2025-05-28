export const problemGroups = {
  'leetcode': {
    id: 'leetcode',
    title: 'LeetCode Problems',
    description: 'Interview style coding problems sourced from Leetcode.',
    problems: Object.keys(require('../leetcode_problem_dict_standardized.json')),
    color: '#2196F3'
  },
  'leetcode-v2': {
    id: 'leetcode-v2',
    title: 'LeetCode Problems V2',
    description: 'Interview style coding problems sourced from Leetcode.',
    problems: Object.keys(require('../leetcode_problem_dict_v2_v5.json')),
    color: '#2196F3'
  },
  'codeforces': {
    id: 'codeforces',
    title: 'CodeForces Problems',
    description: 'Practice with CodeForces competitive programming problems',
    problems: [], // Empty for now
    color: '#E91E63'
  },
  'usaco': {
    id: 'usaco',
    title: 'USACO Problems',
    description: 'Practice with USACO competitive programming problems from Bronze to Platinum level.',
    problems: Object.keys(require('../usaco_subset307_dict_standardized.json')),
    color: '#4CAF50'
  },
  'math': {
    id: 'math',
    title: 'Math Problems',
    description: 'Practice mathematical problem solving and algorithms.',
    problems: Object.keys(require('../livebench_math_question_dict_standardized.json')),
    color: '#9C27B0'
    // https://huggingface.co/datasets/livebench/math Use this?
  },
  'math-v2': {
    id: 'math-v2',
    title: 'Math Problems V2',
    description: 'Practice mathematical problem solving and algorithms.',
    problems: Object.keys(require('../livebench_math_question_dict_standardized_expanded.json')),
    color: '#9C27B0'
  },
  'learning': {
    id: 'learning',
    title: 'Learning Problems',
    description: 'Practice learning problems',
    problems: Object.keys(require('../learning_problems_standardized_fixed.json')),
    color: '#9C27B0'
  }
}; 