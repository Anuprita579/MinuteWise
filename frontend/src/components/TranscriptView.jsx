// frontend/src/components/TranscriptView.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseHelpers } from '../services/supabaseService';
import ActionItems from './ActionItems';
import { Loader2 } from 'lucide-react';

function TranscriptView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [processingStatus, setProcessingStatus] = useState('pending');

  useEffect(() => {
    fetchMeeting();
    
    // Set up real-time subscription for meeting updates
    const meetingSubscription = supabaseHelpers.subscribeMeetingUpdates(
      id,
      (payload) => {
        console.log('Real-time meeting update:', payload);
        if (payload.new) {
          setMeeting(prev => ({ ...prev, ...payload.new }));
          setProcessingStatus(payload.new.status);
          
          // If completed, redirect to meeting details
          if (payload.new.status === 'completed') {
            setTimeout(() => {
              navigate(`/meeting/${id}`);
            }, 1000);
          }
        }
      }
    );

    // Set up real-time subscription for action items
    const actionItemsSubscription = supabaseHelpers.subscribeActionItemUpdates(
      id,
      (payload) => {
        console.log('Real-time action items update:', payload);
        fetchMeeting(); // Refetch to get updated action items
      }
    );

    // Poll for status updates as backup
    const pollInterval = setInterval(() => {
      if (processingStatus !== 'completed' && processingStatus !== 'failed') {
        fetchMeeting();
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup subscriptions and interval
    return () => {
      supabaseHelpers.unsubscribe(meetingSubscription);
      supabaseHelpers.unsubscribe(actionItemsSubscription);
      clearInterval(pollInterval);
    };
  }, [id, processingStatus, navigate]);

  const fetchMeeting = async () => {
    try {
      const { data, error } = await supabaseHelpers.getMeeting(id);
      
      if (error) throw error;
      
      if (!data) {
        setError('Meeting not found');
        setLoading(false);
        return;
      }

      setMeeting(data);
      setProcessingStatus(data.status);
      setLoading(false);
      
      // Auto-redirect if already completed
      if (data.status === 'completed' && loading) {
        setTimeout(() => {
          navigate(`/meeting/${id}`);
        }, 1000);
      }
    } catch (error) {
      console.error('Error fetching meeting:', error);
      setError('Failed to load meeting data');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading meeting data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Meeting not found'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-2 text-red-600 hover:underline"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <p className="text-sm text-gray-600">
            Created on {new Date(meeting.created_at).toLocaleDateString()}
          </p>
          {meeting.participants && meeting.participants.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {meeting.participants.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </button>
      </div>

      {meeting.status === 'pending' && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 mr-2" />
            <span className="text-blue-800">Waiting to start processing...</span>
          </div>
        </div>
      )}

      {meeting.status === 'processing' && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-yellow-600 mr-2" />
            <span className="text-yellow-800">
              Processing audio file... This may take a few minutes.
            </span>
          </div>
          <div className="mt-2 text-xs text-yellow-700">
            <p>• Transcribing audio...</p>
            <p>• Generating summary...</p>
            <p>• Extracting action items...</p>
          </div>
        </div>
      )}

      {meeting.status === 'failed' && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <span className="text-red-800">
            Processing failed: {meeting.error || 'Unknown error'}
          </span>
        </div>
      )}

      {meeting.status === 'completed' && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-green-800 font-medium">
              Processing completed successfully!
            </span>
            <button
              onClick={() => navigate(`/meeting/${id}`)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              View Full Details →
            </button>
          </div>
        </div>
      )}

      {meeting.status === 'completed' && (
        <div className="bg-white rounded-lg shadow-md">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Transcript
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('actions')}
                className={`py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === 'actions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {meeting.summary || 'No summary available'}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'actions' && (
              <ActionItems 
                actionItems={meeting.action_items || []} 
                meetingId={meeting.id}
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