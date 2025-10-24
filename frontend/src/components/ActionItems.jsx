// frontend/src/components/ActionItems.jsx

import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Check, AlertCircle, Loader, Mail, Send } from 'lucide-react';
import { supabaseHelpers } from '../services/supabaseService';
import { ActionItemAdminControls } from './AdminActionItems';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ActionItems = ({ actionItems = [], meetingId, participants = [], isAdmin = false, onUpdate }) => {
  const [updating, setUpdating] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});
  const [sendingEmail, setSendingEmail] = useState({});
  const [emailResults, setEmailResults] = useState({});
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);

  const handleStatusUpdate = async (actionItemId, status) => {
    setUpdating(prev => ({ ...prev, [actionItemId]: true }));
    try {
      const { error } = await supabaseHelpers.updateActionItemStatus(actionItemId, status);
      
      if (error) throw error;
      
      // Also sync to Jira if linked
      const item = actionItems.find(a => a.id === actionItemId);
      if (item?.jira_issue_key) {
        try {
          await axios.post(`${API_BASE_URL}/jira/update-status`, {
            jira_issue_key: item.jira_issue_key,
            status: status
          });
        } catch (jiraError) {
          console.error('Jira sync failed:', jiraError);
        }
      }
      
      onUpdate?.();
    } catch (error) {
      console.error('Status update error:', error);
      alert(`Failed to update action item: ${error.message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [actionItemId]: false }));
    }
  };

  const handleJiraSync = async (actionItem) => {
    setSyncing(prev => ({ ...prev, [actionItem.id]: true }));
    try {
      const response = await axios.post(`${API_BASE_URL}/jira/create-issue`, {
        action_item_id: actionItem.id,
        meeting_id: meetingId,
        project_key: 'MIN'
      });
      
      const data = response.data;
      
      if (data.success) {
        await supabaseHelpers.updateActionItemJira(
          actionItem.id,
          data.jira_issue_key,
          data.jira_issue_url
        );
        
        setSyncResults(prev => ({
          ...prev,
          [actionItem.id]: {
            success: true,
            key: data.jira_issue_key,
            url: data.jira_issue_url
          }
        }));
        
        onUpdate?.();
        
        setTimeout(() => {
          setSyncResults(prev => {
            const newResults = { ...prev };
            delete newResults[actionItem.id];
            return newResults;
          });
        }, 3000);
      } else {
        throw new Error(data.message || 'Sync failed');
      }
    } catch (error) {
      console.error('Jira sync error:', error);
      const message = error.response?.data?.detail || error.message || 'Sync failed';
      
      setSyncResults(prev => ({
        ...prev,
        [actionItem.id]: {
          success: false,
          error: message
        }
      }));
      
      setTimeout(() => {
        setSyncResults(prev => {
          const newResults = { ...prev };
          delete newResults[actionItem.id];
          return newResults;
        });
      }, 5000);
    } finally {
      setSyncing(prev => ({ ...prev, [actionItem.id]: false }));
    }
  };

  const handleSendEmail = async (actionItem) => {
    if (!actionItem.assignee_email) {
      alert('No email address assigned to this action item');
      return;
    }

    setSendingEmail(prev => ({ ...prev, [actionItem.id]: true }));
    try {
      const response = await axios.post(`${API_BASE_URL}/email/send-action-item`, {
        action_item_id: actionItem.id,
        meeting_id: meetingId
      });
      
      const data = response.data;
      
      if (data.success) {
        await supabaseHelpers.markEmailSent(actionItem.id, actionItem.assignee_email);
        
        setEmailResults(prev => ({
          ...prev,
          [actionItem.id]: {
            success: true,
            message: data.message || `Email sent to ${actionItem.assignee_email}`
          }
        }));
        
        onUpdate?.();
        
        setTimeout(() => {
          setEmailResults(prev => {
            const newResults = { ...prev };
            delete newResults[actionItem.id];
            return newResults;
          });
        }, 3000);
      } else {
        throw new Error(data.detail || 'Failed to send email');
      }
    } catch (error) {
      console.error('Email send error:', error);
      const message = error.response?.data?.detail || error.message || 'Failed to send email';
      
      setEmailResults(prev => ({
        ...prev,
        [actionItem.id]: {
          success: false,
          error: message
        }
      }));
      
      setTimeout(() => {
        setEmailResults(prev => {
          const newResults = { ...prev };
          delete newResults[actionItem.id];
          return newResults;
        });
      }, 5000);
    } finally {
      setSendingEmail(prev => ({ ...prev, [actionItem.id]: false }));
    }
  };

  const handleBulkSync = async () => {
    const unsynced = actionItems.filter(item => !item.jira_issue_key);

    if (unsynced.length === 0) {
      alert('All action items are already synced to Jira');
      return;
    }

    const confirmed = window.confirm(
      `Sync ${unsynced.length} action item(s) to Jira?`
    );

    if (!confirmed) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/jira/create-bulk-issues`, {
        action_item_ids: unsynced.map(item => item.id),
        meeting_id: meetingId,
        project_key: 'MIN'
      });
      
      const data = response.data;
      
      if (data.success) {
        alert(`Successfully synced ${data.success_count} of ${data.total} action items to Jira!`);
        onUpdate?.();
      } else {
        throw new Error('Bulk sync failed');
      }
    } catch (error) {
      console.error('Bulk sync error:', error);
      const message = error.response?.data?.detail || error.message || 'Bulk sync failed';
      alert(`Bulk sync failed: ${message}`);
    }
  };

  const columns = [
    { id: 'pending', title: 'To Do', color: 'bg-gray-50 border-gray-200' },
    { id: 'in_progress', title: 'In Progress', color: 'bg-blue-50 border-blue-200' },
    { id: 'completed', title: 'Done', color: 'bg-green-50 border-green-200' }
  ];

  const getItemsByStatus = (status) => {
    return actionItems.filter(item => (item.status || 'pending') === status);
  };

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    if (draggedItem && draggedItem.status !== targetStatus) {
      handleStatusUpdate(draggedItem.id, targetStatus);
    }
    setDraggedItem(null);
  };

  if (!actionItems.length) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">Action Items</h3>
        <div className="text-center py-8 text-gray-500">
          No action items found in this meeting.
        </div>
      </div>
    );
  }

  const unsyncedCount = actionItems.filter(item => !item.jira_issue_key).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">
          Action Items Board ({actionItems.length})
        </h3>
        <div className="flex items-center gap-3">
          {unsyncedCount > 0 && (
            <button
              onClick={handleBulkSync}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Sync {unsyncedCount} to Jira
            </button>
          )}
          <button
            onClick={() => setShowBulkEmailModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium flex items-center gap-2"
          >
            <Mail className="w-4 h-4" />
            Send Summary Email
          </button>
          <span className="text-sm text-gray-600">
            Drag cards to update status
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            items={getItemsByStatus(column.id)}
            participants={participants}
            isAdmin={isAdmin}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
            onDragStart={handleDragStart}
            updating={updating}
            syncing={syncing}
            syncResults={syncResults}
            sendingEmail={sendingEmail}
            emailResults={emailResults}
            onStatusUpdate={handleStatusUpdate}
            onJiraSync={handleJiraSync}
            onSendEmail={handleSendEmail}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      {showBulkEmailModal && (
        <BulkEmailModal
          meetingId={meetingId}
          actionItems={actionItems}
          onClose={() => setShowBulkEmailModal(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
};

const KanbanColumn = ({ 
  column, 
  items, 
  participants,
  isAdmin,
  onDragOver, 
  onDrop, 
  onDragStart, 
  updating, 
  syncing,
  syncResults,
  sendingEmail,
  emailResults,
  onStatusUpdate,
  onJiraSync,
  onSendEmail,
  onUpdate
}) => {
  return (
    <div className={`rounded-lg border-2 ${column.color} p-4 min-h-96`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900">{column.title}</h4>
        <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
          {items.length}
        </span>
      </div>
      
      <div
        className="space-y-3 min-h-80"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {items.map((item) => (
          <ActionItemCard
            key={item.id}
            item={item}
            participants={participants}
            isAdmin={isAdmin}
            onDragStart={onDragStart}
            updating={updating[item.id]}
            syncing={syncing[item.id]}
            syncResult={syncResults[item.id]}
            sendingEmail={sendingEmail[item.id]}
            emailResult={emailResults[item.id]}
            onStatusUpdate={onStatusUpdate}
            onJiraSync={onJiraSync}
            onSendEmail={onSendEmail}
            onUpdate={onUpdate}
          />
        ))}
        
        {items.length === 0 && (
          <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            Drop items here
          </div>
        )}
      </div>
    </div>
  );
};

const ActionItemCard = ({ 
  item, 
  participants,
  isAdmin,
  onDragStart, 
  updating, 
  syncing,
  syncResult,
  sendingEmail,
  emailResult,
  onStatusUpdate,
  onJiraSync,
  onSendEmail,
  onUpdate
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  const getPriorityColor = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-green-100 text-green-800 border-green-200'
    };
    return colors[priority] || colors.medium;
  };

  const getPriorityIcon = (priority) => {
    const icons = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    return icons[priority] || icons.medium;
  };

  return (
    <div
      draggable={!updating && !syncing && !sendingEmail}
      onDragStart={(e) => onDragStart(e, item)}
      className={`group bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow ${
        (updating || syncing || sendingEmail) ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-sm text-gray-900 font-medium line-clamp-2">
            {item.text}
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-gray-400 hover:text-gray-600 ml-2"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(item.priority)}`}>
          {getPriorityIcon(item.priority)} {item.priority}
        </span>
        
        {item.jira_issue_key && (
          <a
            href={item.jira_issue_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
            {item.jira_issue_key}
          </a>
        )}
      </div>

      {syncResult && (
        <div className={`mt-2 p-2 rounded text-xs ${
          syncResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {syncResult.success ? (
            <div className="flex items-center gap-1">
              <Check className="w-3 h-3" />
              Synced: {syncResult.key}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {syncResult.error}
            </div>
          )}
        </div>
      )}

      {emailResult && (
        <div className={`mt-2 p-2 rounded text-xs ${
          emailResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {emailResult.success ? (
            <div className="flex items-center gap-1">
              <Check className="w-3 h-3" />
              {emailResult.message}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {emailResult.error}
            </div>
          )}
        </div>
      )}

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            {item.assignee && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Assignee:</span>
                <span className="font-medium">{item.assignee}</span>
              </div>
            )}
            
            {item.assignee_email && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Email:</span>
                <span className="font-medium">{item.assignee_email}</span>
              </div>
            )}

            {item.email_sent_to && (
              <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                <Mail className="w-3 h-3" />
                Email sent to: {item.email_sent_to}
              </div>
            )}

            {!item.jira_issue_key && (
              <button
                onClick={() => onJiraSync(item)}
                disabled={syncing}
                className="w-full mt-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium flex items-center justify-center gap-2"
              >
                {syncing ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  'Sync to Jira'
                )}
              </button>
            )}

            {item.assignee_email && !item.email_sent_to && (
              <button
                onClick={() => onSendEmail(item)}
                disabled={sendingEmail}
                className="w-full mt-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium flex items-center justify-center gap-2"
              >
                {sendingEmail ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-3 h-3" />
                    Send Email
                  </>
                )}
              </button>
            )}
            
            <ActionItemButtons
              item={item}
              updating={updating}
              onStatusUpdate={onStatusUpdate}
            />

            {/* Admin Controls - Subtle and only visible on hover */}
            <ActionItemAdminControls
              item={item}
              participants={participants}
              isAdmin={isAdmin}
              onUpdate={onUpdate}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const ActionItemButtons = ({ item, updating, onStatusUpdate }) => {
  const status = item.status || 'pending';
  
  if (status === 'completed') {
    return (
      <button
        onClick={() => onStatusUpdate(item.id, 'pending')}
        disabled={updating}
        className="w-full mt-2 px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        {updating ? 'Updating...' : 'Reopen'}
      </button>
    );
  }

  return (
    <div className="flex space-x-1 mt-2">
      {status === 'pending' && (
        <button
          onClick={() => onStatusUpdate(item.id, 'in_progress')}
          disabled={updating}
          className="flex-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
        >
          Start
        </button>
      )}
      
      <button
        onClick={() => onStatusUpdate(item.id, 'completed')}
        disabled={updating}
        className="flex-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
      >
        Complete
      </button>
    </div>
  );
};

const BulkEmailModal = ({ meetingId, actionItems, onClose, onUpdate }) => {
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const assigneesWithEmail = [...new Set(
      actionItems
        .filter(item => item.assignee_email)
        .map(item => item.assignee_email)
    )];

    if (assigneesWithEmail.length === 0) {
      alert('No email addresses found in action items');
      return;
    }

    setSending(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/email/send-meeting-summary`, {
        meeting_id: meetingId,
        recipient_emails: assigneesWithEmail
      });
      
      const data = response.data;
      
      if (data.success) {
        alert(`Successfully sent emails to ${data.success_count} of ${data.total} recipients!`);
        onUpdate?.();
        onClose();
      } else {
        throw new Error(data.detail || 'Failed to send emails');
      }
    } catch (error) {
      console.error('Bulk email error:', error);
      const message = error.response?.data?.detail || error.message || 'Failed to send emails';
      alert(`Failed to send emails: ${message}`);
    } finally {
      setSending(false);
    }
  };

  const recipientEmails = [...new Set(
    actionItems
      .filter(item => item.assignee_email)
      .map(item => item.assignee_email)
  )];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6">
        <h3 className="text-xl font-semibold mb-4">Send Meeting Summary Email</h3>
        
        <div className="space-y-4 mb-6">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Recipients ({recipientEmails.length}):</p>
            <p className="text-xs text-gray-600">
              {recipientEmails.join(', ') || 'No email addresses found'}
            </p>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">📧 Email Will Include:</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Meeting title and date</li>
              <li>• Complete meeting summary</li>
              <li>• All action items with assignees and priorities</li>
              <li>• Links to Jira tickets (if synced)</li>
              <li>• Link to full transcript</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || recipientEmails.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Emails
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionItems;