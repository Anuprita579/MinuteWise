import whisper
import soundfile as sf
import numpy as np
import logging
from pathlib import Path
import tempfile
import subprocess
import os
from pydub import AudioSegment
import wave
import shutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self, model_name="base"):
        logger.info(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)
        self.model_name = model_name
        
        # Check if FFmpeg is available
        self.ffmpeg_available = self._check_ffmpeg()
        if not self.ffmpeg_available:
            logger.warning("FFmpeg not found. Audio conversion will be limited.")

    def _check_ffmpeg(self) -> bool:
        """Check if FFmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'], 
                         capture_output=True, 
                         check=True,
                         timeout=5)
            logger.info("FFmpeg is available")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _normalize_path(self, file_path: str) -> str:
        """
        Normalize file path for Windows compatibility.
        Converts relative paths to absolute paths.
        """
        path = Path(file_path)
        
        # Convert to absolute path
        if not path.is_absolute():
            path = path.resolve()
        
        # Ensure the path exists
        if not path.exists():
            raise FileNotFoundError(f"File does not exist: {path}")
        
        # Return as string with forward slashes (works better with Whisper)
        return str(path).replace('\\', '/')

    def _convert_to_valid_wav(self, input_path: str) -> str:
        """
        Convert any audio format to a valid WAV file that Whisper can process.
        """
        try:
            # Normalize input path
            input_path = self._normalize_path(input_path)
            
            # Create temp file in the same directory as input (avoid path issues)
            input_dir = Path(input_path).parent
            temp_path = input_dir / f"converted_{Path(input_path).name}"
            temp_path_str = str(temp_path)
            
            logger.info(f"Converting audio file: {input_path} -> {temp_path_str}")
            
            # Method 1: Try with pydub first
            try:
                logger.info("Attempting conversion with pydub...")
                audio = AudioSegment.from_file(input_path)
                
                # Convert to mono
                if audio.channels > 1:
                    audio = audio.set_channels(1)
                    logger.info("Converted to mono")
                
                # Set to 16kHz sample rate
                if audio.frame_rate != 16000:
                    audio = audio.set_frame_rate(16000)
                    logger.info(f"Resampled from {audio.frame_rate}Hz to 16000Hz")
                
                # Export as proper WAV file
                audio.export(
                    temp_path_str,
                    format="wav",
                    parameters=["-acodec", "pcm_s16le"]
                )
                
                logger.info(f"Audio converted successfully with pydub: {temp_path_str}")
                return temp_path_str
                
            except Exception as pydub_error:
                logger.warning(f"Pydub conversion failed: {pydub_error}")
                
                # Method 2: Try FFmpeg if available
                if self.ffmpeg_available:
                    logger.info("Attempting conversion with FFmpeg...")
                    return self._convert_with_ffmpeg(input_path, temp_path_str)
                else:
                    raise RuntimeError("Neither pydub nor FFmpeg could convert the audio file. "
                                     "Please install FFmpeg: https://ffmpeg.org/download.html")
                
        except Exception as e:
            logger.error(f"Audio conversion failed: {e}")
            raise RuntimeError(f"Audio conversion failed: {e}")

    def _convert_with_ffmpeg(self, input_path: str, output_path: str) -> str:
        """Use FFmpeg to convert audio"""
        try:
            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-ar', '16000',
                '-ac', '1',
                '-c:a', 'pcm_s16le',
                '-f', 'wav',
                output_path
            ]
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                check=True,
                timeout=30
            )
            
            logger.info(f"Audio converted with FFmpeg: {output_path}")
            return output_path
            
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg conversion failed: {e.stderr}")
            raise RuntimeError(f"FFmpeg conversion failed: {e.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("FFmpeg conversion timed out")

    def _validate_wav_file(self, file_path: str) -> bool:
        """Validate if a file is a proper WAV file"""
        try:
            file_path = self._normalize_path(file_path)
            with wave.open(file_path, 'rb') as wav_file:
                channels = wav_file.getnchannels()
                sample_width = wav_file.getsampwidth()
                framerate = wav_file.getframerate()
                nframes = wav_file.getnframes()
                
                logger.info(f"WAV validation: channels={channels}, "
                          f"sample_width={sample_width}, framerate={framerate}, "
                          f"frames={nframes}")
                
                return nframes > 0
        except Exception as e:
            logger.warning(f"WAV validation failed: {e}")
            return False

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribe audio with automatic format conversion and path normalization
        """
        converted_path = None
        try:
            logger.info(f"Starting transcription for: {file_path}")
            
            # Normalize the path FIRST
            try:
                normalized_path = self._normalize_path(file_path)
                logger.info(f"Normalized path: {normalized_path}")
            except FileNotFoundError as e:
                logger.error(f"File not found: {e}")
                raise
            
            # Get file size
            file_size = Path(normalized_path).stat().st_size
            logger.info(f"Audio file size: {file_size} bytes")
            
            if file_size < 100:
                raise RuntimeError("Audio file too small to be valid")

            # Check if it's a valid WAV file
            is_valid_wav = self._validate_wav_file(normalized_path)
            
            if not is_valid_wav:
                logger.info("File is not a valid WAV, converting...")
                converted_path = self._convert_to_valid_wav(normalized_path)
                file_to_process = converted_path
            else:
                logger.info("File is a valid WAV")
                file_to_process = normalized_path
            
            # Double-check the file exists before transcription
            if not Path(file_to_process).exists():
                raise FileNotFoundError(f"Processed file not found: {file_to_process}")
            
            # Transcribe using Whisper
            logger.info(f"Starting Whisper transcription on: {file_to_process}")
            
            result = self.model.transcribe(
                file_to_process,
                language=None,
                fp16=False,
                beam_size=5,
                best_of=5,
                temperature=0.0,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6,
                condition_on_previous_text=True,
                initial_prompt="This is a conversation between people in a meeting or casual discussion.",
                word_timestamps=False
            )
            
            transcript = result["text"].strip()
            
            if "language" in result:
                logger.info(f"Detected language: {result['language']}")
            
            logger.info(f"Transcription completed. Length: {len(transcript)} characters")
            
            if transcript:
                logger.info(f"Transcript preview: {transcript[:100]}...")
            else:
                logger.warning("Transcript is empty!")
            
            return transcript

        except FileNotFoundError as e:
            logger.error(f"File not found error: {e}")
            raise RuntimeError(f"File not found: {str(e)}")
        except Exception as e:
            logger.error(f"Transcription error for {file_path}: {e}", exc_info=True)
            raise RuntimeError(f"Transcription failed: {str(e)}")
        
        finally:
            # Clean up converted file
            if converted_path and Path(converted_path).exists():
                try:
                    os.remove(converted_path)
                    logger.debug(f"Cleaned up converted file: {converted_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up converted file: {e}")

    def transcribe_audio_with_segments(self, file_path: str) -> dict:
        """Transcribe audio and return detailed segment information"""
        converted_path = None
        try:
            logger.info(f"Transcribing with segments: {file_path}")
            
            # Normalize path
            normalized_path = self._normalize_path(file_path)
            
            # Validate and convert if needed
            if not self._validate_wav_file(normalized_path):
                converted_path = self._convert_to_valid_wav(normalized_path)
                file_to_process = converted_path
            else:
                file_to_process = normalized_path
            
            result = self.model.transcribe(
                file_to_process,
                language=None,
                fp16=False,
                beam_size=5,
                temperature=0.0,
                word_timestamps=True,
                verbose=True
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Segment transcription error: {e}")
            raise RuntimeError(f"Segment transcription error: {e}")
        finally:
            if converted_path and Path(converted_path).exists():
                os.remove(converted_path)


# Singleton accessor
_transcription_service = None

def get_transcription_service(model_name="small"):
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService(model_name)
    return _transcription_service

def get_transcription_service_with_model(model_name="small"):
    return TranscriptionService(model_name)