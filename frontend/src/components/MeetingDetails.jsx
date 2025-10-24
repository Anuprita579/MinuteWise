// frontend/src/components/MeetingDetails.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase, supabaseHelpers } from '../services/supabaseService';
import { Users, Calendar, Shield, Mail, ExternalLink, Loader2, Download, PlayCircle, Edit2, X, AlertCircle } from 'lucide-react';
import AdminActionItems from './AdminActionItems';
import ActionItems from './ActionItems';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Audio Player Component
const AudioPlayer = ({ audioFilePath }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('recordings')
        .download(audioFilePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = audioFilePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('Audio downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download audio file: ' + error.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Audio Recording</h3>
      
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">
            Download the audio recording to listen
          </p>
          
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
          >
            {downloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download Audio File
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

function MeetingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);
  const [processingManually, setProcessingManually] = useState(false);

  useEffect(() => {
    fetchMeetingDetails();
    checkAdminStatus();
    
    const meetingSubscription = supabaseHelpers.subscribeMeetingUpdates(id, (payload) => {
      console.log('Real-time meeting update:', payload);
      
      if (payload.new) {
        setMeeting(prev => ({
          ...prev,
          ...payload.new
        }));
      }
      
      fetchMeetingDetails();
    });

    const pollInterval = setInterval(() => {
      fetchMeetingDetails();
    }, 5000);

    return () => {
      supabaseHelpers.unsubscribe(meetingSubscription);
      clearInterval(pollInterval);
    };
  }, [id]);

  const fetchMeetingDetails = async () => {
    try {
      const { data, error } = await supabaseHelpers.getMeeting(id);
      
      if (error) {
        console.error('Error fetching meeting:', error);
        if (error.code === 'MEETING_NOT_FOUND' || error.code === 'PGRST116') {
          setError('Meeting not found or you do not have permission to view it.');
        } else {
          setError(error.message || 'Failed to load meeting');
        }
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Meeting not found or you do not have permission to view it.');
        setLoading(false);
        return;
      }
      
      console.log('Meeting data:', data);
      setMeeting(data);
      
      const { data: partsData, error: partsError } = await supabaseHelpers.getMeetingParticipants(id);
      if (partsError) {
        console.error('Error fetching participants:', partsError);
        // Don't fail completely if participants can't be fetched
        setParticipants([]);
      } else {
        console.log('Participants data:', partsData);
        setParticipants(partsData || []);
      }
      
    } catch (error) {
      console.error('Error fetching meeting:', error);
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkAdminStatus = async () => {
    try {
      const { isAdmin: adminStatus } = await supabaseHelpers.isMeetingAdmin(id);
      console.log('Admin status:', adminStatus);
      setIsAdmin(adminStatus);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const handleStartProcessing = async () => {
    if (!meeting || !meeting.audio_url) {
      alert('No audio file found to process');
      return;
    }

    setProcessingManually(true);
    try {
      console.log('Starting manual processing for meeting:', id);
      
      const response = await axios.post(`${API_BASE_URL}/transcription/process-audio`, {
        meeting_id: id,
        audio_url: meeting.audio_url
      });

      console.log('Processing started:', response.data);
      
      setMeeting(prev => ({
        ...prev,
        status: 'processing'
      }));
      
      alert('Processing started! This may take a few minutes. The page will update automatically.');
      
      setTimeout(() => {
        fetchMeetingDetails();
      }, 2000);

    } catch (error) {
      console.error('Failed to start processing:', error);
      alert(`Failed to start processing: ${error.response?.data?.detail || error.message}`);
    } finally {
      setProcessingManually(false);
    }
  };

  const handleRoleChange = async (participantId, newRole) => {
    if (!isAdmin) {
      alert('Only admins can change roles');
      return;
    }

    try {
      const { error } = await supabaseHelpers.updateParticipantRole(participantId, newRole);
      if (error) throw error;
      
      fetchMeetingDetails();
      checkAdminStatus();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role');
    }
  };

  const handleDeleteMeeting = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this meeting? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      const { error } = await supabaseHelpers.deleteMeeting(id);
      
      if (error) throw error;
      
      alert('Meeting deleted successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting meeting:', error);
      alert(`Failed to delete meeting: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
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

  const isMobileSource = meeting.audio_source === 'mobile';
  const isPending = meeting.status === 'pending';
  const isProcessing = meeting.status === 'processing';
  const isCompleted = meeting.status === 'completed';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
              <p className="text-sm text-gray-600">
                {new Date(meeting.created_at).toLocaleString()}
              </p>
              {isMobileSource && (
                <span className="inline-block mt-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                  📱 Mobile Upload
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <span className="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
                    <Shield className="w-4 h-4" />
                    Admin
                  </span>
                  <button
                    onClick={handleDeleteMeeting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Meeting
                  </button>
                </>
              )}
              <StatusBadge status={meeting.status} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isMobileSource && isPending && (
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <PlayCircle className="w-12 h-12 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  📱 Ready to Process Mobile Recording
                </h3>
                <p className="text-gray-700 mb-4">
                  Your audio file has been uploaded successfully from mobile. Click the button below to start transcription and analysis.
                </p>
                <button
                  onClick={handleStartProcessing}
                  disabled={processingManually}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
                >
                  {processingManually ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting Processing...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-5 h-5" />
                      Start Processing Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {!isMobileSource && isPending && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-800">Waiting to start processing...</span>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <Loader2 className="w-4 h-4 animate-spin text-yellow-600 mr-2" />
              <div>
                <div className="text-yellow-800 font-medium">Processing audio file... This may take a few minutes.</div>
                <div className="text-yellow-700 text-sm mt-1">The page will automatically update when complete.</div>
              </div>
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-800 font-medium">Processing completed successfully!</span>
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

        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <TabButton
                active={activeTab === 'overview'}
                onClick={() => setActiveTab('overview')}
                label="Overview"
              />
              <TabButton
                active={activeTab === 'transcript'}
                onClick={() => setActiveTab('transcript')}
                label="Transcript"
                disabled={!isCompleted}
              />
              <TabButton
                active={activeTab === 'summary'}
                onClick={() => setActiveTab('summary')}
                label="Summary"
                disabled={!isCompleted}
              />
              <TabButton
                active={activeTab === 'actions'}
                onClick={() => setActiveTab('actions')}
                label={`Action Items (${meeting.action_items?.length || 0})`}
                disabled={!isCompleted}
              />
              <TabButton
                active={activeTab === 'participants'}
                onClick={() => setActiveTab('participants')}
                label={`Participants (${participants.length})`}
              />
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <OverviewTab meeting={meeting} participants={participants} />
            )}

            {activeTab === 'transcript' && isCompleted && (
              <TranscriptSection 
                meeting={meeting} 
                isAdmin={isAdmin} 
                onUpdate={fetchMeetingDetails}
              />
            )}

            {activeTab === 'summary' && isCompleted && (
              <SummarySection 
                meeting={meeting} 
                isAdmin={isAdmin} 
                onUpdate={fetchMeetingDetails}
              />
            )}

            {activeTab === 'actions' && isCompleted && (
              <div className="space-y-6">
                <AdminActionItems
                  actionItems={meeting.action_items || []}
                  meetingId={meeting.id}
                  participants={participants}
                  isAdmin={isAdmin}
                  onUpdate={fetchMeetingDetails}
                />
                <ActionItems
                  actionItems={meeting.action_items || []}
                  meetingId={meeting.id}
                  participants={participants}
                  isAdmin={isAdmin}
                  onUpdate={fetchMeetingDetails}
                />
              </div>
            )}

            {activeTab === 'participants' && (
              <ParticipantsTab
                participants={participants}
                isAdmin={isAdmin}
                currentUserEmail={user?.email}
                onRoleChange={handleRoleChange}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
    processing: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Processing' },
    completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' }
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

const TabButton = ({ active, onClick, label, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`py-4 px-6 border-b-2 font-medium text-sm transition ${
      active
        ? 'border-indigo-500 text-indigo-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {label}
  </button>
);

// Transcript Section Component
const TranscriptSection = ({ meeting, isAdmin, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [transcriptText, setTranscriptText] = useState(meeting.transcript || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/meeting/transcript`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.id,
          transcript: transcriptText
        })
      });

      if (!response.ok) throw new Error('Failed to update transcript');

      setSuccess('Transcript updated successfully!');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div>
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Edit Transcript</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setTranscriptText(meeting.transcript || '');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
        <textarea
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
          className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
          placeholder="Enter transcript..."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Transcript</h3>
        {isAdmin && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
        <p className="text-gray-800 whitespace-pre-wrap">
          {meeting.transcript || 'No transcript available'}
        </p>
      </div>
    </div>
  );
};

// Summary Section Component
const SummarySection = ({ meeting, isAdmin, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [summaryText, setSummaryText] = useState(meeting.summary || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/meeting/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.id,
          summary: summaryText
        })
      });

      if (!response.ok) throw new Error('Failed to update summary');

      setSuccess('Summary updated successfully!');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div>
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Edit Summary</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setSummaryText(meeting.summary || '');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
        <textarea
          value={summaryText}
          onChange={(e) => setSummaryText(e.target.value)}
          className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          placeholder="Enter summary..."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Meeting Summary</h3>
        {isAdmin && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-gray-800 whitespace-pre-wrap">
          {meeting.summary || 'No summary available'}
        </p>
      </div>
    </div>
  );
};

const OverviewTab = ({ meeting, participants }) => {
  const stats = {
    totalParticipants: participants.length,
    admins: participants.filter(p => p.role === 'admin').length,
    actionItems: meeting.action_items?.length || 0,
    pendingItems: meeting.action_items?.filter(item => item.status === 'pending').length || 0,
    completedItems: meeting.action_items?.filter(item => item.status === 'completed').length || 0
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Meeting Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBox label="Participants" value={stats.totalParticipants} />
          <StatBox label="Admins" value={stats.admins} />
          <StatBox label="Total Tasks" value={stats.actionItems} />
          <StatBox label="Pending" value={stats.pendingItems} color="text-yellow-600" />
          <StatBox label="Completed" value={stats.completedItems} color="text-green-600" />
        </div>
      </div>

      {meeting.audio_file_path && (
        <AudioPlayer audioFilePath={meeting.audio_file_path} />
      )}

      <div>
        <h3 className="text-lg font-semibold mb-4">Quick Info</h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <InfoRow label="Created" value={new Date(meeting.created_at).toLocaleString()} />
          <InfoRow label="Last Updated" value={new Date(meeting.updated_at).toLocaleString()} />
          <InfoRow label="Status" value={meeting.status} />
          <InfoRow label="Source" value={meeting.audio_source || 'web'} />
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, color = 'text-gray-900' }) => (
  <div className="bg-gray-50 rounded-lg p-4 text-center">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-sm text-gray-600 mt-1">{label}</p>
  </div>
);

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-sm text-gray-600">{label}:</span>
    <span className="text-sm font-medium text-gray-900">{value}</span>
  </div>
);

const ParticipantsTab = ({ participants, isAdmin, currentUserEmail, onRoleChange }) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Meeting Participants</h3>
        {isAdmin && (
          <span className="text-sm text-gray-600">You can manage roles as admin</span>
        )}
      </div>

      <div className="space-y-3">
        {participants.map((participant) => {
          const isCurrentUser = participant.email?.toLowerCase() === currentUserEmail?.toLowerCase();
          
          return (
            <div
              key={participant.id}
              className={`border rounded-lg p-4 flex items-center justify-between transition ${
                isCurrentUser 
                  ? 'border-indigo-300 bg-indigo-50' 
                  : 'border-gray-200 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isCurrentUser ? 'bg-indigo-200' : 'bg-indigo-100'
                }`}>
                  <Users className={`w-5 h-5 ${isCurrentUser ? 'text-indigo-700' : 'text-indigo-600'}`} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {participant.name}
                    {isCurrentUser && (
                      <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {participant.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isAdmin ? (
                  <select
                    value={participant.role || 'user'}
                    onChange={(e) => onRoleChange(participant.id, e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      participant.role === 'admin'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {participant.role || 'user'}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {participants.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No participants added yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingDetails;