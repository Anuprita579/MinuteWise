// frontend/src/components/AudioUpload.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseHelpers } from '../services/supabaseService';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function AudioUpload() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState([
    { 
      name: user?.user_metadata?.name || user?.email?.split('@')[0] || '', 
      email: user?.email || '' 
    }
  ]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError('');
    
    if (selectedFile) {
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (selectedFile.size > maxSize) {
        setError('File size must be less than 100MB');
        return;
      }
      
      const validTypes = [
        'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 
        'audio/aac', 'audio/ogg', 'audio/webm', 'audio/mp4'
      ];
      const validExtensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.mp4'];
      
      const isValidType = validTypes.includes(selectedFile.type) || 
                         validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
      
      if (isValidType) {
        setFile(selectedFile);
      } else {
        setError('Please select a valid audio file (WAV, MP3, M4A, AAC, OGG, WebM, MP4)');
      }
    }
  };

  const addParticipant = () => {
    setParticipants([...participants, { name: '', email: '' }]);
  };

  const removeParticipant = (index) => {
    if (participants.length > 1) {
      setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  const updateParticipant = (index, field, value) => {
    const updated = [...participants];
    updated[index][field] = value;
    setParticipants(updated);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an audio file');
      return;
    }

    // Validate participants
    const validParticipants = participants.filter(p => p.name && p.email);
    if (validParticipants.length === 0) {
      setError('Please add at least one participant with name and email');
      return;
    }

    setUploading(true);
    setError('');
    setUploadProgress(10);

    try {
      console.log('Step 1: Creating meeting record and uploading audio...');
      
      // Step 1: Upload audio and create meeting
      const { data: meeting, error: createError, audioUrl } = await supabaseHelpers.createMeeting(
        title || `Meeting ${new Date().toLocaleDateString()}`,
        file
      );

      if (createError) throw createError;

      setUploadProgress(40);
      console.log('Meeting created:', meeting.id);

      // Step 2: Add participants
      console.log('Step 2: Adding participants...');
      for (let i = 0; i < validParticipants.length; i++) {
        const participant = validParticipants[i];
        
        // First participant with matching email to logged-in user should be admin
        const isCurrentUser = participant.email.toLowerCase() === user?.email?.toLowerCase();
        const role = (i === 0 || isCurrentUser) ? 'admin' : 'user';
        
        console.log(`Adding participant: ${participant.name} (${participant.email}) as ${role}`);
        
        const { error: participantError } = await supabaseHelpers.addParticipantWithRole(
          meeting.id,
          participant.name,
          participant.email,
          role,
          isCurrentUser ? user.id : null
        );
        
        if (participantError) {
          console.error('Error adding participant:', participantError);
        }
      }

      setUploadProgress(60);

      // Step 3: Trigger backend processing
      console.log('Step 3: Triggering backend processing...');
      const backendResponse = await axios.post(
        `${API_BASE_URL}/transcription/process-audio`,
        {
          meeting_id: meeting.id,
          audio_url: audioUrl
        }
      );

      setUploadProgress(80);
      console.log('Backend processing started:', backendResponse.data);

      setUploadProgress(100);

      // Navigate to meeting details view (not transcript view)
      setTimeout(() => {
        navigate(`/meeting/${meeting.id}`);
      }, 500);

    } catch (error) {
      console.error('Upload failed:', error);
      
      if (error.response) {
        const errorMsg = error.response.data?.detail || error.response.statusText || 'Server error';
        setError(`Upload failed: ${errorMsg}`);
      } else if (error.request) {
        setError('Network error: Cannot reach server. Please check your connection.');
      } else {
        setError(`Upload failed: ${error.message}`);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload Audio File</h1>
        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:underline"
        >
          ← Back to Home
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter meeting title..."
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              disabled={uploading}
            />
          </div>

          {/* Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Participants
            </label>
            <p className="text-xs text-gray-500 mb-3">
              💡 Tip: The first participant will be set as admin automatically
            </p>
            <div className="space-y-3">
              {participants.map((participant, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={participant.name}
                    onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                    placeholder="Name"
                    className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={uploading}
                  />
                  <input
                    type="email"
                    value={participant.email}
                    onChange={(e) => updateParticipant(index, 'email', e.target.value)}
                    placeholder="Email"
                    className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={uploading}
                  />
                  {participants.length > 1 && (
                    <button
                      onClick={() => removeParticipant(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                      disabled={uploading}
                    >
                      ✕
                    </button>
                  )}
                  {index === 0 && (
                    <span className="px-3 py-2 bg-indigo-100 text-indigo-700 text-xs rounded-md flex items-center">
                      Admin
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addParticipant}
              className="mt-2 text-sm text-blue-600 hover:underline"
              disabled={uploading}
            >
              + Add Another Participant
            </button>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                    <span>Upload an audio file</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.mp4"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">
                  Audio files up to 100MB
                </p>
              </div>
            </div>
            {file && (
              <div className="mt-2 text-sm text-gray-600">
                Selected: {file.name} ({Math.round(file.size / 1024 / 1024 * 100) / 100} MB)
              </div>
            )}
            {uploading && uploadProgress > 0 && (
              <div className="mt-2">
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {uploadProgress < 40 && 'Uploading audio...'}
                  {uploadProgress >= 40 && uploadProgress < 60 && 'Adding participants...'}
                  {uploadProgress >= 60 && uploadProgress < 80 && 'Starting processing...'}
                  {uploadProgress >= 80 && 'Almost done...'}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Processing...' : 'Upload & Transcribe'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Audio file will be transcribed using Whisper AI</li>
          <li>• Meeting summary will be generated</li>
          <li>• Action items will be automatically extracted and assigned</li>
          <li>• Email notifications will be sent to assignees</li>
          <li>• You'll be able to track progress in real-time</li>
        </ul>
      </div>
    </div>
  );
}

export default AudioUpload;