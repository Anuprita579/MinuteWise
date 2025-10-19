# backend/app/utils/audio_validator.py
"""
Utility to validate and diagnose audio file formats
Useful for debugging mobile upload issues
"""

import subprocess
import json
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class AudioValidator:
    """Validates audio files and provides detailed format information"""
    
    @staticmethod
    def validate_audio_file(file_path: str) -> Dict:
        """
        Validate an audio file and return detailed information
        
        Returns:
            dict with keys:
                - valid: bool
                - file_size: int
                - format: str
                - codec: str
                - sample_rate: int
                - channels: int
                - duration: float
                - bit_rate: int
                - whisper_compatible: bool
                - issues: list[str]
                - recommendations: list[str]
        """
        result = {
            'valid': False,
            'file_size': 0,
            'format': None,
            'codec': None,
            'sample_rate': None,
            'channels': None,
            'duration': None,
            'bit_rate': None,
            'whisper_compatible': False,
            'issues': [],
            'recommendations': []
        }
        
        try:
            # Check if file exists
            path = Path(file_path)
            if not path.exists():
                result['issues'].append(f"File does not exist: {file_path}")
                return result
            
            # Get file size
            result['file_size'] = path.stat().st_size
            
            # Check minimum size
            if result['file_size'] < 1000:
                result['issues'].append(f"File too small: {result['file_size']} bytes")
                result['recommendations'].append("Audio file may be corrupted or empty")
            
            # Use ffprobe to get detailed audio information
            info = AudioValidator._get_audio_info(file_path)
            
            if not info:
                result['issues'].append("Could not read audio file metadata")
                return result
            
            # Extract format information
            result['format'] = info.get('format', {}).get('format_name')
            result['duration'] = float(info.get('format', {}).get('duration', 0))
            result['bit_rate'] = int(info.get('format', {}).get('bit_rate', 0))
            
            # Extract stream information
            streams = info.get('streams', [])
            if not streams:
                result['issues'].append("No audio streams found")
                return result
            
            audio_stream = streams[0]
            result['codec'] = audio_stream.get('codec_name')
            result['sample_rate'] = int(audio_stream.get('sample_rate', 0))
            result['channels'] = int(audio_stream.get('channels', 0))
            
            # Validate
            result['valid'] = True
            
            # Check Whisper compatibility
            result['whisper_compatible'] = AudioValidator._check_whisper_compatibility(result)
            
            # Generate recommendations
            result['recommendations'] = AudioValidator._generate_recommendations(result)
            
            logger.info(f"Audio validation completed: {file_path}")
            logger.info(f"Format: {result['format']}, Codec: {result['codec']}, "
                       f"Sample Rate: {result['sample_rate']}Hz, Channels: {result['channels']}")
            
            return result
            
        except Exception as e:
            logger.error(f"Audio validation error: {e}")
            result['issues'].append(f"Validation error: {str(e)}")
            return result
    
    @staticmethod
    def _get_audio_info(file_path: str) -> Optional[Dict]:
        """Use ffprobe to get detailed audio information"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                logger.warning(f"ffprobe failed: {result.stderr}")
                return None
                
        except FileNotFoundError:
            logger.warning("ffprobe not found")
            return None
        except Exception as e:
            logger.error(f"Error getting audio info: {e}")
            return None
    
    @staticmethod
    def _check_whisper_compatibility(info: Dict) -> bool:
        """Check if audio format is optimal for Whisper"""
        # Whisper works best with:
        # - 16kHz sample rate (but accepts others)
        # - Mono audio (but accepts stereo)
        # - PCM format (but accepts compressed formats)
        
        issues = []
        
        # Check sample rate
        if info['sample_rate']:
            if info['sample_rate'] not in [16000, 44100, 48000]:
                issues.append(f"Unusual sample rate: {info['sample_rate']}Hz")
        
        # Check channels
        if info['channels']:
            if info['channels'] > 2:
                issues.append(f"Too many channels: {info['channels']}")
        
        # Check codec
        compatible_codecs = ['pcm_s16le', 'pcm_f32le', 'aac', 'mp3', 'opus', 'vorbis']
        if info['codec'] and info['codec'] not in compatible_codecs:
            issues.append(f"Uncommon codec: {info['codec']}")
        
        # If no major issues, it's compatible
        return len(issues) == 0
    
    @staticmethod
    def _generate_recommendations(info: Dict) -> list:
        """Generate recommendations for audio optimization"""
        recommendations = []
        
        # Sample rate recommendation
        if info['sample_rate']:
            if info['sample_rate'] != 16000:
                recommendations.append(
                    f"Convert to 16kHz for optimal Whisper performance "
                    f"(current: {info['sample_rate']}Hz)"
                )
        
        # Channels recommendation
        if info['channels'] and info['channels'] > 1:
            recommendations.append(
                f"Convert to mono for better performance "
                f"(current: {info['channels']} channels)"
            )
        
        # Codec recommendation
        if info['codec'] and info['codec'] != 'pcm_s16le':
            recommendations.append(
                f"Convert to PCM S16LE for best compatibility "
                f"(current: {info['codec']})"
            )
        
        # File size check
        if info['file_size'] > 100_000_000:  # > 100MB
            recommendations.append(
                f"Large file size ({info['file_size'] / 1_000_000:.1f}MB) "
                f"may slow down processing"
            )
        
        if not recommendations:
            recommendations.append("Audio format is optimal for Whisper!")
        
        return recommendations
    
    @staticmethod
    def print_validation_report(file_path: str):
        """Print a human-readable validation report"""
        print("\n" + "="*60)
        print(f"AUDIO VALIDATION REPORT")
        print("="*60)
        print(f"File: {file_path}")
        print("-"*60)
        
        result = AudioValidator.validate_audio_file(file_path)
        
        # Print basic info
        print(f"Valid:              {'✅ Yes' if result['valid'] else '❌ No'}")
        print(f"File Size:          {result['file_size']:,} bytes ({result['file_size']/1_000_000:.2f} MB)")
        print(f"Format:             {result['format']}")
        print(f"Codec:              {result['codec']}")
        print(f"Sample Rate:        {result['sample_rate']} Hz")
        print(f"Channels:           {result['channels']}")
        print(f"Duration:           {result['duration']:.2f} seconds" if result['duration'] else "Duration:           Unknown")
        print(f"Bit Rate:           {result['bit_rate']:,} bps" if result['bit_rate'] else "Bit Rate:           Unknown")
        print(f"Whisper Compatible: {'✅ Yes' if result['whisper_compatible'] else '⚠️  No'}")
        
        # Print issues
        if result['issues']:
            print("\n⚠️  ISSUES FOUND:")
            for issue in result['issues']:
                print(f"  • {issue}")
        
        # Print recommendations
        if result['recommendations']:
            print("\n💡 RECOMMENDATIONS:")
            for rec in result['recommendations']:
                print(f"  • {rec}")
        
        print("="*60 + "\n")
        
        return result


# Convenience function for quick validation
def validate_audio(file_path: str) -> bool:
    """Quick validation - returns True if audio is valid"""
    result = AudioValidator.validate_audio_file(file_path)
    return result['valid'] and len(result['issues']) == 0


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python audio_validator.py <audio_file>")
        sys.exit(1)
    
    AudioValidator.print_validation_report(sys.argv[1])