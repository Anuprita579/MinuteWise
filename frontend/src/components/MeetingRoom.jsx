import React, { useRef, useState, useEffect, useCallback } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

export default function MeetingRoom({ roomName, meetingId, onEnd }) {
  const { user } = useAuth();
  const apiRef = useRef(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const transcriptionTimeoutRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const streamRef = useRef(null);

  // Start recording when user joins
  useEffect(() => {
    if (hasJoined && !isRecording) {
      console.log("User has joined, starting audio capture...");
      startAudioCapture();
    }
    
    return () => {
      console.log("Cleaning up audio capture...");
      stopAudioCapture();
    };
  }, [hasJoined]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
    };
  }, []);

  // Debounced transcription function
  const debouncedTranscribe = useCallback((audioBlob) => {
    if (transcriptionTimeoutRef.current) {
      clearTimeout(transcriptionTimeoutRef.current);
    }
    
    transcriptionTimeoutRef.current = setTimeout(() => {
      transcribeAudio(audioBlob);
    }, 1000); // Reduced to 1 second for faster response
  }, []);

  const startAudioCapture = async () => {
    try {
      console.log("Starting audio capture...");
      
      // Stop any existing recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      // Get user media directly (more reliable than trying to get Jitsi streams)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });
      
      console.log("Got audio stream:", stream);
      streamRef.current = stream;

      // Check for supported MIME types
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }
      
      console.log("Using MIME type:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log("Data available:", event.data.size, "bytes");
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped, chunks:", audioChunksRef.current.length);
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mimeType || 'audio/webm' 
          });
          console.log("Created audio blob:", audioBlob.size, "bytes");
          
          if (audioBlob.size > 1000) { // Only transcribe if substantial audio
            debouncedTranscribe(audioBlob);
          }
          audioChunksRef.current = [];
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setIsRecording(false);
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every 1 second
      setIsRecording(true);
      console.log("MediaRecorder started");

      // Record in chunks and restart
      const startChunkedRecording = () => {
        recordingIntervalRef.current = setInterval(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Stopping current recording for chunk processing");
            mediaRecorderRef.current.stop();
            
            // Restart recording after a brief pause
            setTimeout(() => {
              if (streamRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
                try {
                  mediaRecorderRef.current.start(1000);
                  console.log("Restarted recording for next chunk");
                } catch (error) {
                  console.error("Error restarting recording:", error);
                }
              }
            }, 100);
          }
        }, 10000); // Process chunks every 10 seconds (reduced from 30)
      };

      startChunkedRecording();

    } catch (error) {
      console.error('Error starting audio capture:', error);
      setIsRecording(false);
      
      // Show user-friendly error message
      if (error.name === 'NotAllowedError') {
        alert('Please allow microphone access to enable live transcription');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please check your audio devices.');
      } else {
        console.error('Audio capture error:', error);
      }
    }
  };

  const stopAudioCapture = () => {
    console.log("Stopping audio capture...");
    
    // Clear timeout
    if (transcriptionTimeoutRef.current) {
      clearTimeout(transcriptionTimeoutRef.current);
      transcriptionTimeoutRef.current = null;
    }

    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
      }
      mediaRecorderRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log("Stopped audio track");
      });
      streamRef.current = null;
    }

    setIsRecording(false);
  };

  const transcribeAudio = async (audioBlob) => {
    console.log("Transcribing audio blob:", audioBlob.size, "bytes");

    if (audioBlob.size < 500) { // Skip very small audio chunks
      console.log("Audio chunk too small, skipping transcription");
      return;
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'chunk.webm');
      
      console.log("Sending transcription request...");
      const response = await api.post(`/transcription/live/${meetingId}`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 second timeout
      });
      
      console.log("Transcription API response:", response.data);
      
      if (response.data.transcript && response.data.transcript.trim()) {
        const newTranscript = {
          id: Date.now(),
          participant: user?.name || 'You',
          text: response.data.transcript.trim(),
          timestamp: new Date(),
          final: true
        };
        
        setTranscripts(prev => {
          const updated = [...prev, newTranscript];
          // Keep only last 50 transcripts
          return updated.slice(-50);
        });
        
        console.log("Added new transcript:", newTranscript.text);
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      
      // Only show user error for non-server errors
      if (error.response?.status === 403) {
        console.error('Access denied for transcription');
      } else if (error.response?.status === 404) {
        console.error('Meeting not found for transcription');
      } else if (!error.response || error.response.status >= 500) {
        console.error('Server error during transcription:', error.response?.data);
      }
    }
  };

  if (!roomName || !meetingId) {
    return <div className="p-4 text-red-500">Invalid meeting info</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Meeting Container */}
      <div className="flex-1 min-h-0">
        <JitsiMeeting
          domain="meet.jit.si"
          roomName={roomName}
          userInfo={{
            displayName: user?.name || 'Guest',
            email: user?.email,
          }}
          configOverwrite={{
            startWithVideoMuted: false,
            prejoinPageEnabled: true,
            prejoinConfig: {
              hideExtraJoinButtons: ['login']
            }
          }}
          interfaceConfigOverwrite={{
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'closedcaptions',
              'desktop',
              'fullscreen',
              'invite',
              'fodeviceselection',
              'hangup',
              'chat',
              'settings',
              'raisehand',
            ],
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = '100%';
            iframeRef.style.width = '100%';
          }}
          onApiReady={(externalApi) => {
            console.log("Jitsi API ready");
            apiRef.current = externalApi;

            externalApi.addListener('participantJoined', async (participant) => {
              console.log("CONSOLE: Participant joined:", participant);
              
              if (participant.id === 'local') {
                console.log("Local participant joined - setting hasJoined to true");
                setHasJoined(true);
              }

              try {
                await api.post(`/meetings/${meetingId}/participants`, {
                  type: 'joined',
                  participantId: participant.id,
                  displayName: participant.displayName || 'Anonymous',
                });
                console.log("Synced participant join to server");
              } catch (e) {
                console.error('Failed to sync participant join', e);
              }
            });

            externalApi.addListener('participantLeft', async (participant) => {
              console.log("Participant left:", participant);
              
              try {
                await api.post(`/meetings/${meetingId}/participants`, {
                  type: 'left',
                  participantId: participant.id,
                });
                console.log("Synced participant leave to server");
              } catch (e) {
                console.error('Failed to sync participant leave', e);
              }
            });

            externalApi.addListener('videoConferenceJoined', async () => {
              console.log("CONSOLE: Video conference joined");
              setHasJoined(true);
            });

            externalApi.addListener('videoConferenceLeft', async () => {
              console.log("Video conference left");
              
              if (!hasJoined) return;

              stopAudioCapture();

              try {
                await api.post(`/meetings/${meetingId}/end`);
                console.log("Meeting ended on server");
              } catch (e) {
                console.error('Failed to end meeting', e);
              } finally {
                onEnd?.();
              }
            });
          }}
        />
      </div>

      {/* Live Transcript Panel */}
      <div className="h-64 bg-white border-t border-gray-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">Live Transcript</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span className="text-xs text-gray-500">
              {isRecording ? 'Recording' : hasJoined ? 'Not Recording' : 'Waiting to Join'}
            </span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {transcripts.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {!hasJoined 
                ? 'Join the meeting to start transcription' 
                : isRecording 
                  ? 'Listening for speech...' 
                  : 'Starting transcription...'
              }
            </p>
          ) : (
            transcripts.map((transcript) => (
              <div key={transcript.id} className={`text-sm ${transcript.final ? '' : 'opacity-60'}`}>
                <span className="font-medium text-blue-600">
                  {transcript.participant}:
                </span>
                <span className="ml-2 text-gray-800">{transcript.text}</span>
                <span className="ml-2 text-xs text-gray-400">
                  {transcript.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}