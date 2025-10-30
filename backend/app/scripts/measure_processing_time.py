from app.config.supabase_client import supabase
from datetime import datetime
import pandas as pd

def analyze_processing_times():
    # Get all completed meetings
    response = supabase.table('meetings').select('*').eq('status', 'completed').execute()
    meetings = response.data
    
    results = []
    for meeting in meetings:
        created = datetime.fromisoformat(meeting['created_at'])
        updated = datetime.fromisoformat(meeting['updated_at'])
        
        # Calculate processing time
        processing_time = (updated - created).total_seconds()
        
        # Get audio duration (you'll need to add this)
        # For now, estimate from transcript length
        transcript_words = len(meeting['transcript'].split())
        estimated_duration = transcript_words / 150 * 60  # ~150 words/min
        
        results.append({
            'meeting_id': meeting['id'],
            'processing_time_seconds': processing_time,
            'estimated_audio_duration_seconds': estimated_duration,
            'transcript_length': len(meeting['transcript']),
            'summary_length': len(meeting.get('summary', '')),
            'compression_ratio': len(meeting.get('summary', '')) / len(meeting['transcript'])
        })
    
    df = pd.DataFrame(results)
    
    print("\n=== PROCESSING TIME ANALYSIS ===")
    print(f"Total meetings analyzed: {len(df)}")
    print(f"\nProcessing Time Statistics:")
    print(f"  Mean: {df['processing_time_seconds'].mean():.2f} seconds")
    print(f"  Median: {df['processing_time_seconds'].median():.2f} seconds")
    print(f"  Min: {df['processing_time_seconds'].min():.2f} seconds")
    print(f"  Max: {df['processing_time_seconds'].max():.2f} seconds")
    
    print(f"\nCompression Ratio (Summary/Transcript):")
    print(f"  Mean: {df['compression_ratio'].mean():.2%}")
    
    # Save to CSV for paper
    df.to_csv('results/processing_time_analysis.csv', index=False)
    
    return df

if __name__ == "__main__":
    df = analyze_processing_times()
