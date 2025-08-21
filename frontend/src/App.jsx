import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Home from './components/Home';
import AudioUpload from './components/AudioUpload';
import TranscriptView from './components/TranscriptView';
import MeetingRoom from './components/MeetingRoom';

function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/" element={user ? <Home /> : <Navigate to="/login" />} />
          <Route path="/upload" element={user ? <AudioUpload /> : <Navigate to="/login" />} />
          <Route path="/join" element={user ? <MeetingRoom /> : <Navigate to="/login" />} />
          <Route path="/transcript/:id" element={user ? <TranscriptView /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;