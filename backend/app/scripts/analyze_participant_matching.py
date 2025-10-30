from app.config.supabase_client import supabase

def analyze_participant_matching():
    # Get meetings with participants and action items
    response = supabase.table('meetings').select(
        '*, participants(*), action_items(*)'
    ).eq('status', 'completed').execute()
    
    meetings = response.data
    
    stats = {
        'total_action_items': 0,
        'items_with_assignee': 0,
        'items_with_email': 0,
        'valid_matches': 0,
        'unmatched': 0
    }
    
    for meeting in meetings:
        participants = {p['name'].lower(): p for p in meeting.get('participants', [])}
        action_items = meeting.get('action_items', [])
        
        for item in action_items:
            stats['total_action_items'] += 1
            
            assignee = item.get('assignee', '')
            email = item.get('assignee_email', '')
            
            if assignee:
                stats['items_with_assignee'] += 1
            
            if email:
                stats['items_with_email'] += 1
            
            # Check if assignee matches a participant
            if assignee.lower() in participants:
                stats['valid_matches'] += 1
            elif assignee and assignee.lower() != 'unassigned':
                stats['unmatched'] += 1
    
    match_rate = stats['valid_matches'] / stats['total_action_items'] * 100 \
        if stats['total_action_items'] > 0 else 0
    
    print("\n=== PARTICIPANT MATCHING ANALYSIS ===")
    print(f"Total Action Items: {stats['total_action_items']}")
    print(f"Items with Assignee: {stats['items_with_assignee']} "
          f"({stats['items_with_assignee']/stats['total_action_items']*100:.1f}%)")
    print(f"Items with Email: {stats['items_with_email']} "
          f"({stats['items_with_email']/stats['total_action_items']*100:.1f}%)")
    print(f"Valid Matches: {stats['valid_matches']} ({match_rate:.1f}%)")
    print(f"Unmatched: {stats['unmatched']}")
    
    return stats

if __name__ == "__main__":
    analyze_participant_matching()