import os
from datetime import datetime
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv
from app.scripts.measure_processing_time import analyze_processing_times
from app.scripts.analyze_action_items import analyze_action_items
from app.scripts.analyze_participant_matching import analyze_participant_matching
from app.scripts.analyze_usage import analyze_usage_statistics

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def generate_all_metrics():
    """
    Generate all metrics for the research paper
    """
    print("\n" + "="*60)
    print("MINUTEWISE - RESEARCH PAPER METRICS GENERATION")
    print("="*60)
    
    # Create results directory
    os.makedirs('results', exist_ok=True)
    
    metrics = {}
    
    # 1. Processing Time Analysis
    print("\n[1/5] Analyzing processing times...")
    processing_df = analyze_processing_times()
    metrics['processing'] = processing_df.describe().to_dict()
    
    # 2. Action Item Analysis
    print("\n[2/5] Analyzing action items...")
    action_stats = analyze_action_items()
    metrics['actions'] = action_stats
    
    # 3. Participant Matching
    print("\n[3/5] Analyzing participant matching...")
    participant_stats = analyze_participant_matching()
    metrics['participants'] = participant_stats
    
    # 4. Usage Statistics
    print("\n[4/5] Analyzing usage statistics...")
    usage_stats = analyze_usage_statistics()
    metrics['usage'] = usage_stats
    
    # 5. Export Summary
    print("\n[5/5] Generating summary report...")
    
    summary = f"""
    MINUTEWISE - METRICS SUMMARY
    Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    
    SYSTEM PERFORMANCE
    ------------------
    Total Meetings Processed: {metrics['usage']['total_meetings']}
    Success Rate: {metrics['usage']['success_rate']:.1f}%
    Mean Processing Time: {processing_df['processing_time_seconds'].mean():.2f}s
    Mean Compression Ratio: {processing_df['compression_ratio'].mean():.1%}
    
    ACTION ITEM EXTRACTION
    ----------------------
    Total Action Items: {metrics['actions']['total_action_items']}
    Avg per Meeting: {metrics['actions']['avg_actions_per_meeting']:.2f}
    Avg Confidence: {metrics['actions']['avg_confidence']:.2f}
    
    PARTICIPANT MATCHING
    --------------------
    Match Success Rate: {metrics['participants']['valid_matches']/metrics['participants']['total_action_items']*100:.1f}%
    Items with Assignee: {metrics['participants']['items_with_assignee']}
    
    USAGE STATISTICS
    ----------------
    Unique Users: {metrics['usage']['unique_users']}
    Web Uploads: {metrics['usage']['source_counts'].get('web', 0)}
    Mobile Uploads: {metrics['usage']['source_counts'].get('mobile', 0)}
    """
    
    print(summary)
    
    # Save to file
    with open('results/metrics_summary.txt', 'w') as f:
        f.write(summary)
    
    # Save detailed JSON
    import json
    with open('results/metrics_detailed.json', 'w') as f:
        json.dump(metrics, f, indent=2, default=str)
    
    print("\n✓ All metrics saved to results/ directory")
    print("\nNext steps:")
    print("1. Review validation/validation_set.csv")
    print("2. Manually validate 20 meetings")
    print("3. Run: python scripts/calculate_accuracy.py")
    
    return metrics

if __name__ == "__main__":
    metrics = generate_all_metrics()