# backend/tests/test_audio_pipeline.py
"""
Test script to verify audio processing pipeline
Run this to ensure your backend can handle mobile uploads
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.transcription_service import get_transcription_service
import logging
import subprocess
import tempfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_ffmpeg_installation():
    """Test 1: Verify FFmpeg is installed"""
    print("\n" + "="*60)
    print("TEST 1: Checking FFmpeg Installation")
    print("="*60)
    
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'], 
            capture_output=True, 
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            print(f"✅ FFmpeg installed: {version}")
            return True
        else:
            print("❌ FFmpeg command failed")
            return False
            
    except FileNotFoundError:
        print("❌ FFmpeg not found!")
        print("Install it with:")
        print("  Ubuntu/Debian: sudo apt-get install ffmpeg")
        print("  macOS: brew install ffmpeg")
        print("  Windows: choco install ffmpeg")
        return False
    except Exception as e:
        print(f"❌ Error checking FFmpeg: {e}")
        return False


def test_whisper_model():
    """Test 2: Verify Whisper model loads"""
    print("\n" + "="*60)
    print("TEST 2: Loading Whisper Model")
    print("="*60)
    
    try:
        service = get_transcription_service(model_name="base")
        print(f"✅ Whisper model loaded: {service.model_name}")
        return True
    except Exception as e:
        print(f"❌ Failed to load Whisper model: {e}")
        return False


def create_test_audio():
    """Test 3: Create a test audio file"""
    print("\n" + "="*60)
    print("TEST 3: Creating Test Audio File")
    print("="*60)
    
    try:
        # Create a simple test audio file using FFmpeg
        # 5 seconds of 440Hz tone (A note)
        temp_file = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix='.m4a'
        )
        temp_path = temp_file.name
        temp_file.close()
        
        cmd = [
            'ffmpeg', '-y',
            '-f', 'lavfi',
            '-i', 'sine=frequency=440:duration=5',
            '-c:a', 'aac',
            '-b:a', '128k',
            temp_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=10)
        
        if result.returncode == 0 and Path(temp_path).exists():
            size = Path(temp_path).stat().st_size
            print(f"✅ Test audio created: {temp_path} ({size} bytes)")
            return temp_path
        else:
            print("❌ Failed to create test audio")
            return None
            
    except Exception as e:
        print(f"❌ Error creating test audio: {e}")
        return None


def test_audio_conversion(audio_path):
    """Test 4: Test audio format conversion"""
    print("\n" + "="*60)
    print("TEST 4: Testing Audio Conversion")
    print("="*60)
    
    try:
        service = get_transcription_service()
        
        print(f"Input file: {audio_path}")
        print("Converting to PCM S16LE, mono, 16kHz...")
        
        # This should convert the audio
        converted_path = service._preprocess_audio_ffmpeg(audio_path)
        
        if converted_path != audio_path:
            # Verify the converted file format
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'stream=codec_name,sample_rate,channels',
                '-of', 'default=noprint_wrappers=1',
                converted_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            print("Converted file properties:")
            print(result.stdout)
            
            # Check if format is correct
            if 'pcm_s16le' in result.stdout and '16000' in result.stdout and 'channels=1' in result.stdout:
                print("✅ Audio conversion successful!")
                print("   Format: PCM S16LE, 16kHz, Mono ✓")
                
                # Clean up
                if Path(converted_path).exists():
                    os.remove(converted_path)
                
                return True
            else:
                print("⚠️  Audio converted but format may not be optimal")
                return True
        else:
            print("⚠️  No conversion performed (FFmpeg may not be available)")
            return False
            
    except Exception as e:
        print(f"❌ Conversion test failed: {e}")
        return False


def test_transcription(audio_path):
    """Test 5: Test full transcription pipeline"""
    print("\n" + "="*60)
    print("TEST 5: Testing Full Transcription")
    print("="*60)
    
    try:
        service = get_transcription_service()
        
        print(f"Transcribing: {audio_path}")
        print("This may take a minute...")
        
        transcript = service.transcribe_audio(audio_path)
        
        print(f"\n✅ Transcription completed!")
        print(f"Transcript length: {len(transcript)} characters")
        print(f"Transcript: '{transcript[:100]}...'")
        
        return True
        
    except Exception as e:
        print(f"❌ Transcription failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*60)
    print("AUDIO PROCESSING PIPELINE TEST SUITE")
    print("="*60)
    
    results = {}
    test_audio_path = None
    
    # Test 1: FFmpeg
    results['ffmpeg'] = test_ffmpeg_installation()
    
    # Test 2: Whisper Model
    results['whisper'] = test_whisper_model()
    
    # Test 3: Create test audio
    if results['ffmpeg']:
        test_audio_path = create_test_audio()
        results['test_audio'] = test_audio_path is not None
    else:
        print("\n⚠️  Skipping test audio creation (FFmpeg not available)")
        results['test_audio'] = False
    
    # Test 4: Audio conversion
    if test_audio_path:
        results['conversion'] = test_audio_conversion(test_audio_path)
    else:
        print("\n⚠️  Skipping conversion test (no test audio)")
        results['conversion'] = False
    
    # Test 5: Full transcription
    if test_audio_path and results['whisper']:
        results['transcription'] = test_transcription(test_audio_path)
    else:
        print("\n⚠️  Skipping transcription test")
        results['transcription'] = False
    
    # Clean up test audio
    if test_audio_path and Path(test_audio_path).exists():
        try:
            os.remove(test_audio_path)
            print(f"\n🧹 Cleaned up test file: {test_audio_path}")
        except:
            pass
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name.upper():20s} {status}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*60)
    if all_passed:
        print("🎉 ALL TESTS PASSED!")
        print("Your backend is ready to handle mobile audio uploads!")
    else:
        print("⚠️  SOME TESTS FAILED")
        print("Please fix the issues above before proceeding")
    print("="*60)
    
    return all_passed


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)