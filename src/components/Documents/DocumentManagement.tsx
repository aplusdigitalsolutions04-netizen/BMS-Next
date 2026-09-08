'use client'

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useApp } from '../../store/AppContext';
import { generateDocNumber, formatFileSize, getFileIcon } from '../../utils/helpers';
import Modal from '../UI/Modal';
import Badge from '../UI/Badge';
import type { FirmDocument, Firm } from '../../types';
import {
  Plus, Upload, Search, Eye, Edit3, Trash2, Archive,
  RotateCcw, Download, FileText, X, Check, ChevronRight,
  Tag, Settings2, Building2, ArrowLeft, Info, Phone, Mail, MapPin, Loader2,
} from 'lucide-react';
import { logAudit } from '../../utils/auditLogger';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';

//  Step config 
const DOC_STEPS = [
  { label: 'Document Info', icon: FileText },
  { label: 'Classification', icon: Tag },
];

function StepIndicator({ current, darkMode }: { current: number; darkMode: boolean }) {
  return (
    <div className="flex items-center mb-6">
      {DOC_STEPS.map((s, i) => {
        const done   = i + 1 < current;
        const active = i + 1 === current;
        const Icon   = s.icon;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                done   ? 'bg-emerald-500 text-white' :
                active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' :
                darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}>
                {done ? <Check size={16} /> : <Icon size={16} />}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${
                active ? (darkMode ? 'text-blue-400' : 'text-blue-600') :
                done   ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') :
                         (darkMode ? 'text-gray-600' : 'text-gray-400')
              }`}>{s.label}</span>
            </div>
            {i < DOC_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 mb-4 rounded-full transition-all ${
                done ? 'bg-emerald-400' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

//  Main Component 
export default function DocumentManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, documents, firms, tags: allTags, selectedFirmId, masterGroups } = state;

  const categories    = masterGroups?.find(g => g.code === 'DOC_CATEGORY')?.masterData   || [];
  const departments   = masterGroups?.find(g => g.code === 'DOC_DEPARTMENT')?.masterData || [];
  const statuses      = masterGroups?.find(g => g.code === 'DOC_STATUS')?.masterData     || [];
  const defaultStatus = statuses.find(s => s.code === 'ACTIVE')?.code || '';

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFirm,  setSelectedFirm]  = useState<string | null>(selectedFirmId || null);  // company docs page
  const [detailFirm,    setDetailFirm]    = useState<Firm | null>(null);    // company details modal
  const [firmSearch,    setFirmSearch]    = useState('');
  const [showModal,     setShowModal]     = useState(false);
  const [docStep,       setDocStep]       = useState(1);
  const [editing,       setEditing]       = useState<FirmDocument | null>(null);
  const [viewDoc,       setViewDoc]       = useState<FirmDocument | null>(null);
  const [docToDelete,   setDocToDelete]   = useState<FirmDocument | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [filterStatus,  setFilterStatus]  = useState<string>('all');
  const [filterCategory,setFilterCategory]= useState<string>('all');
  const [dragOver,      setDragOver]      = useState(false);

  // Bulk upload
  const [showBulkModal,  setShowBulkModal]  = useState(false);
  const [bulkFiles,      setBulkFiles]      = useState<File[]>([]);
  const [bulkUploading,  setBulkUploading]  = useState(false);
  const [bulkProgress,   setBulkProgress]   = useState(0);
  const [bulkResults,    setBulkResults]    = useState<{ name: string; ok: boolean; msg: string }[]>([]);

  const emptyForm = {
    firmId: selectedFirmId || '', title: '', documentNumber: '',
    categoryId: '', departmentId: '', statusId: defaultStatus,
    issueDate: '', expiryDate: '', description: '',
    tags: [] as string[], keywords: '',
    fileName: '', fileSize: 0, fileType: '', fileObj: null as File | null,
  };
  const [form, setForm] = useState(emptyForm);

  // Only company/firm documents belong here -- AI-generated T&C docs and documents uploaded
  // against a bid (bidDocumentId set) live in the Bid Documents tab instead.
  const activeDocuments = documents.filter(d => !d.isDeleted && !d.fileName?.startsWith('generated_') && !d.bidDocumentId);

  const filtered = activeDocuments.filter(d => {
    if (selectedFirm && d.firmId !== selectedFirm) return false;

    if (filterStatus === 'active'   && (d.isArchived || d.statusId === 'EXPIRED')) return false;
    if (filterStatus === 'expired'  && d.statusId !== 'EXPIRED') return false;
    if (filterStatus === 'archived' && !d.isArchived) return false;
    if (filterStatus === 'review'   && d.statusId !== 'PENDING_REVIEW') return false;
    if (filterCategory !== 'all'    && d.categoryId !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const firm = firms.find(f => f.id === d.firmId);
      if (!d.title.toLowerCase().includes(q) && !d.documentNumber.toLowerCase().includes(q) &&
          !d.keywords.toLowerCase().includes(q) && !(firm?.name.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  useEffect(() => { setCurrentPage(1); }, [selectedFirm, filterStatus, filterCategory, searchQuery, pageSize]);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, firmId: selectedFirm || '', documentNumber: generateDocNumber(state.documents) });
    setDocStep(1);
    setShowModal(true);
  }

  function openEdit(doc: FirmDocument) {
    setEditing(doc);
    setForm({
      firmId: doc.firmId, title: doc.title, documentNumber: doc.documentNumber,
      categoryId: doc.categoryId, departmentId: doc.departmentId, statusId: doc.statusId,
      issueDate: doc.issueDate, expiryDate: doc.expiryDate, description: doc.description,
      tags: doc.tags, keywords: doc.keywords, fileName: doc.fileName,
      fileSize: doc.fileSize, fileType: doc.fileType, fileObj: null,
    });
    setDocStep(1);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setDocStep(1);
  }

  function handleNext() {
    if (docStep === 1) {
      if (!form.firmId)       { toast.error('Please select a Firm'); return; }
      if (!form.title.trim()) { toast.error('Document Title is required'); return; }
    }
    setDocStep(s => s + 1);
  }

  async function handleSave() {
    if (!form.firmId)       { toast.error('Please select a Firm'); return; }
    if (!form.title.trim()) { toast.error('Document Title is required'); return; }

    try {
      const fd = new FormData();
      fd.append('firmId',   form.firmId);
      fd.append('title',    form.title);
      fd.append('documentNumber', form.documentNumber || generateDocNumber(state.documents));
      if (form.categoryId)   fd.append('categoryCode',   form.categoryId);
      if (form.departmentId) fd.append('departmentCode', form.departmentId);
      if (form.statusId)     fd.append('statusCode',     form.statusId);
      if (form.issueDate)    fd.append('issueDate',  form.issueDate);
      if (form.expiryDate)   fd.append('expiryDate', form.expiryDate);
      if (form.description)  fd.append('description', form.description);
      if (form.keywords)     fd.append('keywords',   form.keywords);
      if (form.tags?.length) fd.append('tags', form.tags.join(','));
      fd.append('uploadedBy', state.currentUser.fullName || state.currentUser.username);
      if (form.fileObj) fd.append('file', form.fileObj);

      const res = editing
        ? await axios.put(`/api/documents/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await axios.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      const d = res.data;
      const parsedTags = d.meta?.tags ? d.meta.tags.split(',') : [];
      const updatedDoc: FirmDocument = {
        id: d.id, firmId: d.firmId, title: d.title, documentNumber: d.documentNumber,
        categoryId: d.meta?.categoryCode || '', departmentId: d.meta?.departmentCode || '',
        statusId: d.meta?.statusCode || '', issueDate: d.issueDate || '', expiryDate: d.expiryDate || '',
        description: d.meta?.description || '', tags: parsedTags, keywords: d.meta?.keywords || '',
        fileName: d.meta?.fileName || '', fileSize: d.meta?.fileSize || 0, fileType: d.meta?.fileType || '',
        filePath: d.meta?.filePath || '', uploadedBy: d.meta?.uploadedBy || '',
        uploadDate: d.meta?.uploadDate || d.createdOn, version: d.meta?.version || 1,
        isArchived: d.isArchived, isDeleted: d.isDeleted,
        approvalStatus: (d.meta?.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED') || 'PENDING',
        approvedBy: d.meta?.approvedBy || null,
        approvedOn: d.meta?.approvedOn || null,
        approvalNote: d.meta?.approvalNote || null,
        createdBy: 'system', createdOn: d.createdOn, updatedBy: 'system', updatedOn: d.createdOn,
      };

      if (editing) {
        dispatch({ type: 'UPDATE_DOCUMENT', payload: updatedDoc });
        logAudit({ userId: state.currentUser?.id || 'sys', userName: state.currentUser?.fullName || 'System', action: 'Update', module: 'Documents', details: `Updated '${updatedDoc.title}'` }, dispatch);
        toast.success('Document updated');
      } else {
        dispatch({ type: 'ADD_DOCUMENT', payload: updatedDoc });
        logAudit({ userId: state.currentUser?.id || 'sys', userName: state.currentUser?.fullName || 'System', action: 'Upload', module: 'Documents', details: `Uploaded '${updatedDoc.title}'` }, dispatch);
        toast.success('Document saved');
      }
      setForm(emptyForm);
      closeModal();
      setEditing(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save document');
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setForm(prev => ({ ...prev, fileName: f.name, fileSize: f.size, fileType: f.type, fileObj: f }));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setForm(prev => ({ ...prev, fileName: f.name, fileSize: f.size, fileType: f.type, fileObj: f }));
  }

  function toggleTag(tagId: string) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId) ? prev.tags.filter(t => t !== tagId) : [...prev.tags, tagId],
    }));
  }

  function handleDownload(doc: FirmDocument) {
    if (doc.filePath) window.open(`/api/documents/${doc.id}/download`, '_blank');
    else toast.error('No file uploaded for this document');
  }

  function handlePreview(doc: FirmDocument) {
    if (doc.filePath) window.open(`${doc.filePath}`, '_blank');
    else toast.error('No file uploaded for this document');
  }

  function openBulkModal() {
    setBulkFiles([]);
    setBulkResults([]);
    setBulkProgress(0);
    setShowBulkModal(true);
  }

  async function runBulkUpload() {
    if (!selectedFirm) { toast.error('Please select a firm'); return; }
    if (bulkFiles.length === 0) { toast.error('No files selected'); return; }
    setBulkUploading(true);
    setBulkProgress(0);
    setBulkResults([]);
    const results: { name: string; ok: boolean; msg: string }[] = [];
    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      const titleName = file.name.replace(/\.[^/.]+$/, '');
      try {
        const fd = new FormData();
        fd.append('firmId', selectedFirm);
        fd.append('title', titleName);
        fd.append('documentNumber', generateDocNumber(state.documents));
        fd.append('statusCode', defaultStatus);
        fd.append('uploadedBy', state.currentUser.fullName || state.currentUser.username);
        fd.append('file', file);
        const res = await axios.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const d = res.data;
        const parsedTags = d.meta?.tags ? d.meta.tags.split(',') : [];
        const newDoc: FirmDocument = {
          id: d.id, firmId: d.firmId, title: d.title, documentNumber: d.documentNumber,
          categoryId: d.meta?.categoryCode || '', departmentId: d.meta?.departmentCode || '',
          statusId: d.meta?.statusCode || '', issueDate: d.issueDate || '', expiryDate: d.expiryDate || '',
          description: d.meta?.description || '', tags: parsedTags, keywords: d.meta?.keywords || '',
          fileName: d.meta?.fileName || '', fileSize: d.meta?.fileSize || 0, fileType: d.meta?.fileType || '',
          filePath: d.meta?.filePath || '', uploadedBy: d.meta?.uploadedBy || '',
          uploadDate: d.meta?.uploadDate || d.createdOn, version: d.meta?.version || 1,
          isArchived: d.isArchived, isDeleted: d.isDeleted,
          approvalStatus: (d.meta?.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED') || 'PENDING',
          approvedBy: d.meta?.approvedBy || null,
          approvedOn: d.meta?.approvedOn || null,
          approvalNote: d.meta?.approvalNote || null,
          createdBy: 'system', createdOn: d.createdOn, updatedBy: 'system', updatedOn: d.createdOn,
        };
        dispatch({ type: 'ADD_DOCUMENT', payload: newDoc });
        results.push({ name: file.name, ok: true, msg: 'Uploaded' });
      } catch {
        results.push({ name: file.name, ok: false, msg: 'Upload failed' });
      }
      setBulkProgress(i + 1);
      setBulkResults([...results]);
    }
    setBulkUploading(false);
    const failed = results.filter(r => !r.ok).length;
    if (failed === 0) toast.success(`${bulkFiles.length} files uploaded successfully!`);
    else toast.error(`${failed} file(s) failed to upload`);
  }

  //  Styles 
  const inp = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const lbl     = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const cardBg  = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const sec     = `text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const optBadge= `text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1 ${darkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-100 text-gray-400'}`;

  return (
    <div className="space-y-6">

      {/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
          LEVEL 1 -- COMPANY CARDS (shown when no company is selected)
          a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */}
      {!selectedFirm && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Document Management</h2>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Select a company to view all its documents</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition">
                <Plus size={18} /> Upload Document
              </button>
            </div>
          </div>

          {/* Company search */}
          <div className={`${cardBg} rounded-2xl border p-4`}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <Search size={18} className="opacity-50 flex-shrink-0" />
              <input type="text" placeholder="Search company..." value={firmSearch} onChange={e => setFirmSearch(e.target.value)}
                className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
              {firmSearch && <button onClick={() => setFirmSearch('')}><X size={14} className="opacity-50" /></button>}
            </div>
          </div>

          {/* Company cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {firms
              .filter(f => !f.isDeleted)
              .filter(f => !firmSearch.trim() || f.name.toLowerCase().includes(firmSearch.toLowerCase()) || f.firmCode.toLowerCase().includes(firmSearch.toLowerCase()))
              .map(f => {
                const docCount = activeDocuments.filter(d => d.firmId === f.id).length;
                const expiredCount = activeDocuments.filter(d => d.firmId === f.id && d.expiryDate && new Date(d.expiryDate) < new Date()).length;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFirm(f.id)}
                    className={`${cardBg} rounded-2xl border p-5 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all group`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg shadow-blue-500/20">
                        {f.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`font-bold text-sm leading-snug ${darkMode ? 'text-white' : 'text-gray-900'} group-hover:text-blue-500 transition`} title={f.name}>
                          {f.name}
                        </h4>
                        <p className={`text-xs font-mono mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{f.firmCode}</p>
                      </div>
                      {!f.isActive && <Badge text="Inactive" color="#6b7280" />}
                    </div>

                    <div className="flex items-center gap-4 mt-4">
                      <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <FileText size={13} className="text-blue-500" />
                        <span className="font-semibold">{docCount}</span> docs
                      </div>
                      {expiredCount > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-red-500">
                          <span className="font-semibold">{expiredCount}</span> expired
                        </div>
                      )}
                    </div>

                    <div className={`flex items-center justify-between mt-4 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <button
                        onClick={e => { e.stopPropagation(); setDetailFirm(f); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Info size={12} /> Details
                      </button>
                      <span className={`flex items-center gap-1 text-xs font-semibold text-blue-500 opacity-0 group-hover:opacity-100 transition`}>
                        View Docs <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {firms.filter(f => !f.isDeleted).length === 0 && (
            <div className={`${cardBg} rounded-2xl border p-12 text-center`}>
              <Building2 size={48} className={`mx-auto ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-lg font-medium mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No companies found</p>
              <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Add a company first from Firm Management</p>
            </div>
          )}
        </>
      )}

      {/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
          LEVEL 2 -- COMPANY KE DOCUMENTS
          a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */}
      {selectedFirm && (
        <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedFirm(null)}
            className={`p-2.5 rounded-xl border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            title="Back to companies"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {firms.find(f => f.id === selectedFirm)?.name || 'Company'}
            </h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{filtered.length} documents</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { const f = firms.find(x => x.id === selectedFirm); if (f) setDetailFirm(f); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
              darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Info size={16} /> Company Details
          </button>
          <button onClick={openBulkModal} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-violet-500/25 transition">
            <Upload size={16} /> Bulk Upload
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition">
            <Plus size={18} /> Upload Document
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-2xl border p-4`}>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <Search size={18} className="opacity-50 flex-shrink-0" />
            <input type="text" placeholder="Search documents..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={inp + ' max-w-xs'}>
            <option value="all">All Categories</option>
            {categories.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {['all', 'active', 'expired', 'archived', 'review'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === s ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'review' ? 'Under Review' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {paginated.map(doc => {
          const firm         = firms.find(f => f.id === doc.firmId);
          const category     = categories.find(c => c.code === doc.categoryId);
          const status       = statuses.find(s => s.code === doc.statusId);
          const docTags      = allTags.filter(t => doc.tags.includes(t.id));
          const tagColor     = docTags[0]?.color;

          const cardStyle = tagColor
            ? { background: tagColor + (darkMode ? '22' : '18'), borderColor: tagColor + '55' }
            : undefined;

          const cardClassName = `${!tagColor ? cardBg : ''} rounded-2xl border p-5 hover:shadow-lg transition-shadow group relative overflow-hidden`;

          const dividerStyle = tagColor ? { borderColor: tagColor + '44' } : undefined;

          return (
            <div key={doc.id}
              className={cardClassName}
              style={cardStyle}
            >
              {/* Colored left-accent strip */}
              {tagColor && (
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: tagColor }} />
              )}

              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{getFileIcon(doc.fileType)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-semibold text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{doc.title}</h4>
                      {doc.gemOrderId && <Badge text={`GeM ID: ${doc.gemOrderId}`} color="#0ea5e9" />}
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{doc.documentNumber}</p>
                    {docTags.length > 0 && (
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: tagColor || '#6b7280' }}>
                        {docTags.map(t => t.name).join(' • ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {status && <Badge text={status.value} color="#6366f1" />}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><span className="font-medium">Firm:</span> {firm?.name || '--'}</p>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><span className="font-medium">Category:</span> {category?.value || '--'}</p>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><span className="font-medium">Size:</span> {formatFileSize(doc.fileSize)} - v{doc.version}</p>
                {doc.expiryDate && (
                  <p className={`text-xs ${new Date(doc.expiryDate) < new Date() ? 'text-red-500' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className="font-medium">Expires:</span> {doc.expiryDate}
                  </p>
                )}
              </div>
              <div
                className={`flex items-center justify-between mt-4 pt-3 border-t ${!dividerStyle ? (darkMode ? 'border-gray-700' : 'border-gray-100') : ''}`}
                style={dividerStyle}
              >
                <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{doc.uploadedBy} - {doc.uploadDate}</p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => setViewDoc(doc)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><Eye size={14} /></button>
                  <button onClick={() => openEdit(doc)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-500'}`}><Edit3 size={14} /></button>
                  <button onClick={() => handleDownload(doc)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-500'}`}><Download size={14} /></button>
                  {doc.isArchived ? (
                    <button onClick={async () => { try { await axios.patch(`/api/documents/${doc.id}/archive`, { isArchived: false }); dispatch({ type: 'RESTORE_DOCUMENT', payload: doc.id }); toast.success('Restored'); } catch { toast.error('Failed'); } }}
                      className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-amber-400' : 'hover:bg-amber-50 text-amber-500'}`}><RotateCcw size={14} /></button>
                  ) : (
                    <button onClick={async () => { try { await axios.patch(`/api/documents/${doc.id}/archive`, { isArchived: true }); dispatch({ type: 'ARCHIVE_DOCUMENT', payload: doc.id }); toast.success('Archived'); } catch { toast.error('Failed'); } }}
                      className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><Archive size={14} /></button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setDocToDelete(doc); }} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-500'}`}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className={`${cardBg} rounded-2xl border p-12 text-center`}>
          <FileText size={48} className={`mx-auto ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-lg font-medium mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No documents found</p>
          <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Try adjusting your filters or upload a new document</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={`${cardBg} rounded-2xl border`}>
          <Pagination
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalItems={filtered.length}
            darkMode={darkMode}
            itemLabel="documents"
            pageSizeOptions={[12, 24, 48, 96]}
          />
        </div>
      )}
        </>
      )}

      {/*  Company Details Modal  */}
      <Modal isOpen={!!detailFirm} onClose={() => setDetailFirm(null)} title="Company Details" size="lg">
        {detailFirm && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
                {detailFirm.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{detailFirm.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-sm text-blue-500">{detailFirm.firmCode}</span>
                  <Badge text={detailFirm.isActive ? 'Active' : 'Inactive'} color={detailFirm.isActive ? '#10b981' : '#6b7280'} />
                  {detailFirm.firmType && <Badge text={detailFirm.firmType} color="#6366f1" />}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                ['GST Number', detailFirm.gstNumber],
                ['PAN Number', detailFirm.panNumber],
                ['CIN Number', detailFirm.cinNumber],
                ['GEM Seller ID', detailFirm.gemSellerId],
                ['Contact Person', detailFirm.contactPerson],
                ['Website', detailFirm.website],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                  <p className={`text-sm mt-0.5 break-all ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value || '--'}</p>
                </div>
              ))}
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
              <p className={`text-sm flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <Phone size={14} className="text-blue-500 flex-shrink-0" /> {detailFirm.mobile || '--'}
              </p>
              <p className={`text-sm flex items-center gap-2 break-all ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <Mail size={14} className="text-blue-500 flex-shrink-0" /> {detailFirm.email || '--'}
              </p>
              <p className={`text-sm flex items-start gap-2 md:col-span-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <MapPin size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <span>
                  {[detailFirm.address, detailFirm.city, detailFirm.state, detailFirm.pincode].filter(Boolean).join(', ') || '--'}
                </span>
              </p>
            </div>

            {(detailFirm.bankName || detailFirm.accountNumber) && (
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Bank Details</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    ['Bank', detailFirm.bankName],
                    ['Account Holder', detailFirm.accountHolderName],
                    ['Account No.', detailFirm.accountNumber],
                    ['IFSC', detailFirm.ifscCode],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                      <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value || '--'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center gap-3">
              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {activeDocuments.filter(d => d.firmId === detailFirm.id).length} documents in this company
              </p>
              <button
                onClick={() => { setSelectedFirm(detailFirm.id); setDetailFirm(null); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition"
              >
                <FileText size={15} /> View Docs
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/*  Upload / Edit Modal  */}
      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Document' : 'Upload Document'} size="lg">
        <StepIndicator current={docStep} darkMode={darkMode} />

        {/* - Step 1: Document Info - */}
        {docStep === 1 && (
          <div className="space-y-4">
            <p className={sec}>Step 1 -- Document Information</p>

            {/* File upload -- only on add */}
            {!editing && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                  dragOver ? 'border-blue-500 bg-blue-500/10' :
                  darkMode  ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Upload size={36} className={`mx-auto mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Drag & drop file here, or click to browse
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>PDF, Word, Excel, PowerPoint, Images, ZIP</p>
                {form.fileName && (
                  <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <span className="text-sm">{getFileIcon(form.fileType)}</span>
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{form.fileName}</span>
                    <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatFileSize(form.fileSize)}</span>
                    <button onClick={e => { e.stopPropagation(); setForm({ ...form, fileName: '', fileSize: 0, fileType: '', fileObj: null }); }}>
                      <X size={14} className="text-red-500" />
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.rar" />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Firm <span className="text-red-500">*</span></label>
                {selectedFirm ? (
                  <div className={`${inp} flex items-center justify-between cursor-not-allowed select-none`}
                    style={{ opacity: 1, pointerEvents: 'none' }}>
                    <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {firms.find(f => f.id === selectedFirm)?.name || '—'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      darkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-100 text-gray-400'
                    }`}>Locked</span>
                  </div>
                ) : (
                  <select className={inp} value={form.firmId} onChange={e => setForm({ ...form, firmId: e.target.value })}>
                    <option value="">Select Firm</option>
                    {firms.filter(f => !f.isDeleted && f.isActive).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className={lbl}>Document Title <span className="text-red-500">*</span></label>
                <input className={inp} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Enter document title" />
              </div>
              <div>
                <label className={lbl}>Status</label>
                <select className={inp} value={form.statusId} onChange={e => setForm({ ...form, statusId: e.target.value })}>
                  <option value="">Select Status</option>
                  {statuses.filter(s => s.isActive).map(s => <option key={s.code} value={s.code}>{s.value}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Issue Date</label>
                <input className={inp} type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Expiry Date</label>
                <input className={inp} type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>Description</label>
                <textarea className={`${inp} h-20 resize-none`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the document" />
              </div>
            </div>
          </div>
        )}

        {/* - Step 2: Classification - */}
        {docStep === 2 && (
          <div className="space-y-5">
            <p className={sec}>Step 2 -- Classification & Optional Details</p>

            {/* Tags */}
            <div>
              <label className={lbl}>Tags</label>
              {allTags.filter(t => !t.isDeleted).length === 0 ? (
                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>No tags configured yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allTags.filter(t => !t.isDeleted).map(tag => (
                    <button key={tag.id} onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        form.tags.includes(tag.id) ? 'text-white border-transparent' :
                        darkMode ? 'border-gray-600 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={form.tags.includes(tag.id) ? { backgroundColor: tag.color } : undefined}>
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Keywords */}
            <div>
              <label className={lbl}>Keywords</label>
              <input className={inp} value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="Space-separated keywords for better search" />
            </div>

            {/* Divider for optional section */}
            <div className={`flex items-center gap-3 pt-1`}>
              <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                <Settings2 size={12} /> Optional Details
              </div>
              <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'} -mt-2`}>
              The fields below are optional. Leave blank to skip.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>
                  Category <span className={optBadge}>optional</span>
                </label>
                <select className={inp} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Select Category</option>
                  {categories.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>
                  Department <span className={optBadge}>optional</span>
                </label>
                <select className={inp} value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">Select Department</option>
                  {departments.filter(d => d.isActive).map(d => <option key={d.code} value={d.code}>{d.value}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>
                  Document Number <span className={optBadge}>optional</span>
                </label>
                <input className={inp} value={form.documentNumber} onChange={e => setForm({ ...form, documentNumber: e.target.value })}
                  placeholder={`Auto-generated: ${form.documentNumber || 'e.g. DOC-2026-001'}`} />
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>Leave blank to use the auto-generated number</p>
              </div>
            </div>
          </div>
        )}

        {/*  Step navigation footer  */}
        <div className={`flex items-center justify-between mt-6 pt-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {DOC_STEPS.map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${
                i + 1 === docStep  ? 'w-6 h-2 bg-blue-600' :
                i + 1 < docStep   ? 'w-2 h-2 bg-emerald-500' :
                `w-2 h-2 ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`
              }`} />
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={closeModal}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              Cancel
            </button>
            {docStep > 1 && (
              <button onClick={() => setDocStep(s => s - 1)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                Back
              </button>
            )}
            {docStep < DOC_STEPS.length ? (
              <button onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition">
                <Check size={16} /> {editing ? 'Update Document' : 'Upload Document'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/*  View Modal  */}
      <Modal isOpen={!!viewDoc} onClose={() => setViewDoc(null)} title="Document Details" size="lg">
        {viewDoc && (() => {
          const firm     = firms.find(f => f.id === viewDoc.firmId);
          const category = categories.find(c => c.code === viewDoc.categoryId);
          const dept     = departments.find(d => d.code === viewDoc.departmentId);
          const status   = statuses.find(s => s.code === viewDoc.statusId);
          const docTags  = allTags.filter(t => viewDoc.tags.includes(t.id));
          return (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{getFileIcon(viewDoc.fileType)}</span>
                <div>
                  <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{viewDoc.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-sm text-blue-500">{viewDoc.documentNumber}</span>
                    {status && <Badge text={status.value} color="#6366f1" />}
                    {viewDoc.isArchived && <Badge text="Archived" color="#6b7280" />}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {([
                  ['Firm', firm?.name],
                  ...(category?.value ? [['Category', category.value]] : []),
                  ...(dept?.value ? [['Department', dept.value]] : []),
                  ['File Name', viewDoc.fileName],
                  ['File Size', formatFileSize(viewDoc.fileSize)],
                  ['Version', `v${viewDoc.version}`],
                  ['Issue Date', viewDoc.issueDate || '--'],
                  ['Expiry Date', viewDoc.expiryDate || '--'],
                  ['Uploaded By', viewDoc.uploadedBy],
                  ['Upload Date', viewDoc.uploadDate ? viewDoc.uploadDate.split('T')[0] : '--'],
                  ...(viewDoc.keywords ? [['Keywords', viewDoc.keywords]] : []),
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                    <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value || '--'}</p>
                  </div>
                ))}
              </div>
              {viewDoc.description && (
                <div>
                  <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Description</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{viewDoc.description}</p>
                </div>
              )}
              {docTags.length > 0 && (
                <div>
                  <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {docTags.map(t => <Badge key={t.id} text={t.name} color={t.color} variant="outline" />)}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => handlePreview(viewDoc)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <Eye size={16} /> Preview
                </button>
                <button onClick={() => handleDownload(viewDoc)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium">
                  <Download size={16} /> Download
                </button>
                <button onClick={() => { openEdit(viewDoc); setViewDoc(null); }} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <Edit3 size={16} /> Edit
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/*  Bulk Upload Modal  */}
      <Modal isOpen={showBulkModal} onClose={() => { if (!bulkUploading) setShowBulkModal(false); }} title="Bulk Upload Documents" size="lg">
        <div className="space-y-5">
          {/* Firm info */}
          <div className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-blue-50'}`}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {(firms.find(f => f.id === selectedFirm)?.name || '??').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{firms.find(f => f.id === selectedFirm)?.name}</p>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Files will be uploaded for this firm</p>
            </div>
          </div>

          {/* File picker */}
          {bulkResults.length === 0 && (
            <div>
              <input
                ref={bulkFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => setBulkFiles(Array.from(e.target.files || []))}
              />
              <button
                onClick={() => bulkFileInputRef.current?.click()}
                disabled={bulkUploading}
                className={`w-full border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
                  darkMode ? 'border-gray-600 hover:border-violet-500 text-gray-400 hover:text-violet-400' : 'border-gray-300 hover:border-violet-400 text-gray-500 hover:text-violet-500'
                }`}
              >
                <Upload size={32} className="mx-auto mb-3 opacity-60" />
                <p className="font-semibold text-sm">Select files (multiple)</p>
                <p className="text-xs mt-1 opacity-60">Click to browse — PDF, DOCX, XLSX, and images are all supported</p>
              </button>
              {bulkFiles.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {bulkFiles.map((f, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <span className={`font-medium truncate max-w-[280px] ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{f.name}</span>
                      <span className={`flex-shrink-0 ml-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {bulkUploading && (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Uploading... {bulkProgress} of {bulkFiles.length}</span>
                <span className="text-violet-500 font-semibold">{Math.round((bulkProgress / bulkFiles.length) * 100)}%</span>
              </div>
              <div className={`w-full h-2.5 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-300"
                  style={{ width: `${(bulkProgress / bulkFiles.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {bulkResults.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Check size={16} className="text-emerald-500" />
                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {bulkResults.filter(r => r.ok).length}/{bulkResults.length} files uploaded
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {bulkResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                    r.ok ? (darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50') : (darkMode ? 'bg-red-900/30' : 'bg-red-50')
                  }`}>
                    {r.ok
                      ? <Check size={13} className="text-emerald-500 flex-shrink-0" />
                      : <X size={13} className="text-red-500 flex-shrink-0" />}
                    <span className={`truncate ${r.ok ? (darkMode ? 'text-emerald-300' : 'text-emerald-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>{r.name}</span>
                    <span className="ml-auto flex-shrink-0 opacity-70">{r.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => { if (!bulkUploading) setShowBulkModal(false); }}
              disabled={bulkUploading}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'} disabled:opacity-40`}
            >
              {bulkResults.length > 0 && !bulkUploading ? 'Close' : 'Cancel'}
            </button>
            {bulkResults.length === 0 && (
              <button
                onClick={runBulkUpload}
                disabled={bulkUploading || bulkFiles.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkUploading ? <><Loader2 size={15} className="animate-spin" /> Uploading...</> : <><Upload size={15} /> Upload {bulkFiles.length > 0 ? `${bulkFiles.length} Files` : 'Files'}</>}
              </button>
            )}
            {bulkResults.length > 0 && !bulkUploading && (
              <button
                onClick={openBulkModal}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Upload size={15} /> Upload More
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        onConfirm={async () => {
          if (docToDelete) {
            try {
              await axios.delete(`/api/documents/${docToDelete.id}`);
              dispatch({ type: 'DELETE_DOCUMENT', payload: docToDelete.id });
              toast.success('Document deleted');
            } catch { toast.error('Failed to delete document'); }
          }
        }}
        title="Delete Document"
        message="Are you sure you want to delete this document? This cannot be undone."
        isDanger
      />
    </div>
  );
}


