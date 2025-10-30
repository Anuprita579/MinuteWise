from app.config.supabase_client import supabase

def calculate_accuracy_from_validation():
    """
    After you manually fill the validation CSV
    """
    df = pd.read_csv('validation/validation_set_completed.csv')
    
    # Action Item Detection Accuracy
    df['action_precision'] = df['correct_actions'] / df['extracted_actions']
    df['action_recall'] = df['correct_actions'] / df['manual_action_count']
    df['action_f1'] = 2 * (df['action_precision'] * df['action_recall']) / \
                      (df['action_precision'] + df['action_recall'])
    
    print("\n=== ACCURACY METRICS (Manual Validation) ===")
    print(f"Sample Size: {len(df)}")
    print(f"\nAction Item Detection:")
    print(f"  Precision: {df['action_precision'].mean():.2%}")
    print(f"  Recall: {df['action_recall'].mean():.2%}")
    print(f"  F1-Score: {df['action_f1'].mean():.2%}")
    
    print(f"\nSummary Quality (1-5):")
    print(f"  Mean: {df['summary_quality_rating'].mean():.2f}")
    print(f"  Std Dev: {df['summary_quality_rating'].std():.2f}")
    
    print(f"\nTranscript Accuracy (1-5):")
    print(f"  Mean: {df['transcript_accuracy_rating'].mean():.2f}")
    print(f"  Std Dev: {df['transcript_accuracy_rating'].std():.2f}")
    
    return df