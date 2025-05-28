import json
import re

def extract_answer_value(choices_text, answer_letter):
    # Regular expression to find choices in the format (A) value
    pattern = r'\([' + answer_letter + r']\) *([^\(\)]+?)(?=\\qquad|$)'
    match = re.search(pattern, choices_text)
    if match:
        return match.group(1).strip()
    return None

def process_question(question):
    description = question['description']
    ground_truth = question['ground_truth']
    
    # Find where the textbf starts (this indicates the beginning of choices)
    textbf_start = description.find('$\\textbf{')
    if textbf_start == -1:
        return question  # No choices found, return original question
    
    # Get the main question text (everything before the textbf)
    main_question = description[:textbf_start].strip()
    
    # Extract choices part
    choices_part = description[textbf_start:]
    
    # Find the actual answer value based on the ground truth letter
    choices_text = choices_part.replace('$\\textbf{', '')
    answer_value = extract_answer_value(choices_text, ground_truth)
    
    # Create new question object with modified content
    new_question = question.copy()
    new_question['description'] = main_question
    if answer_value:
        new_question['ground_truth'] = answer_value
    
    # Remove the "If you cannot determine..." part from ground_truth if it exists
    if isinstance(new_question['ground_truth'], str):
        if "If you cannot determine" in new_question['ground_truth']:
            new_question['ground_truth'] = new_question['ground_truth'].split("If you cannot determine")[0].strip()
    
    # Remove any trailing instructions
    if isinstance(new_question['description'], str):
        if "If you cannot determine" in new_question['description']:
            new_question['description'] = new_question['description'].split("If you cannot determine")[0].strip()
    
    return new_question

def main():
    # Read the original JSON file
    with open('src/livebench_math_question_dict_standardized.json', 'r') as f:
        data = json.load(f)
    
    # Process each question
    processed_data = {
        question_id: process_question(question_data)
        for question_id, question_data in data.items()
    }
    
    # Save to new JSON file
    with open('src/livebench_math_question_dict_no_choices.json', 'w') as f:
        json.dump(processed_data, f, indent=2)

if __name__ == "__main__":
    main()