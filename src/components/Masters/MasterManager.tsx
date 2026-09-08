'use client'

import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../UI/Modal';
import DataTable from '../UI/DataTable';
import Badge from '../UI/Badge';
import ConfirmModal from '../UI/ConfirmModal';
import { Plus, Edit3, Trash2, Search } from 'lucide-react';

interface MasterItem {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdOn?: string;
}

interface MasterManagerProps {
  title: string;
  description: string;
  items: MasterItem[];
  onAdd: (item: MasterItem) => void;
  onUpdate: (item: MasterItem) => void;
  onDelete: (id: string) => void;
  showColor?: boolean;
  showDescription?: boolean;
}

export default function MasterManager({ title, description, items, onAdd, onUpdate, onDelete, showColor, showDescription = true }: MasterManagerProps) {
  const { state } = useApp();
  const { darkMode } = state;
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [searchQuery, setSearchQuery] = useState('');

  const activeItems = items.filter(i => !i.isDeleted);
  const filtered = activeItems.filter(i =>
    !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function openAdd() {
    setEditing(null);
    setName('');
    setDesc('');
    setColor('#3b82f6');
    setShowModal(true);
  }

  function openEdit(item: MasterItem) {
    setEditing(item);
    setName(item.name);
    setDesc(item.description || '');
    setColor(item.color || '#3b82f6');
    setShowModal(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (editing) {
      onUpdate({ ...editing, name, description: desc, color: showColor ? color : undefined });
    } else {
      onAdd({
        id: uuidv4(),
        name,
        description: desc,
        color: showColor ? color : undefined,
        isActive: true,
        isDeleted: false,
        createdOn: new Date().toISOString().split('T')[0],
      });
    }
    setShowModal(false);
  }

  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const labelClass = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  const columns = [
    ...(showColor ? [{
      key: 'color', label: '', width: '50px', sortable: false,
      render: (item: MasterItem) => (
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color || '#3b82f6' }} />
      )
    }] : []),
    { key: 'name', label: 'Name', render: (item: MasterItem) => (
      <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.name}</span>
    )},
    ...(showDescription ? [{
      key: 'description', label: 'Description', render: (item: MasterItem) => (
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.description || '--'}</span>
      )
    }] : []),
    { key: 'isActive', label: 'Status', render: (item: MasterItem) => (
      <Badge text={item.isActive ? 'Active' : 'Inactive'} color={item.isActive ? '#10b981' : '#ef4444'} />
    )},
    { key: 'createdOn', label: 'Created', render: (item: MasterItem) => (
      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.createdOn || '--'}</span>
    )},
    { key: 'actions', label: 'Actions', sortable: false, render: (item: MasterItem) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEdit(item)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-500'}`}>
          <Edit3 size={16} />
        </button>
        <button onClick={() => setItemToDelete(item.id)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
          <Trash2 size={16} />
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition">
          <Plus size={18} /> Add {title.replace(' Master', '')}
        </button>
      </div>

      <div className={`${cardBg} rounded-2xl border`}>
        <div className="p-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <Search size={18} className="opacity-50" />
            <input type="text" placeholder={`Search ${title.toLowerCase()}...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
          </div>
        </div>
        <DataTable columns={columns} data={filtered} pageSize={10} />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit ${title.replace(' Master', '')}` : `Add ${title.replace(' Master', '')}`}>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name *</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Enter name" />
          </div>
          {showDescription && (
            <div>
              <label className={labelClass}>Description</label>
              <textarea className={`${inputClass} h-20 resize-none`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" />
            </div>
          )}
          {showColor && (
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer" />
                <input className={inputClass} value={color} onChange={e => setColor(e.target.value)} placeholder="#hex" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowModal(false)} className={`px-5 py-2.5 rounded-xl text-sm font-medium ${
              darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}>Cancel</button>
            <button onClick={handleSave} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition">
              {editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => {
          if (itemToDelete) {
            onDelete(itemToDelete);
          }
        }}
        title="Delete Master Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        isDanger={true}
      />
    </div>
  );
}

