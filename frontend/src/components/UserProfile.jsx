// frontend/src/components/UserProfile.jsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabaseHelpers } from '../services/supabaseService';
import { User, Mail, Shield, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function UserProfile({ showDropdown = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userStats, setUserStats] = useState({
    totalMeetings: 0,
    adminMeetings: 0,
    userMeetings: 0,
    pendingTasks: 0
  });

  useEffect(() => {
    if (user && showDropdown) {
      fetchUserStats();
    }
  }, [user, showDropdown]);

  const fetchUserStats = async () => {
    try {
      // Get all meetings
      const { data: meetings } = await supabaseHelpers.getUserMeetings();
      const adminCount = meetings?.filter(m => m.is_admin).length || 0;
      
      // Get action items
      const { data: items } = await supabaseHelpers.getUserActionItems(user.email);
      const pending = items?.filter(item => item.status === 'pending').length || 0;
      
      setUserStats({
        totalMeetings: meetings?.length || 0,
        adminMeetings: adminCount,
        userMeetings: (meetings?.length || 0) - adminCount,
        pendingTasks: pending
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    if (onClose) onClose();
    navigate('/login');
  };

  if (!showDropdown) return null;

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1 text-white">
            <p className="font-semibold">{user?.user_metadata?.name || 'User'}</p>
            <p className="text-sm opacity-90 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Your Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatItem
            icon={<Shield className="w-4 h-4 text-indigo-600" />}
            label="Admin of"
            value={userStats.adminMeetings}
            color="bg-indigo-50"
          />
          <StatItem
            icon={<User className="w-4 h-4 text-blue-600" />}
            label="Participant of"
            value={userStats.userMeetings}
            color="bg-blue-50"
          />
          <StatItem
            icon={<svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>}
            label="Total Meetings"
            value={userStats.totalMeetings}
            color="bg-green-50"
          />
          <StatItem
            icon={<svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>}
            label="Pending Tasks"
            value={userStats.pendingTasks}
            color="bg-yellow-50"
          />
        </div>
      </div>

      {/* Role Info */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Your Roles</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">As Admin:</span>
            <span className="font-medium text-gray-900">
              Can manage all action items & participants
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">As User:</span>
            <span className="font-medium text-gray-900">
              Can manage own action items only
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-2">
        <button
          onClick={() => {
            navigate('/dashboard');
            if (onClose) onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded transition flex items-center gap-2"
        >
          <User className="w-4 h-4" />
          View Dashboard
        </button>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded transition flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

const StatItem = ({ icon, label, value, color }) => (
  <div className={`${color} rounded-lg p-3`}>
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs text-gray-600">{label}</span>
    </div>
    <p className="text-xl font-bold text-gray-900">{value}</p>
  </div>
);

export default UserProfile;