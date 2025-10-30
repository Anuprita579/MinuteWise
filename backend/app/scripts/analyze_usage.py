from app.config.supabase_client import supabase
from datetime import datetime
import pandas as pd

def analyze_usage_statistics():
    # Get all meetings
    meetings = supabase.table('meetings').select('*').execute().data
    
    # Get all users
    users = supabase.table('participants').select('user_id').execute().data
    unique_users = len(set([u['user_id'] for u in users if u.get('user_id')]))
    
    # Time analysis
    dates = [datetime.fromisoformat(m['created_at']).date() 
             for m in meetings]
    date_counts = pd.Series(dates).value_counts().sort_index()
    
    # Status breakdown
    status_counts = pd.Series([m['status'] for m in meetings]).value_counts()
    
    # Source breakdown
    source_counts = pd.Series([m.get('audio_source', 'web') 
                               for m in meetings]).value_counts()
    
    print("\n=== USAGE STATISTICS ===")
    print(f"Total Meetings: {len(meetings)}")
    print(f"Unique Users: {unique_users}")
    print(f"Date Range: {min(dates)} to {max(dates)}")
    print(f"Average Meetings per Day: {len(meetings) / len(date_counts):.2f}")
    
    print(f"\nStatus Breakdown:")
    for status, count in status_counts.items():
        print(f"  {status}: {count} ({count/len(meetings)*100:.1f}%)")
    
    print(f"\nSource Breakdown:")
    for source, count in source_counts.items():
        print(f"  {source}: {count} ({count/len(meetings)*100:.1f}%)")
    
    # Calculate success rate
    success_rate = status_counts.get('completed', 0) / len(meetings) * 100
    print(f"\nSuccess Rate: {success_rate:.1f}%")
    
    return {
        'total_meetings': len(meetings),
        'unique_users': unique_users,
        'success_rate': success_rate,
        'source_counts': source_counts.to_dict(),
        'status_counts': status_counts.to_dict()
    }