from app.config.supabase_client import supabase

def analyze_action_items():
    # Get all meetings with their action items
    response = supabase.table('meetings').select(
        '*, action_items(*)'
    ).eq('status', 'completed').execute()
    
    meetings = response.data
    
    stats = {
        'total_meetings': len(meetings),
        'meetings_with_actions': 0,
        'total_action_items': 0,
        'avg_actions_per_meeting': 0,
        'priority_distribution': {'high': 0, 'medium': 0, 'low': 0},
        'category_distribution': {},
        'status_distribution': {'pending': 0, 'in_progress': 0, 'completed': 0},
        'avg_confidence': 0
    }
    
    confidences = []
    
    for meeting in meetings:
        action_items = meeting.get('action_items', [])
        if action_items:
            stats['meetings_with_actions'] += 1
        
        stats['total_action_items'] += len(action_items)
        
        for item in action_items:
            # Priority
            priority = item.get('priority', 'medium')
            stats['priority_distribution'][priority] += 1
            
            # Category
            category = item.get('category', 'General')
            stats['category_distribution'][category] = \
                stats['category_distribution'].get(category, 0) + 1
            
            # Status
            status = item.get('status', 'pending')
            stats['status_distribution'][status] += 1
            
            # Confidence
            if item.get('confidence'):
                confidences.append(item['confidence'])
    
    stats['avg_actions_per_meeting'] = \
        stats['total_action_items'] / stats['total_meetings']
    
    stats['avg_confidence'] = \
        sum(confidences) / len(confidences) if confidences else 0
    
    print("\n=== ACTION ITEM ANALYSIS ===")
    print(f"Total meetings: {stats['total_meetings']}")
    print(f"Meetings with action items: {stats['meetings_with_actions']} "
          f"({stats['meetings_with_actions']/stats['total_meetings']*100:.1f}%)")
    print(f"Total action items extracted: {stats['total_action_items']}")
    print(f"Average per meeting: {stats['avg_actions_per_meeting']:.2f}")
    print(f"\nPriority Distribution:")
    for priority, count in stats['priority_distribution'].items():
        print(f"  {priority}: {count} ({count/stats['total_action_items']*100:.1f}%)")
    print(f"\nTop Categories:")
    for category, count in sorted(stats['category_distribution'].items(), 
                                   key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {category}: {count}")
    print(f"\nAverage Confidence Score: {stats['avg_confidence']:.2f}")
    
    return stats

if __name__ == "__main__":
    analyze_action_items()