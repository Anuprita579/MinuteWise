import whisper
import soundfile as sf
import numpy as np
import logging
from pathlib import Path
import tempfile
import subprocess
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self, model_name="base"):
        logger.info(f"Loading Whisper model: {model_name}")
        # Use a larger model for better accuracy
        # Consider: "small", "medium", "large", "large-v2", "large-v3"
        self.model = whisper.load_model(model_name)
        self.model_name = model_name

    def _preprocess_audio_ffmpeg(self, input_path: str) -> str:
        """
        Use FFmpeg to preprocess audio for better quality
        This handles format conversion, noise reduction, and normalization
        """
        try:
            # Create temporary file for processed audio
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, f"processed_{os.path.basename(input_path)}.wav")
            
            # FFmpeg command for audio preprocessing
            cmd = [
                'ffmpeg', '-y',  # -y to overwrite output file
                '-i', input_path,
                '-ar', '16000',  # Resample to 16kHz (Whisper's native sample rate)
                '-ac', '1',      # Convert to mono
                '-c:a', 'pcm_s16le',  # Use 16-bit PCM encoding
                '-af', 'highpass=f=80,lowpass=f=8000',  # Basic filtering to remove noise
                temp_path
            ]
            
            # Run FFmpeg
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.info(f"Audio preprocessed with FFmpeg: {input_path} -> {temp_path}")
            return temp_path
            
        except subprocess.CalledProcessError as e:
            logger.warning(f"FFmpeg preprocessing failed: {e}")
            logger.warning(f"FFmpeg stderr: {e.stderr}")
            return input_path  # Fallback to original file
        except FileNotFoundError:
            logger.warning("FFmpeg not found, using original audio preprocessing")
            return input_path

    def _preprocess_audio_soundfile(self, file_path: str) -> np.ndarray:
        """
        Preprocess audio using soundfile with improved quality
        """
        try:
            # Load the audio file
            data, samplerate = sf.read(file_path)
            logger.info(f"Original audio: sr={samplerate}, shape={data.shape}, dtype={data.dtype}")

            # Convert to mono if stereo
            if data.ndim > 1:
                data = np.mean(data, axis=1)
                logger.info("Converted stereo to mono")

            # Resample to 16kHz if needed (Whisper's native sample rate)
            if samplerate != 16000:
                # Simple resampling (you might want to use librosa for better quality)
                target_length = int(len(data) * 16000 / samplerate)
                data = np.interp(
                    np.linspace(0, len(data), target_length),
                    np.arange(len(data)),
                    data
                )
                logger.info(f"Resampled from {samplerate}Hz to 16000Hz")

            # Normalize audio to [-1, 1] range
            if np.max(np.abs(data)) > 0:
                data = data / np.max(np.abs(data))
                logger.info("Normalized audio amplitude")

            # Convert to float32
            audio = data.astype(np.float32)
            
            logger.info(f"Processed audio shape: {audio.shape}, dtype: {audio.dtype}")
            return audio

        except Exception as e:
            logger.error(f"Audio preprocessing error: {e}")
            raise RuntimeError(f"Audio preprocessing error: {e}")

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribe audio with improved preprocessing and settings
        """
        processed_path = None
        try:
            logger.info(f"Starting transcription for: {file_path}")
            
            # Check if file exists
            if not Path(file_path).exists():
                raise FileNotFoundError(f"Audio file not found: {file_path}")

            # Method 1: Try FFmpeg preprocessing first (better quality)
            processed_path = self._preprocess_audio_ffmpeg(file_path)
            
            # Transcribe using Whisper with optimized settings
            logger.info("Starting Whisper transcription...")
            
            result = self.model.transcribe(
                processed_path,
                language=None,  # Auto-detect language (remove "en" constraint)
                fp16=False,     # Use fp32 for better accuracy
                beam_size=5,    # Use beam search for better results
                best_of=5,      # Generate multiple candidates and pick the best
                temperature=0.0,  # Use greedy decoding for consistency
                compression_ratio_threshold=2.4,  # Filter out low-quality segments
                logprob_threshold=-1.0,  # Filter out low-confidence segments
                no_speech_threshold=0.6,  # Adjust silence detection
                condition_on_previous_text=True,  # Use context from previous segments
                initial_prompt="This is a conversation between people in a meeting or casual discussion.",  # Provide context
                word_timestamps=False  # Disable for faster processing
            )
            
            transcript = result["text"].strip()
            
            # Log detected language and confidence
            if "language" in result:
                logger.info(f"Detected language: {result['language']}")
            
            logger.info(f"Transcription completed. Length: {len(transcript)} characters")
            logger.info(f"Transcript preview: {transcript[:100]}...")
            
            return transcript

        except Exception as e:
            logger.error(f"Transcription error for {file_path}: {e}")
            
            # Fallback: Try with soundfile preprocessing
            try:
                logger.info("Trying fallback method with soundfile preprocessing...")
                audio = self._preprocess_audio_soundfile(file_path)
                
                result = self.model.transcribe(
                    audio,
                    language=None,
                    fp16=False,
                    temperature=0.0,
                    beam_size=1,  # Simpler beam search for fallback
                    best_of=1
                )
                
                transcript = result["text"].strip()
                logger.info(f"Fallback transcription completed: {len(transcript)} characters")
                return transcript
                
            except Exception as fallback_error:
                logger.error(f"Fallback transcription also failed: {fallback_error}")
                raise RuntimeError(f"Transcription failed: {e}. Fallback also failed: {fallback_error}")
        
        finally:
            # Clean up processed file if it was created by FFmpeg
            if processed_path and processed_path != file_path and Path(processed_path).exists():
                try:
                    os.remove(processed_path)
                    logger.debug(f"Cleaned up processed file: {processed_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up processed file: {e}")

    def transcribe_audio_with_segments(self, file_path: str) -> dict:
        """
        Transcribe audio and return detailed segment information
        Useful for debugging and understanding what Whisper detected
        """
        try:
            logger.info(f"Transcribing with segments: {file_path}")
            
            processed_path = self._preprocess_audio_ffmpeg(file_path)
            
            result = self.model.transcribe(
                processed_path,
                language=None,
                fp16=False,
                beam_size=5,
                temperature=0.0,
                word_timestamps=True,  # Enable word-level timestamps
                verbose=True  # Show progress
            )
            
            # Clean up
            if processed_path != file_path and Path(processed_path).exists():
                os.remove(processed_path)
            
            return result
            
        except Exception as e:
            logger.error(f"Segment transcription error: {e}")
            raise RuntimeError(f"Segment transcription error: {e}")


# Singleton accessor with configurable model
_transcription_service = None

def get_transcription_service(model_name="small"):  # Changed default to "small" for better accuracy
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService(model_name)
    return _transcription_service

# Alternative function to force reload with different model
def get_transcription_service_with_model(model_name="small"):
    return TranscriptionService(model_name)