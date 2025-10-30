from app.config.supabase_client import supabase

import random

def create_validation_set(sample_size=20):
    """
    Randomly select meetings for manual validation
    """
    response = supabase.table('meetings').select(
        '*, action_items(*)'
    ).eq('status', 'completed').execute()
    
    meetings = response.data
    
    # Random sample
    sample = random.sample(meetings, min(sample_size, len(meetings)))
    
    validation_data = []
    
    for meeting in sample:
        validation_data.append({
            'meeting_id': meeting['id'],
            'title': meeting['title'],
            'transcript_snippet': meeting['transcript'][:500] + '...',
            'extracted_actions': len(meeting.get('action_items', [])),
            'summary_length': len(meeting.get('summary', '')),
            # Fields for manual validation:
            'manual_action_count': None,  # Fill manually
            'correct_actions': None,       # Fill manually
            'summary_quality_rating': None, # 1-5 scale
            'transcript_accuracy_rating': None # 1-5 scale
        })
    
    df = pd.DataFrame(validation_data)
    df.to_csv('validation/validation_set.csv', index=False)
    
    print(f"\n✓ Created validation set with {len(df)} meetings")
    print("Please manually review and fill in the validation fields")
    
    return df

if __name__ == "__main__":
    create_validation_set(sample_size=20)