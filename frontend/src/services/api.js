import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Transcription API methods
export const transcriptionApi = {
  upload: (formData) => api.post('/transcription/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  getTranscription: (id) => api.get(`/transcription/${id}`),
  
  updateActionItemStatus: (meetingId, actionIndex, status) => 
    api.patch(`/transcription/${meetingId}/action-item/${actionIndex}`, { status }),
  
  getActionItems: (meetingId) => 
    api.get(`/transcription/${meetingId}/action-items`),
};

// Jira API methods
export const jiraApi = {
  testConnection: () => api.get('/jira/test-connection'),
  
  createIssue: (meetingId, actionItemIndex, projectKey = 'MIN') => 
    api.post('/jira/create-issue', {
      meeting_id: meetingId,
      action_item_index: actionItemIndex,
      project_key: projectKey
    }),
  
  createBulkIssues: (meetingId, actionItemIndices, projectKey = 'MIN') => 
    api.post('/jira/create-bulk-issues', {
      meeting_id: meetingId,
      action_item_indices: actionItemIndices,
      project_key: projectKey
    }),
};

// Email API methods
export const emailApi = {
  sendActionItemEmail: (meetingId, actionItemIndex, recipientEmail) => 
    api.post('/email/send-action-item-email', {
      meeting_id: meetingId,
      action_item_index: actionItemIndex,
      recipient_email: recipientEmail
    }),
  
  sendMeetingSummary: (meetingId, recipientEmails) => 
    api.post('/email/send-meeting-summary', {
      meeting_id: meetingId,
      recipient_emails: recipientEmails
    }),
  
  testEmailConfig: () => 
    api.get('/email/test-email-config'),
};

// Auth API methods
export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
  }
};

export default api;