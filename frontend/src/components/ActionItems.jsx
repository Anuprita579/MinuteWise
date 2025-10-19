import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Check, AlertCircle, Loader, Mail, Send } from 'lucide-react';
import { transcriptionApi, jiraApi, emailApi } from '../services/api';

const ActionItems = ({ actionItems = [], meetingId, onUpdate }) => {
  const [updating, setUpdating] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});
  const [sendingEmail, setSendingEmail] = useState({});
  const [emailResults, setEmailResults] = useState({});
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);

  const handleStatusUpdate = async (index, status) => {
    setUpdating(prev => ({ ...prev, [index]: true }));
    try {
      await transcriptionApi.updateActionItemStatus(meetingId, index, status);
      onUpdate?.();
    } catch (error) {
      console.error('Status update error:', error);
      const message = error.response?.data?.detail || error.message || 'Failed to update';
      alert(`Failed to update action item: ${message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleJiraSync = async (index) => {
    setSyncing(prev => ({ ...prev, [index]: true }));
    try {
      const response = await jiraApi.createIssue(meetingId, index, 'MIN');
      const data = response.data;
      
      if (data.success) {
        setSyncResults(prev => ({
          ...prev,
          [index]: {
            success: true,
            key: data.jira_issue_key,
            url: data.jira_issue_url
          }
        }));
        onUpdate?.();
        
        setTimeout(() => {
          setSyncResults(prev => {
            const newResults = { ...prev };
            delete newResults[index];
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
        [index]: {
          success: false,
          error: message
        }
      }));
      
      setTimeout(() => {
        setSyncResults(prev => {
          const newResults = { ...prev };
          delete newResults[index];
          return newResults;
        });
      }, 5000);
    } finally {
      setSyncing(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleSendEmail = async (index, recipientEmail) => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    setSendingEmail(prev => ({ ...prev, [index]: true }));
    try {
      const response = await emailApi.sendActionItemEmail(
        meetingId,
        index,
        recipientEmail
      );
      
      const data = response.data;
      
      if (data.success) {
        setEmailResults(prev => ({
          ...prev,
          [index]: {
            success: true,
            message: data.message || `Email sent to ${recipientEmail}`
          }
        }));
        onUpdate?.();
        
        setTimeout(() => {
          setEmailResults(prev => {
            const newResults = { ...prev };
            delete newResults[index];
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
        [index]: {
          success: false,
          error: message
        }
      }));
      
      setTimeout(() => {
        setEmailResults(prev => {
          const newResults = { ...prev };
          delete newResults[index];
          return newResults;
        });
      }, 5000);
    } finally {
      setSendingEmail(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleBulkSync = async () => {
    const unsynced = actionItems
      .map((item, idx) => ({ ...item, idx }))
      .filter(item => !item.jira_issue_key)
      .map(item => item.idx);

    if (unsynced.length === 0) {
      alert('All action items are already synced to Jira');
      return;
    }

    const confirmed = window.confirm(
      `Sync ${unsynced.length} action item(s) to Jira?`
    );

    if (!confirmed) return;

    try {
      const response = await jiraApi.createBulkIssues(meetingId, unsynced, 'MIN');
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
    return actionItems
      .map((item, index) => ({ ...item, index }))
      .filter(item => (item.status || 'pending') === status);
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
      handleStatusUpdate(draggedItem.index, targetStatus);
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

const BulkEmailModal = ({ meetingId, actionItems, onClose, onUpdate }) => {
  const [emailType, setEmailType] = useState('summary');
  const [emails, setEmails] = useState('');
  const [organizationDomain, setOrganizationDomain] = useState('@ves.ac.in');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    let recipientEmails = [];

    if (emailType === 'summary') {
      recipientEmails = emails.split(',').map(e => e.trim()).filter(e => e);
      if (recipientEmails.length === 0) {
        alert('Please enter at least one email address');
        return;
      }
    } else {
      const assignees = [...new Set(
        actionItems
          .map(item => item.assignee)
          .filter(a => a && a !== 'Unassigned')
      )];
      
      if (assignees.length === 0) {
        alert('No assignees found in action items');
        return;
      }

      recipientEmails = assignees.map(name => {
        const emailName = name.toLowerCase().replace(/\s+/g, '.');
        return emailName + organizationDomain;
      });
    }

    setSending(true);
    try {
      const response = await emailApi.sendMeetingSummary(meetingId, recipientEmails);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6">
        <h3 className="text-xl font-semibold mb-4">Send Meeting Summary Email</h3>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="summary"
                  checked={emailType === 'summary'}
                  onChange={(e) => setEmailType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">Manual Email List</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="organization"
                  checked={emailType === 'organization'}
                  onChange={(e) => setEmailType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">Organization Domain</span>
              </label>
            </div>
          </div>

          {emailType === 'summary' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Emails (comma-separated)
              </label>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="john@example.com, jane@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows="3"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter email addresses separated by commas
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organization Email Domain
              </label>
              <input
                type="text"
                value={organizationDomain}
                onChange={(e) => setOrganizationDomain(e.target.value)}
                placeholder="@ves.ac.in"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Will send to all assignees with this domain (e.g., john.doe@ves.ac.in)
              </p>
              <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs font-medium text-gray-700 mb-1">Recipients Preview:</p>
                <p className="text-xs text-gray-600">
                  {[...new Set(
                    actionItems
                      .map(item => item.assignee)
                      .filter(a => a && a !== 'Unassigned')
                  )].map(name => {
                    const emailName = name.toLowerCase().replace(/\s+/g, '.');
                    return emailName + organizationDomain;
                  }).join(', ') || 'No assignees found'}
                </p>
              </div>
            </div>
          )}

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
            disabled={sending}
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

const KanbanColumn = ({ 
  column, 
  items, 
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
  onSendEmail
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
            key={item.index}
            item={item}
            onDragStart={onDragStart}
            updating={updating[item.index]}
            syncing={syncing[item.index]}
            syncResult={syncResults[item.index]}
            sendingEmail={sendingEmail[item.index]}
            emailResult={emailResults[item.index]}
            onStatusUpdate={onStatusUpdate}
            onJiraSync={onJiraSync}
            onSendEmail={onSendEmail}
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
  onDragStart, 
  updating, 
  syncing,
  syncResult,
  sendingEmail,
  emailResult,
  onStatusUpdate,
  onJiraSync,
  onSendEmail
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  
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

  const handleEmailSend = () => {
    if (!emailInput.trim()) {
      const assignee = item.assignee;
      if (assignee && assignee !== 'Unassigned') {
        const autoEmail = assignee.toLowerCase().replace(/\s+/g, '.') + '@ves.ac.in';
        const confirmed = window.confirm(
          `Send email to ${autoEmail}?\n\n(Auto-generated from assignee name)`
        );
        if (confirmed) {
          onSendEmail(item.index, autoEmail);
          setShowEmailInput(false);
        }
      } else {
        alert('Please enter an email address');
      }
    } else {
      onSendEmail(item.index, emailInput);
      setEmailInput('');
      setShowEmailInput(false);
    }
  };

  return (
    <div
      draggable={!updating && !syncing && !sendingEmail}
      onDragStart={(e) => onDragStart(e, item)}
      className={`bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow ${
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
            
            {item.due_date && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Due Date:</span>
                <span className="font-medium">{item.due_date}</span>
              </div>
            )}

            {item.email_sent_to && (
              <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                <Mail className="w-3 h-3" />
                Sent to: {item.email_sent_to}
              </div>
            )}

            {!item.jira_issue_key && (
              <button
                onClick={() => onJiraSync(item.index)}
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

            {!showEmailInput ? (
              <button
                onClick={() => setShowEmailInput(true)}
                disabled={sendingEmail}
                className="w-full mt-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium flex items-center justify-center gap-2"
              >
                <Mail className="w-3 h-3" />
                Send Email Notification
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={
                    item.assignee && item.assignee !== 'Unassigned'
                      ? `${item.assignee.toLowerCase().replace(/\s+/g, '.')}@ves.ac.in`
                      : 'Enter email address'
                  }
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleEmailSend()}
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleEmailSend}
                    disabled={sendingEmail}
                    className="flex-1 px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1"
                  >
                    {sendingEmail ? (
                      <>
                        <Loader className="w-3 h-3 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        Send
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowEmailInput(false);
                      setEmailInput('');
                    }}
                    className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            <ActionItemButtons
              item={item}
              updating={updating}
              onStatusUpdate={onStatusUpdate}
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
        onClick={() => onStatusUpdate(item.index, 'pending')}
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
          onClick={() => onStatusUpdate(item.index, 'in_progress')}
          disabled={updating}
          className="flex-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
        >
          Start
        </button>
      )}
      
      <button
        onClick={() => onStatusUpdate(item.index, 'completed')}
        disabled={updating}
        className="flex-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
      >
        Complete
      </button>
    </div>
  );
};

export default ActionItems;