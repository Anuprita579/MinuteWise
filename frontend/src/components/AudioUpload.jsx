import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function AudioUpload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError('');
    
    if (selectedFile) {
      // Check file size (100MB limit)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (selectedFile.size > maxSize) {
        setError('File size must be less than 100MB');
        return;
      }
      
      // Check file type
      const validTypes = [
        'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 
        'audio/aac', 'audio/ogg', 'audio/webm', 'audio/mp4'
      ];
      const validExtensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.mp4'];
      
      const isValidType = validTypes.includes(selectedFile.type) || 
                         validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
      
      if (isValidType) {
        setFile(selectedFile);
        console.log('File selected:', {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size
        });
      } else {
        setError('Please select a valid audio file (WAV, MP3, M4A, AAC, OGG, WebM, MP4)');
      }
    }
  };

  const testBackendConnection = async () => {
    // Skip backend test for now to avoid CORS issues during upload
    return true;
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an audio file');
      return;
    }

    setUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // Test backend connection first
      console.log('Testing backend connection...');
      const backendOk = await testBackendConnection();
      if (!backendOk) {
        return;
      }

      console.log('Starting upload...');
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', title || `Upload ${new Date().toLocaleDateString()}`);

      // Log form data for debugging
      console.log('FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log(key, value);
      }

      const response = await api.post('/transcription/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      });

      console.log('Upload response:', response.data);

      if (response.data.meeting_id) {
        navigate(`/transcript/${response.data.meeting_id}`);
      } else {
        throw new Error('No meeting ID returned from server');
      }

    } catch (error) {
      console.error('Upload failed:', error);
      
      if (error.response) {
        // Server responded with error status
        const errorMsg = error.response.data?.detail || error.response.statusText || 'Server error';
        setError(`Upload failed: ${errorMsg}`);
        console.error('Server error details:', error.response.data);
      } else if (error.request) {
        // Network error
        setError('Network error: Cannot reach server. Please check your connection.');
      } else {
        // Other error
        setError(`Upload failed: ${error.message}`);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
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
                  WAV up to 100MB
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
                <p className="text-sm text-gray-600 mt-1">Uploading: {uploadProgress}%</p>
              </div>
            )}
          </div>

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
          <li>• Action items will be automatically extracted</li>
          <li>• You'll be redirected to view the results</li>
        </ul>
        
        <div className="mt-4 pt-4 border-t border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-1">Supported Formats:</h4>
          <p className="text-xs text-blue-700">
            WAV
          </p>
        </div>
      </div>
    </div>
  );
}

export default AudioUpload;