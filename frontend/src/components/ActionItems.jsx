import React, { useState } from 'react';
import { useTranscription } from '../hooks/useTranscription';
import { ChevronDown, Plus, User, Calendar, Flag } from 'lucide-react';


const ActionItems = ({ actionItems = [], meetingId, onUpdate }) => {
  const [updating, setUpdating] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const { updateActionItem } = useTranscription();

  const handleStatusUpdate = async (index, status) => {
    setUpdating(prev => ({ ...prev, [index]: true }));
    try {
      const result = await updateActionItem(meetingId, index, { status });
      if (result.success) {
        onUpdate?.();
      } else {
        alert(result.error);
      }
    } catch (error) {
      alert('Failed to update action item');
    } finally {
      setUpdating(prev => ({ ...prev, [index]: false }));
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">
          Action Items Board ({actionItems.length})
        </h3>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Drag cards to update status</span>
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
            onStatusUpdate={handleStatusUpdate}
          />
        ))}
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
  onStatusUpdate 
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
            onStatusUpdate={onStatusUpdate}
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

const ActionItemCard = ({ item, onDragStart, updating, onStatusUpdate }) => {
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
      draggable={!updating}
      onDragStart={(e) => onDragStart(e, item)}
      className={`bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow ${
        updating ? 'opacity-50 cursor-not-allowed' : ''
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
        <div className="flex items-center space-x-2">
          <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(item.priority)}`}>
            {getPriorityIcon(item.priority)} {item.priority}
          </span>
        </div>
        
        {updating && (
          <div className="text-xs text-blue-600">
            Updating...
          </div>
        )}
      </div>

      {item.assignee && (
        <div className="flex items-center mt-2 text-xs text-gray-600">
          <User className="w-3 h-3 mr-1" />
          {item.assignee}
        </div>
      )}

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Priority:</span>
              <span className={`px-2 py-1 rounded ${getPriorityColor(item.priority)}`}>
                {item.priority}
              </span>
            </div>
            
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