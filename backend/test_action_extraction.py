# test_action_extraction.py
# Run this to test action item extraction

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.action_item_service import action_item_service
import json

# Test cases
test_cases = [
    {
        "name": "Simple Meeting Assignment",
        "transcript": "Hello, so we will be starting with our meet now. Sneha, you will be doing the documentation and Ria, you will be doing the power point presentation. So yeah, that is the end of our meet. Thank you.",
        "participants": [
            {"name": "Sneha", "email": "sneha@example.com"},
            {"name": "Ria", "email": "ria@example.com"}
        ],
        "expected": [
            {"assignee": "Sneha", "task_contains": "documentation"},
            {"assignee": "Ria", "task_contains": "power point presentation"}
        ]
    },
    {
        "name": "Corporate Meeting",
        "transcript": "Team, let's go through the action items. John, you need to finalize the budget report by Friday. Sarah will be working on the client presentation. Mike, can you please review the code changes? And Lisa, you should coordinate with the design team for the mockups.",
        "participants": [
            {"name": "John", "email": "john@company.com"},
            {"name": "Sarah", "email": "sarah@company.com"},
            {"name": "Mike", "email": "mike@company.com"},
            {"name": "Lisa", "email": "lisa@company.com"}
        ],
        "expected": [
            {"assignee": "John", "task_contains": "budget report"},
            {"assignee": "Sarah", "task_contains": "presentation"},
            {"assignee": "Mike", "task_contains": "review"},
            {"assignee": "Lisa", "task_contains": "coordinate"}
        ]
    },
    {
        "name": "Education Meeting",
        "transcript": "Class, for tomorrow's project: Emma, you will be doing the research paper. David will create the presentation slides. Sophie, you need to prepare the bibliography. And Tom will organize the group discussion.",
        "participants": [
            {"name": "Emma", "email": "emma@school.edu"},
            {"name": "David", "email": "david@school.edu"},
            {"name": "Sophie", "email": "sophie@school.edu"},
            {"name": "Tom", "email": "tom@school.edu"}
        ],
        "expected": [
            {"assignee": "Emma", "task_contains": "research"},
            {"assignee": "David", "task_contains": "slides"},
            {"assignee": "Sophie", "task_contains": "bibliography"},
            {"assignee": "Tom", "task_contains": "discussion"}
        ]
    },
    {
        "name": "Political Campaign Meeting",
        "transcript": "Team briefing: Jennifer, you will be doing the voter outreach campaign. Marcus will handle media relations. Patricia needs to coordinate with local chapters. And Robert will manage the fundraising events.",
        "participants": [
            {"name": "Jennifer", "email": "jennifer@campaign.org"},
            {"name": "Marcus", "email": "marcus@campaign.org"},
            {"name": "Patricia", "email": "patricia@campaign.org"},
            {"name": "Robert", "email": "robert@campaign.org"}
        ],
        "expected": [
            {"assignee": "Jennifer", "task_contains": "outreach"},
            {"assignee": "Marcus", "task_contains": "media"},
            {"assignee": "Patricia", "task_contains": "coordinate"},
            {"assignee": "Robert", "task_contains": "fundraising"}
        ]
    },
    {
        "name": "Healthcare Meeting",
        "transcript": "Morning rounds: Dr. Smith, you will be doing the patient evaluations. Nurse Johnson will update the medical records. Dr. Lee needs to review the lab results. And Dr. Patel will coordinate with the pharmacy.",
        "participants": [
            {"name": "Dr. Smith", "email": "smith@hospital.com"},
            {"name": "Nurse Johnson", "email": "johnson@hospital.com"},
            {"name": "Dr. Lee", "email": "lee@hospital.com"},
            {"name": "Dr. Patel", "email": "patel@hospital.com"}
        ],
        "expected": [
            {"assignee": "Dr. Smith", "task_contains": "evaluations"},
            {"assignee": "Nurse Johnson", "task_contains": "records"},
            {"assignee": "Dr. Lee", "task_contains": "lab results"},
            {"assignee": "Dr. Patel", "task_contains": "pharmacy"}
        ]
    }
]

def run_tests():
    print("=" * 80)
    print("ACTION ITEM EXTRACTION TEST SUITE")
    print("=" * 80)
    print()
    
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest {i}: {test_case['name']}")
        print("-" * 80)
        print(f"Transcript: {test_case['transcript'][:100]}...")
        print(f"Participants: {', '.join([p['name'] for p in test_case['participants']])}")
        print()
        
        # Extract action items
        action_items = action_item_service.extract_action_items_with_participants(
            test_case['transcript'],
            test_case['participants']
        )
        
        print(f"Extracted {len(action_items)} action items:")
        for item in action_items:
            print(f"  • {item['assignee']} → {item['text']} "
                  f"[{item['priority']}] [{item['category']}] "
                  f"(confidence: {item['confidence']:.2f})")
        
        # Validate results
        test_passed = True
        for expected in test_case['expected']:
            found = False
            for item in action_items:
                if (item['assignee'].lower() == expected['assignee'].lower() and 
                    expected['task_contains'].lower() in item['text'].lower()):
                    found = True
                    break
            
            if not found:
                print(f"  ❌ MISSING: {expected['assignee']} → ...{expected['task_contains']}...")
                test_passed = False
        
        total_tests += 1
        if test_passed and len(action_items) >= len(test_case['expected']):
            print(f"  ✓ Test PASSED")
            passed_tests += 1
        else:
            print(f"  ✗ Test FAILED")
            failed_tests += 1
        
        print()
    
    print("=" * 80)
    print(f"TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests} ({passed_tests/total_tests*100:.1f}%)")
    print(f"Failed: {failed_tests} ({failed_tests/total_tests*100:.1f}%)")
    print()
    
    if failed_tests == 0:
        print("🎉 ALL TESTS PASSED! Action item extraction is working correctly.")
    else:
        print("⚠️ Some tests failed. Please check the OpenAI API key and model configuration.")
    
    return failed_tests == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)