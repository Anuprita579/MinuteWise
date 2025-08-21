import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ActionItems from './ActionItems';

function TranscriptView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');

  useEffect(() => {
    fetchMeeting();
    const interval = setInterval(fetchMeeting, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [id]);

  const fetchMeeting = async () => {
    try {
      const response = await api.get(`/transcription/${id}`);
      setMeeting(response.data);
      setLoading(false);
    } catch (error) {
      setError('Failed to load meeting data');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading meeting data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-2 text-red-600 hover:underline"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <p className="text-sm text-gray-600">
            Created on {new Date(meeting.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:underline"
        >
          ← Back to Home
        </button>
      </div>

      {meeting.status === 'processing' && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span className="text-yellow-800">Processing audio file... Please wait.</span>
          </div>
        </div>
      )}

      {meeting.status === 'failed' && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <span className="text-red-800">Processing failed. Please try uploading again.</span>
        </div>
      )}

      {meeting.status === 'completed' && (
        <div className="bg-white rounded-lg shadow-md">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Transcript
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('actions')}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  activeTab === 'actions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Action Items ({meeting.action_items?.length || 0})
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'transcript' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Full Transcript</h3>
                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {meeting.transcript || 'No transcript available'}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'summary' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Meeting Summary</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-800">
                    {meeting.summary || 'No summary available'}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'actions' && (
              <ActionItems 
                actionItems={meeting.action_items || []} 
                meetingId={meeting._id}
                onUpdate={fetchMeeting}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TranscriptView;