import { useState, useCallback } from 'react';
import { api } from '../services/api';

export const useTranscription = () => {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);

  // Upload audio file and start transcription
  const uploadAudio = useCallback(async (audioFile, options = {}) => {
    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('audio', audioFile);
      
      // Optional metadata
      if (options.title) {
        formData.append('title', options.title);
      }
      
      if (options.participants) {
        formData.append('participants', JSON.stringify(options.participants));
      }

      const response = await api.post('/meetings/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setProcessing(true);
      return {
        success: true,
        meetingId: response.data.meeting_id,
        message: response.data.message
      };

    } catch (error) {
      console.error('Upload failed:', error);
      const message = error.response?.data?.detail || 'Upload failed';
      setError(message);
      return {
        success: false,
        error: message
      };
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, []);

  // Get meeting details (includes transcription status)
  const getMeeting = useCallback(async (meetingId) => {
    try {
      const response = await api.get(`/meetings/${meetingId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to fetch meeting:', error);
      const message = error.response?.data?.detail || 'Failed to fetch meeting';
      return {
        success: false,
        error: message
      };
    }
  }, []);

  // Poll meeting status until processing is complete
  const pollMeetingStatus = useCallback(async (meetingId, onStatusUpdate, maxAttempts = 60) => {
    let attempts = 0;
    const pollInterval = 5000; // 5 seconds

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setProcessing(false);
        setError('Processing timeout - please check back later');
        return;
      }

      try {
        const result = await getMeeting(meetingId);
        
        if (result.success) {
          const meeting = result.data;
          
          // Notify caller of status update
          if (onStatusUpdate) {
            onStatusUpdate(meeting);
          }

          // Check if processing is complete
          if (meeting.status === 'completed') {
            setProcessing(false);
            return meeting;
          } else if (meeting.status === 'failed') {
            setProcessing(false);
            setError('Transcription processing failed');
            return null;
          }
        }

        attempts++;
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error('Polling error:', error);
        attempts++;
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    poll();
  }, [getMeeting]);

  // Get all meetings for current user
  const getUserMeetings = useCallback(async () => {
    try {
      const response = await api.get('/meetings');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
      const message = error.response?.data?.detail || 'Failed to fetch meetings';
      return {
        success: false,
        error: message
      };
    }
  }, []);

  // Update action item
  const updateActionItem = useCallback(async (meetingId, itemIndex, updates) => {
    try {
      const response = await api.put(`/meetings/${meetingId}/action-items/${itemIndex}`, updates);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to update action item:', error);
      const message = error.response?.data?.detail || 'Failed to update action item';
      return {
        success: false,
        error: message
      };
    }
  }, []);

  // Delete meeting
  const deleteMeeting = useCallback(async (meetingId) => {
    try {
      await api.delete(`/meetings/${meetingId}`);
      return {
        success: true
      };
    } catch (error) {
      console.error('Failed to delete meeting:', error);
      const message = error.response?.data?.detail || 'Failed to delete meeting';
      return {
        success: false,
        error: message
      };
    }
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset all states
  const reset = useCallback(() => {
    setUploading(false);
    setProcessing(false);
    setUploadProgress(0);
    setError(null);
  }, []);

  return {
    // State
    uploading,
    processing,
    uploadProgress,
    error,

    // Actions
    uploadAudio,
    getMeeting,
    pollMeetingStatus,
    getUserMeetings,
    updateActionItem,
    deleteMeeting,
    clearError,
    reset
  };
};