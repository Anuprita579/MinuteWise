import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { File, Paths } from 'expo-file-system';

export default function useRecorder() {
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const recordingRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    checkPermissions();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function checkPermissions() {
    const { status } = await Audio.getPermissionsAsync();
    setPermissionStatus(status);
  }

  async function requestPermissions() {
    const { status } = await Audio.requestPermissionsAsync();
    setPermissionStatus(status);
    return status === 'granted';
  }

  async function startRecording() {
    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create recording optimized for Whisper (16kHz, mono, PCM)
      const { recording } = await Audio.Recording.createAsync(
        {
          android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.DEFAULT,
            audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
            sampleRate: 16000,  // ✅ 16kHz (Whisper's native rate)
            numberOfChannels: 1, // ✅ Mono
            bitRate: 128000,
          },
          ios: {
            extension: '.wav',
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,  // ✅ Explicit PCM format
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 16000,  // ✅ 16kHz
            numberOfChannels: 1, // ✅ Mono
            bitRate: 128000,
            linearPCMBitDepth: 16,  // ✅ 16-bit depth
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/wav',
            bitsPerSecond: 128000,
          },
        }
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setDurationMillis(0);

      // Start duration counter
      intervalRef.current = setInterval(() => {
        setDurationMillis((prev) => prev + 1000);
      }, 1000);

      console.log('Recording started with Whisper-optimized settings (16kHz, mono, PCM)');

    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async function stopRecording() {
    try {
      if (!recordingRef.current) return null;

      // Stop duration counter
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      // Log file info for debugging using new File API
      try {
        const file = new File(uri);
        const exists = await file.exists();
        const size = exists ? await file.size : 0;
        
        console.log('Recording stopped:', {
          uri,
          size,
          exists
        });
      } catch (fileError) {
        console.warn('Could not get file info:', fileError);
      }
      
      recordingRef.current = null;
      setIsRecording(false);
      
      return uri;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }

  async function deleteFile(uri) {
    try {
      const file = new File(uri);
      const exists = await file.exists();
      
      if (exists) {
        await file.delete();
        console.log('File deleted:', uri);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  return {
    permissionStatus,
    requestPermissions,
    isRecording,
    durationMillis,
    startRecording,
    stopRecording,
    deleteFile,
  };
}