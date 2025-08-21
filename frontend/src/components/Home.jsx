import React, { useState } from 'react';
import { api } from '../services/api';
import MeetingRoom from './MeetingRoom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function Home() {
  const { user, logout } = useAuth();
  const [meeting, setMeeting] = useState(null);
  
  const startMeeting = async () => {
    try {
      const res = await api.post('/meetings/start', {
        title: 'Team Sync',
      });
      setMeeting(res.data); // { id, roomName, ... }
    } catch (err) {
      console.error('Failed to start meeting', err);
    }
  };

  if (meeting) {
    return (
      <MeetingRoom
        roomName={meeting.roomName}
        meetingId={meeting.id}
        onEnd={() => setMeeting(null)} 
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Meeting Transcription</h1>
        <div className="flex items-center space-x-4">
          <img src={user.avatar} alt="Avatar" className="w-8 h-8 rounded-full" />
          <span className="text-gray-700">{user.name}</span>
          <button onClick={logout} className="text-blue-600 hover:underline">Logout</button>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Link to="/upload" className="block p-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Audio</h2>
            <p className="text-gray-600">Upload an audio file for transcription and analysis</p>
          </div>
        </Link>

        <div onClick={startMeeting} className="block p-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Join Meeting</h2>
            <p className="text-gray-600">Record audio from live meetings (Jitsi Meet)</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transcriptions</h3>
        {/* Add recent meetings list here */}
      </div>
    </div>
  );
}

export default Home;