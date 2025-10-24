"""
Test suite for action item extraction using Gemini for validation
Requires: pip install google-generativeai python-dotenv
"""

import os
import json
import logging
from typing import List, Dict
from dotenv import load_dotenv
import google.generativeai as genai
from app.services.action_item_service import action_item_service

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file. Please add it to your .env file.")

genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini 2.0 Flash or Pro
model = genai.GenerativeModel('gemini-2.0-flash-exp')


class TestCase:
    def __init__(self, name: str, transcript: str, participants: List[Dict], expected: List[Dict]):
        self.name = name
        self.transcript = transcript
        self.participants = participants
        self.expected = expected


# Test cases
TEST_CASES = [
    TestCase(
        name="Simple Meeting Assignment",
        transcript="Hello, so we will be starting with our meet now. Sneha, you will be doing the documentation and Ria, you will be doing the power point presentation. So yeah, that is the end of our meet. Thank you.",
        participants=[
            {"name": "Sneha", "email": "sneha@example.com"},
            {"name": "Ria", "email": "ria@example.com"}
        ],
        expected=[
            {
                "assignee": "Sneha", 
                "task_contains": "documentation",
                "task_should_not_contain": ["ria", "power point", "presentation"]
            },
            {
                "assignee": "Ria", 
                "task_contains": "power point",
                "task_should_not_contain": ["sneha", "documentation"]
            }
        ]
    ),
    TestCase(
        name="Corporate Meeting",
        transcript="Team, let's go through the action items. John, you need to finalize the budget report by Friday. Sarah will be working on the client presentation. Mike, can you please review the code changes? And Lisa, you should coordinate with the design team for the mockups.",
        participants=[
            {"name": "John", "email": "john@company.com"},
            {"name": "Sarah", "email": "sarah@company.com"},
            {"name": "Mike", "email": "mike@company.com"},
            {"name": "Lisa", "email": "lisa@company.com"}
        ],
        expected=[
            {
                "assignee": "John", 
                "task_contains": "budget",
                "task_should_not_contain": ["sarah", "presentation"]
            },
            {
                "assignee": "Sarah", 
                "task_contains": "presentation",
                "task_should_not_contain": ["john", "mike"]
            },
            {
                "assignee": "Mike", 
                "task_contains": "review",
                "task_should_not_contain": ["lisa", "design"]
            },
            {
                "assignee": "Lisa", 
                "task_contains": "coordinate",
                "task_should_not_contain": ["mike", "code"]
            }
        ]
    ),
    TestCase(
        name="Complex Assignment",
        transcript="Alright team. Alice, you will handle the frontend and Bob, you will handle the backend. Charlie needs to do the testing and Diana will do the deployment.",
        participants=[
            {"name": "Alice", "email": "alice@dev.com"},
            {"name": "Bob", "email": "bob@dev.com"},
            {"name": "Charlie", "email": "charlie@dev.com"},
            {"name": "Diana", "email": "diana@dev.com"}
        ],
        expected=[
            {
                "assignee": "Alice", 
                "task_contains": "frontend",
                "task_should_not_contain": ["bob", "backend", "testing", "deployment"]
            },
            {
                "assignee": "Bob", 
                "task_contains": "backend",
                "task_should_not_contain": ["alice", "frontend", "charlie"]
            },
            {
                "assignee": "Charlie", 
                "task_contains": "testing",
                "task_should_not_contain": ["diana", "deployment"]
            },
            {
                "assignee": "Diana", 
                "task_contains": "deployment",
                "task_should_not_contain": ["charlie", "testing"]
            }
        ]
    )
]


def validate_extraction_basic(action_items: List[Dict], expected: List[Dict]) -> Dict:
    """Basic validation without Gemini"""
    results = {
        'passed': True,
        'issues': [],
        'details': []
    }
    
    # Check if we got the expected number of items
    if len(action_items) != len(expected):
        results['passed'] = False
        results['issues'].append(f"Expected {len(expected)} items, got {len(action_items)}")
    
    # Match each expected item
    for exp in expected:
        matching_items = [item for item in action_items if item['assignee'] == exp['assignee']]
        
        if not matching_items:
            results['passed'] = False
            results['issues'].append(f"No action item found for {exp['assignee']}")
            continue
        
        # Check the first matching item
        item = matching_items[0]
        task_lower = item['text'].lower()
        
        # Check required content
        if exp['task_contains'].lower() not in task_lower:
            results['passed'] = False
            results['issues'].append(
                f"{exp['assignee']}: Task should contain '{exp['task_contains']}' but got '{item['text']}'"
            )
        
        # Check excluded content
        for excluded in exp.get('task_should_not_contain', []):
            if excluded.lower() in task_lower:
                results['passed'] = False
                results['issues'].append(
                    f"{exp['assignee']}: Task should NOT contain '{excluded}' but got '{item['text']}'"
                )
        
        results['details'].append({
            'assignee': exp['assignee'],
            'expected_contains': exp['task_contains'],
            'actual_task': item['text'],
            'status': 'PASS' if not any(exp['assignee'] in issue for issue in results['issues']) else 'FAIL'
        })
    
    return results


def validate_with_gemini(test_case: TestCase, action_items: List[Dict]) -> Dict:
    """Use Gemini to validate if extraction is semantically correct"""
    
    prompt = f"""You are validating an action item extraction system. Analyze if the extracted action items correctly match the expected assignments from a meeting transcript.

**Meeting Transcript:**
{test_case.transcript}

**Extracted Action Items:**
{json.dumps([{'assignee': item['assignee'], 'task': item['text']} for item in action_items], indent=2)}

**Expected Assignments:**
{json.dumps(test_case.expected, indent=2)}

**Validation Criteria:**
1. Each assignee should have an action item extracted
2. The extracted task should semantically match what was said in the transcript
3. Tasks should not contain information about other people's assignments
4. Tasks should be clean and focused on what that specific person needs to do

**Your Task:**
Analyze each extracted action item and determine:
1. Is the assignee correct?
2. Does the task text accurately capture what was assigned to them?
3. Does the task accidentally include other people's tasks? (This is a critical error)
4. Is the task text clean and well-formatted?

Respond in JSON format:
{{
    "overall_pass": true/false,
    "items": [
        {{
            "assignee": "Name",
            "status": "PASS" or "FAIL",
            "issues": ["list of issues if any"],
            "score": 0-100 (quality score)
        }}
    ],
    "summary": "Brief overall assessment"
}}
"""
    
    try:
        response = model.generate_content(prompt)
        result_text = response.text
        
        # Extract JSON from response (handle markdown code blocks)
        if '```json' in result_text:
            result_text = result_text.split('```json')[1].split('```')[0].strip()
        elif '```' in result_text:
            result_text = result_text.split('```')[1].split('```')[0].strip()
        
        validation_result = json.loads(result_text)
        return validation_result
    
    except Exception as e:
        logger.error(f"Gemini validation error: {e}")
        return {
            "overall_pass": False,
            "items": [],
            "summary": f"Gemini validation failed: {str(e)}"
        }


def run_test(test_case: TestCase) -> Dict:
    """Run a single test case"""
    logger.info(f"\n{'='*80}")
    logger.info(f"Running Test: {test_case.name}")
    logger.info(f"{'='*80}")
    
    # Extract action items
    action_items = action_item_service.extract_action_items_with_participants(
        test_case.transcript,
        test_case.participants
    )
    
    logger.info(f"\nExtracted {len(action_items)} action items:")
    for item in action_items:
        logger.info(f"  - {item['assignee']}: {item['text']}")
    
    # Basic validation
    basic_result = validate_extraction_basic(action_items, test_case.expected)
    
    logger.info(f"\nBasic Validation: {'PASS' if basic_result['passed'] else 'FAIL'}")
    if basic_result['issues']:
        for issue in basic_result['issues']:
            logger.error(f"  ❌ {issue}")
    
    # Gemini validation
    logger.info("\nRunning Gemini validation...")
    gemini_result = validate_with_gemini(test_case, action_items)
    
    logger.info(f"Gemini Assessment: {'PASS' if gemini_result.get('overall_pass', False) else 'FAIL'}")
    logger.info(f"Summary: {gemini_result.get('summary', 'N/A')}")
    
    if gemini_result.get('items'):
        logger.info("\nPer-item Gemini scores:")
        for item_result in gemini_result['items']:
            status_icon = "✅" if item_result['status'] == 'PASS' else "❌"
            logger.info(f"  {status_icon} {item_result['assignee']}: {item_result.get('score', 0)}/100")
            if item_result.get('issues'):
                for issue in item_result['issues']:
                    logger.info(f"      - {issue}")
    
    return {
        'test_name': test_case.name,
        'basic_validation': basic_result,
        'gemini_validation': gemini_result,
        'extracted_items': action_items,
        'overall_pass': basic_result['passed'] and gemini_result.get('overall_pass', False)
    }


def run_all_tests():
    """Run all test cases"""
    logger.info("="*80)
    logger.info("ACTION ITEM EXTRACTION TEST SUITE")
    logger.info("="*80)
    
    results = []
    
    for test_case in TEST_CASES:
        result = run_test(test_case)
        results.append(result)
    
    # Summary
    logger.info("\n" + "="*80)
    logger.info("TEST SUMMARY")
    logger.info("="*80)
    
    passed = sum(1 for r in results if r['overall_pass'])
    total = len(results)
    
    logger.info(f"\nResults: {passed}/{total} tests passed")
    
    for result in results:
        status_icon = "✅" if result['overall_pass'] else "❌"
        logger.info(f"{status_icon} {result['test_name']}")
    
    # Detailed report
    logger.info("\n" + "="*80)
    logger.info("DETAILED REPORT")
    logger.info("="*80)
    
    for result in results:
        logger.info(f"\n{result['test_name']}:")
        logger.info(f"  Status: {'PASS' if result['overall_pass'] else 'FAIL'}")
        logger.info(f"  Extracted Items: {len(result['extracted_items'])}")
        
        if result['basic_validation']['issues']:
            logger.info("  Basic Issues:")
            for issue in result['basic_validation']['issues']:
                logger.info(f"    - {issue}")
        
        if result['gemini_validation'].get('summary'):
            logger.info(f"  Gemini: {result['gemini_validation']['summary']}")
    
    return results


if __name__ == "__main__":
    # Check for API key
    if not GEMINI_API_KEY:
        logger.error("ERROR: GEMINI_API_KEY environment variable not set")
        logger.error("Please set it using: export GEMINI_API_KEY='your-api-key'")
        exit(1)
    
    # Run tests
    results = run_all_tests()
    
    # Exit with appropriate code
    all_passed = all(r['overall_pass'] for r in results)
    exit(0 if all_passed else 1)