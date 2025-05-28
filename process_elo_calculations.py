import json

def calculate_difficulty_stats():
    # Load the JSON files
    with open('src/leetcode_elos.json', 'r') as f:
        elos_data = json.load(f)
    
    with open('src/leetcode_problem_dict_standardized.json', 'r') as f:
        problems_data = json.load(f)
    
    # Create dictionaries to store elos by difficulty
    easy_elos = []
    medium_elos = []
    hard_elos = []
    
    # Match problems and collect elos by difficulty
    for title_slug, prob_info in problems_data.items():
        # Find matching problem in elos_data
        elo_info = next((prob for prob in elos_data if prob['TitleSlug'] == title_slug), None)
        if not elo_info:
            continue
            
        elo = elo_info['Rating']
        difficulty = prob_info['difficulty']
        
        if difficulty.lower() == "easy":
            easy_elos.append(elo)
        elif difficulty.lower() == "medium":
            medium_elos.append(elo)
        elif difficulty.lower() == "hard":
            hard_elos.append(elo)
    
    # Helper functions for calculations
    def calculate_mean(numbers):
        if not numbers:
            return None
        return sum(numbers) / len(numbers)
    
    def calculate_percentile_10(numbers):
        if not numbers:
            return None
        sorted_nums = sorted(numbers)
        index = (len(sorted_nums) - 1) * 0.1
        lower_idx = int(index)
        fraction = index - lower_idx
        if lower_idx + 1 >= len(sorted_nums):
            return sorted_nums[lower_idx]
        return sorted_nums[lower_idx] * (1 - fraction) + sorted_nums[lower_idx + 1] * fraction
    
    # Calculate statistics
    stats = {
        "Easy": {
            "avg": calculate_mean(easy_elos),
            "p10": calculate_percentile_10(easy_elos)
        },
        "Medium": {
            "avg": calculate_mean(medium_elos),
            "p10": calculate_percentile_10(medium_elos)
        },
        "Hard": {
            "avg": calculate_mean(hard_elos)
        }
    }
    
    return stats

# Run the analysis
stats = calculate_difficulty_stats()

# Print results
print("Easy problems:")
print(f"Average ELO: {stats['Easy']['avg']:.2f}")
print(f"10th percentile ELO: {stats['Easy']['p10']:.2f}")

print("\nMedium problems:")
print(f"Average ELO: {stats['Medium']['avg']:.2f}")
print(f"10th percentile ELO: {stats['Medium']['p10']:.2f}")

print("\nHard problems:")
print(f"Average ELO: {stats['Hard']['avg']:.2f}")