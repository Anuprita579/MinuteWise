import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AdminActionItems = ({ actionItems, meetingId, participants, isAdmin, onUpdate }) => {
  const [addingNew, setAddingNew] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formData, setFormData] = useState({
    text: '',
    assignee: '',
    assignee_email: '',
    priority: 'medium',
    category: 'General'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const priorities = ['low', 'medium', 'high'];
  const categories = [
    'General',
    'Documentation',
    'Development',
    'Review',
    'Communication',
    'Planning',
    'Design',
    'Testing',
    'Presentation'
  ];

  const handleEdit = (item) => {
    setEditingItemId(item.id);
    setFormData({
      text: item.text,
      assignee: item.assignee,
      assignee_email: item.assignee_email,
      priority: item.priority,
      category: item.category
    });
  };

  const handleSaveEdit = async (itemId) => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/admin/action-item/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action_item_id: itemId,
          ...formData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update action item');
      }

      setEditingItemId(null);
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this action item?')) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/admin/action-item/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action_item_id: itemId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to delete action item');
      }

      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = async () => {
    if (!formData.text || !formData.assignee || !formData.assignee_email) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/admin/action-item/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meeting_id: meetingId,
          ...formData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create action item');
      }

      setAddingNew(false);
      setFormData({
        text: '',
        assignee: '',
        assignee_email: '',
        priority: 'medium',
        category: 'General'
      });
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleParticipantSelect = (participantName) => {
    const participant = participants.find(p => p.name === participantName);
    if (participant) {
      setFormData(prev => ({
        ...prev,
        assignee: participant.name,
        assignee_email: participant.email
      }));
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Add New Button - Subtle */}
      {!addingNew && (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-indigo-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Action Item
        </button>
      )}

      {/* Add New Form */}
      {addingNew && (
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3 text-gray-900">Create New Action Item</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Task Description *
              </label>
              <textarea
                value={formData.text}
                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                rows={2}
                placeholder="Enter task description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Assignee *
                </label>
                <select
                  value={formData.assignee}
                  onChange={(e) => handleParticipantSelect(e.target.value)}
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select...</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.assignee_email}
                  onChange={(e) => setFormData({ ...formData, assignee_email: e.target.value })}
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleAddNew}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => setAddingNew(false)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Export Edit/Delete Controls for use in Kanban cards
export const ActionItemAdminControls = ({ item, participants, isAdmin, onUpdate }) => {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    text: item.text,
    assignee: item.assignee,
    assignee_email: item.assignee_email,
    priority: item.priority,
    category: item.category
  });
  const [saving, setSaving] = useState(false);

  const priorities = ['low', 'medium', 'high'];
  const categories = [
    'General', 'Documentation', 'Development', 'Review',
    'Communication', 'Planning', 'Design', 'Testing', 'Presentation'
  ];

  if (!isAdmin) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/action-item/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_item_id: item.id,
          ...formData
        })
      });

      if (!response.ok) throw new Error('Failed to update');

      setEditMode(false);
      onUpdate?.();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this action item?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/action-item/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_item_id: item.id })
      });

      if (!response.ok) throw new Error('Failed to delete');

      onUpdate?.();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const handleParticipantSelect = (participantName) => {
    const participant = participants.find(p => p.name === participantName);
    if (participant) {
      setFormData(prev => ({
        ...prev,
        assignee: participant.name,
        assignee_email: participant.email
      }));
    }
  };

  if (editMode) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
        <textarea
          value={formData.text}
          onChange={(e) => setFormData({ ...formData, text: e.target.value })}
          className="w-full p-2 text-xs border border-gray-300 rounded-md"
          rows={2}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={formData.assignee}
            onChange={(e) => handleParticipantSelect(e.target.value)}
            className="p-1.5 text-xs border border-gray-300 rounded-md"
          >
            {participants.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          <input
            type="email"
            value={formData.assignee_email}
            onChange={(e) => setFormData({ ...formData, assignee_email: e.target.value })}
            className="p-1.5 text-xs border border-gray-300 rounded-md"
          />
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="p-1.5 text-xs border border-gray-300 rounded-md"
          >
            {priorities.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="p-1.5 text-xs border border-gray-300 rounded-md"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <Check className="w-3 h-3 inline mr-1" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setEditMode(false)}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <X className="w-3 h-3 inline mr-1" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => setEditMode(true)}
        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
        title="Edit"
      >
        <Edit2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleDelete}
        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default AdminActionItems;