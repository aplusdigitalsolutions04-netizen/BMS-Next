'use client'

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useApp } from '../../store/AppContext';
import type { BidTemplate } from '../../types';
import Modal from '../UI/Modal';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';
import toast from 'react-hot-toast';
import { marked } from 'marked';
import {
  Plus, Search, Edit3, Trash2, Copy, Check,
  FileCode2, Building2, ChevronDown, ChevronUp,
  X, Upload, ImageIcon, Trash, FileText, Info,
} from 'lucide-react';

marked.use({ gfm: true, breaks: false });

export default function TemplateManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, firms, templates } = state;

  const [search,       setSearch]       = useState('');
  const [filterFirm,   setFilterFirm]   = useState('all');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [showModal,    setShowModal]    = useState(false);
  const [editing,      setEditing]      = useState<BidTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BidTemplate | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [dragOver,     setDragOver]     = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    firmId: '', name: '',
    headerFile: null as File | null,
    removeHeader: false,
  };
  const [form, setForm] = useState(emptyForm);

  //  Filtered list 
  const filtered = templates.filter(t => {
    if (filterFirm !== 'all' && t.firmId !== filterFirm) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) ||
        (t.content || '').toLowerCase().includes(q);
    }
    return true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  useEffect(() => { setCurrentPage(1); }, [search, filterFirm, pageSize]);
  const paginatedTemplates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  //  Open / close
  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, firmId: filterFirm !== 'all' ? filterFirm : '' });
    setShowModal(true);
  }

  function openEdit(t: BidTemplate) {
    setEditing(t);
    setForm({ firmId: t.firmId || '', name: t.name, headerFile: null, removeHeader: false });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  }

  //  File handlers 
  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setForm(p => ({ ...p, headerFile: f, removeHeader: false }));
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setForm(p => ({ ...p, headerFile: f, removeHeader: false }));
  }

  //  Save 
  async function handleSave() {
    if (!form.name.trim()) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('firmId',    form.firmId || '');
      fd.append('name',      form.name.trim());
      fd.append('createdBy', state.currentUser?.fullName || 'System');
      if (form.headerFile)   fd.append('headerFile', form.headerFile);
      if (form.removeHeader) fd.append('removeHeader', 'true');

      if (editing) {
        const res = await axios.put(`/api/templates/${editing.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        dispatch({ type: 'UPDATE_TEMPLATE', payload: res.data });
        toast.success('Template updated');
      } else {
        const res = await axios.post('/api/templates', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        dispatch({ type: 'ADD_TEMPLATE', payload: res.data });
        toast.success('Template created');
      }
      closeModal();
    } catch { toast.error('Failed to save template'); }
    finally { setSaving(false); }
  }

  //  Delete 
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await axios.delete(`/api/templates/${deleteTarget.id}`);
      dispatch({ type: 'DELETE_TEMPLATE', payload: deleteTarget.id });
      toast.success('Template deleted');
    } catch { toast.error('Failed to delete'); }
  }

  //  Copy content 
  async function handleCopy(t: BidTemplate) {
    if (!t.content) { toast.error('No content yet -- analyse a bid first'); return; }
    try {
      await navigator.clipboard.writeText(t.content);
      setCopiedId(t.id);
      toast.success('Content copied!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch { toast.error('Copy failed'); }
  }

  const isImg = (p: string | null) => !!p && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(p);

  //  Styles 
  const cardBg  = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inp     = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode
      ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500'
      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const lbl     = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const tp      = darkMode ? 'text-white'    : 'text-gray-900';
  const ts      = darkMode ? 'text-gray-400' : 'text-gray-500';
  const div     = darkMode ? 'border-gray-700' : 'border-gray-100';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${tp}`}>Bid Templates</h2>
          <p className={`text-sm ${ts}`}>
            {filtered.length} template{filtered.length !== 1 ? 's' : ''} -- Company header + bid analysis content
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition">
          <Plus size={18} /> New Template
        </button>
      </div>

      {/* Info banner */}
      <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
        darkMode ? 'bg-blue-900/20 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'
      }`}>
        <Info size={18} className="flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong>How it works:</strong> Create a template (firm + header image). Then go to the <strong>Bids (AI)</strong> page,
          analyse a PDF, and use the <strong>"Save as Template"</strong> button to save the content directly into the template.
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-2xl border p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <Search size={16} className="opacity-50 flex-shrink-0" />
          <input type="text" placeholder="Search templates..." value={search}
            onChange={e => setSearch(e.target.value)}
            className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
          {search && <button onClick={() => setSearch('')}><X size={14} className="opacity-50" /></button>}
        </div>
        <select value={filterFirm} onChange={e => setFilterFirm(e.target.value)} className={`${inp} max-w-xs`}>
          <option value="all">All Firms</option>
          <option value="">Global</option>
          {firms.filter(f => !f.isDeleted).map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <FileCode2 size={48} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-lg font-medium ${ts}`}>No templates found</p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Create a template, then analyse a bid to fill in content
          </p>
          <button onClick={openAdd}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
            <Plus size={16} /> Create Template
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedTemplates.map(t => {
            const firm       = firms.find(f => f.id === t.firmId);
            const isExpanded = expandedId === t.id;
            const isCopied   = copiedId === t.id;
            const hasHeader  = !!t.headerFilePath;
            const hasContent = !!t.content;

            return (
              <div key={t.id} className={`${cardBg} rounded-2xl border overflow-hidden hover:shadow-md transition-shadow`}>

                {/* Header image strip */}
                {hasHeader && isImg(t.headerFilePath) && (
                  <div className={`border-b ${div} bg-white`} style={{ maxHeight: 80 }}>
                    <img src={`${t.headerFilePath}`} alt="header"
                      className="w-full object-cover object-top" style={{ maxHeight: 80 }} />
                  </div>
                )}
                {hasHeader && !isImg(t.headerFilePath) && (
                  <div className={`border-b ${div} px-5 py-2 flex items-center gap-2 ${darkMode ? 'bg-gray-750' : 'bg-gray-50'}`}>
                    <ImageIcon size={13} className="text-blue-500" />
                    <span className={`text-xs ${ts}`}>{t.headerFileName}</span>
                  </div>
                )}

                {/* Row */}
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    darkMode ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <FileCode2 size={20} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold text-sm ${tp}`}>{t.name}</h4>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className={`text-xs flex items-center gap-1 ${ts}`}>
                        <Building2 size={10} />
                        {firm?.name ?? <span className="italic">Global</span>}
                      </span>
                      {hasHeader && (
                        <span className={`text-xs flex items-center gap-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          <ImageIcon size={10} /> Header
                        </span>
                      )}
                      {hasContent ? (
                        <span className={`text-xs flex items-center gap-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          <FileText size={10} /> {t.content!.length} chars
                        </span>
                      ) : (
                        <span className={`text-xs flex items-center gap-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                          <FileText size={10} /> No content yet
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasContent && (
                      <button onClick={() => handleCopy(t)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          isCopied
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}>
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                        {isCopied ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                    <button onClick={() => openEdit(t)}
                      className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-500'}`}>
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => setDeleteTarget(t)}
                      className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
                      <Trash2 size={15} />
                    </button>
                    {hasContent && (
                      <button onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && hasContent && (
                  <div className={`border-t ${div}`}>
                    {hasHeader && isImg(t.headerFilePath) && (
                      <div className="px-5 pt-5">
                        <img src={`${t.headerFilePath}`} alt="header"
                          className="w-full rounded-xl border object-contain object-top"
                          style={{ maxHeight: 140 }} />
                      </div>
                    )}
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${ts}`}>Bid Analysis Content</span>
                        <button onClick={() => handleCopy(t)}
                          className={`flex items-center gap-1 text-xs transition ${isCopied ? 'text-emerald-500' : 'text-blue-500 hover:text-blue-600'}`}>
                          {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          {isCopied ? 'Copied!' : 'Copy all'}
                        </button>
                      </div>
                      <div
                        className={`bid-markdown text-sm p-4 rounded-xl ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
                        dangerouslySetInnerHTML={{ __html: marked.parse(t.content!) as string }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className={`${cardBg} rounded-2xl border`}>
            <Pagination
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              totalItems={filtered.length}
              darkMode={darkMode}
              itemLabel="templates"
              pageSizeOptions={[12, 24, 48, 96]}
            />
          </div>
        </div>
      )}

      {/*  Add / Edit Modal  */}
      <Modal isOpen={showModal} onClose={closeModal}
        title={editing ? 'Edit Template' : 'New Bid Template'} size="lg">
        <div className="space-y-5">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Firm <span className={`text-xs font-normal ${ts}`}>(blank = global)</span></label>
              <select className={inp} value={form.firmId} onChange={e => setForm({ ...form, firmId: e.target.value })}>
                <option value="">Global -- All firms</option>
                {firms.filter(f => !f.isDeleted && f.isActive).map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Template Name <span className="text-red-500">*</span></label>
              <input className={inp} value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. ABC Enterprises -- Bid Header" />
            </div>
          </div>

          {/* Header upload */}
          <div>
            <label className={lbl}>
              Company Header Image
              <span className={`text-xs font-normal ml-2 ${ts}`}>Letterhead / logo banner</span>
            </label>

            {editing?.headerFilePath && !form.removeHeader && !form.headerFile && (
              <div className={`mb-3 rounded-xl overflow-hidden border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                {isImg(editing.headerFilePath)
                  ? <img src={`${editing.headerFilePath}`} alt="header"
                      className="w-full object-contain object-top bg-white" style={{ maxHeight: 100 }} />
                  : <div className={`px-4 py-2 flex items-center gap-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <ImageIcon size={13} className="text-blue-500" />
                      <span className={`text-xs ${ts}`}>{editing.headerFileName}</span>
                    </div>
                }
                <div className={`px-3 py-2 flex items-center justify-between border-t ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                  <span className={`text-xs ${ts}`}>Current header</span>
                  <button onClick={() => setForm(p => ({ ...p, removeHeader: true }))}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                    <Trash size={11} /> Remove
                  </button>
                </div>
              </div>
            )}

            {(!editing?.headerFilePath || form.removeHeader || form.headerFile) && (
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                  dragOver ? 'border-blue-500 bg-blue-500/5' :
                  form.headerFile ? (darkMode ? 'border-emerald-600 bg-emerald-900/10' : 'border-emerald-400 bg-emerald-50') :
                  darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}>
                {form.headerFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <ImageIcon size={20} className="text-emerald-500" />
                    <div className="text-left">
                      <p className={`text-sm font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>{form.headerFile.name}</p>
                      <p className={`text-xs ${ts}`}>{(form.headerFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setForm(p => ({ ...p, headerFile: null })); }}
                      className="ml-auto text-red-500"><X size={16} /></button>
                  </div>
                ) : (
                  <>
                    <Upload size={26} className={`mx-auto mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <p className={`text-sm ${ts}`}>Drag & drop or <span className="text-blue-500">browse</span></p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>PNG, JPG, SVG</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </div>
            )}
            {form.removeHeader && editing?.headerFilePath && (
              <button onClick={() => setForm(p => ({ ...p, removeHeader: false }))}
                className="mt-2 text-xs text-blue-500 hover:text-blue-600">
                 Undo -- keep existing header
              </button>
            )}
          </div>

          {/* Content info box */}
          <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
            darkMode ? 'bg-amber-900/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-100 text-amber-700'
          }`}>
            <FileText size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Content is not added here.</strong> After saving the template, go to the <strong>Bids (AI)</strong> page,
              analyse a PDF, then use the <strong>"Save as Template"</strong> button to add content to this template.
            </div>
          </div>
        </div>

        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button onClick={closeModal}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-60">
            {saving ? 'Saving...' : editing ? 'Update Template' : 'Save Template'}
          </button>
        </div>
      </Modal>

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete} title="Delete Template"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`} isDanger />
    </div>
  );
}


