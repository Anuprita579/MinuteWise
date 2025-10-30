from app.config.supabase_client import supabase

def calculate_wer_sample():
    """
    For WER, you need to manually transcribe a few audio files
    """
    from jiwer import wer, cer
    
    # Step 1: Select 10 random meetings
    meetings = supabase.table('meetings').select('*').eq('status', 'completed').limit(10).execute().data
    
    # Step 2: Download audio and manually transcribe (or use human service)
    # Save in: validation/ground_truth_transcripts.json
    
    # Step 3: Compare
    ground_truth = {
        # Add manually: 'meeting_id': 'exact transcript...'
    }
    
    results = []
    for meeting in meetings:
        if meeting['id'] in ground_truth:
            gt = ground_truth[meeting['id']]
            hyp = meeting['transcript']
            
            word_error = wer(gt, hyp)
            char_error = cer(gt, hyp)
            
            results.append({
                'meeting_id': meeting['id'],
                'wer': word_error,
                'cer': char_error
            })
    
    df = pd.DataFrame(results)
    print(f"\n=== TRANSCRIPTION ACCURACY (Sample N={len(df)}) ===")
    print(f"Mean WER: {df['wer'].mean():.2%}")
    print(f"Mean CER: {df['cer'].mean():.2%}")
    
    return df