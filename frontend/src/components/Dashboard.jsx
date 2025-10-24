// frontend/src/components/Dashboard.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabaseHelpers } from '../services/supabaseService';
import { Calendar, Users, CheckSquare, Clock, AlertCircle, ChevronDown } from 'lucide-react';
import UserProfile from './UserProfile';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef(null);
  const [stats, setStats] = useState({
    totalMeetings: 0,
    pendingItems: 0,
    inProgressItems: 0,
    completedItems: 0
  });

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch user's meetings
      const { data: meetingsData, error: meetingsError } = await supabaseHelpers.getUserMeetings();
      if (meetingsError) throw meetingsError;
      setMeetings(meetingsData || []);

      // Fetch user's action items
      const { data: itemsData, error: itemsError } = await supabaseHelpers.getUserActionItems(user.email);
      if (itemsError) throw itemsError;
      setActionItems(itemsData || []);

      // Calculate stats
      const pending = itemsData?.filter(item => item.status === 'pending').length || 0;
      const inProgress = itemsData?.filter(item => item.status === 'in_progress').length || 0;
      const completed = itemsData?.filter(item => item.status === 'completed').length || 0;

      setStats({
        totalMeetings: meetingsData?.length || 0,
        pendingItems: pending,
        inProgressItems: inProgress,
        completedItems: completed
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome back, {user?.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/upload')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Upload Audio
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<Calendar className="w-6 h-6" />}
            label="Total Meetings"
            value={stats.totalMeetings}
            color="bg-blue-500"
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            label="Pending Tasks"
            value={stats.pendingItems}
            color="bg-yellow-500"
          />
          <StatCard
            icon={<AlertCircle className="w-6 h-6" />}
            label="In Progress"
            value={stats.inProgressItems}
            color="bg-orange-500"
          />
          <StatCard
            icon={<CheckSquare className="w-6 h-6" />}
            label="Completed"
            value={stats.completedItems}
            color="bg-green-500"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Meetings List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Your Meetings</h2>
              {meetings.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No meetings yet</p>
                  <button
                    onClick={() => navigate('/upload')}
                    className="mt-4 text-indigo-600 hover:underline"
                  >
                    Upload your first meeting
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {meetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      onClick={() => navigate(`/meeting/${meeting.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Items Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Your Action Items</h2>
              {actionItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckSquare className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No action items assigned</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {actionItems.filter(item => item.status !== 'completed').map((item) => (
                    <ActionItemPreview
                      key={item.id}
                      item={item}
                      onClick={() => navigate(`/meeting/${item.meeting_id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const StatCard = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-lg shadow-sm p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={`${color} p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

const MeetingCard = ({ meeting, onClick }) => {
  const statusColors = {
    pending: 'bg-gray-100 text-gray-700',
    processing: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700'
  };

  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-lg p-4 hover:border-indigo-500 hover:shadow-md transition cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900">{meeting.title}</h3>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[meeting.status]}`}>
          {meeting.status}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {meeting.participant_count} participants
        </span>
        <span className="flex items-center gap-1">
          <CheckSquare className="w-4 h-4" />
          {meeting.pending_action_items}/{meeting.action_item_count} pending
        </span>
      </div>
      {meeting.is_admin && (
        <div className="mt-2">
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
            Admin
          </span>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        {new Date(meeting.created_at).toLocaleDateString()}
      </p>
    </div>
  );
};

const ActionItemPreview = ({ item, onClick }) => {
  const priorityColors = {
    high: 'border-red-500 bg-red-50',
    medium: 'border-yellow-500 bg-yellow-50',
    low: 'border-green-500 bg-green-50'
  };

  return (
    <div
      onClick={onClick}
      className={`border-l-4 ${priorityColors[item.priority]} p-3 rounded cursor-pointer hover:shadow-md transition`}
    >
      <p className="text-sm font-medium text-gray-900 mb-1">{item.text}</p>
      <p className="text-xs text-gray-600 mb-2">{item.meeting_title}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{item.priority} priority</span>
        <span className={`text-xs px-2 py-1 rounded ${
          item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {item.status.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
};

export default Dashboard;