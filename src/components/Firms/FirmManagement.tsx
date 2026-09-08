'use client'

import { useState } from 'react';
import axios from 'axios';
import { useApp } from '../../store/AppContext';
import { useRouter } from 'next/navigation';
import { generateFirmCode } from '../../utils/helpers';
import Modal from '../UI/Modal';
import DataTable from '../UI/DataTable';
import Badge from '../UI/Badge';
import type { Firm } from '../../types';
import { Plus, Edit3, Trash2, Power, Eye, Search, Filter, Copy, Check, ChevronRight, Building2, FileText, CreditCard } from 'lucide-react';
import { logAudit } from '../../utils/auditLogger';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import SearchableSelect from '../UI/SearchableSelect';
import { State, City } from 'country-state-city';

const indianStates = State.getStatesOfCountry('IN');

const emptyFirm: Omit<Firm, 'id' | 'firmCode' | 'createdBy' | 'createdOn' | 'updatedBy' | 'updatedOn'> = {
  name: '', gstNumber: '', panNumber: '', cinNumber: '', gemSellerId: '', firmType: 'Private Limited',
  contactPerson: '', mobile: '', email: '', website: '', address: '',
  accountHolderName: '', accountNumber: '', ifscCode: '', bankName: '',
  state: '', city: '', pincode: '', logoUrl: '', remarks: '',
  isActive: true, isDeleted: false,
};

//  Step Indicator 
const FIRM_STEPS = [
  { label: 'Basic Info',        icon: Building2 },
  { label: 'Business Details',  icon: FileText  },
  { label: 'Account Details',   icon: CreditCard },
];

function StepIndicator({ current, darkMode }: { current: number; darkMode: boolean }) {
  return (
    <div className="flex items-center mb-6">
      {FIRM_STEPS.map((s, i) => {
        const done    = i + 1 < current;
        const active  = i + 1 === current;
        const Icon    = s.icon;
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
            {i < FIRM_STEPS.length - 1 && (
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
export default function FirmManagement() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { darkMode, firms } = state;

  const [showModal,    setShowModal]    = useState(false);
  const [formStep,     setFormStep]     = useState(1);
  const [editingFirm,  setEditingFirm]  = useState<Firm | null>(null);
  const [viewingFirm,  setViewingFirm]  = useState<Firm | null>(null);
  const [firmToDelete, setFirmToDelete] = useState<string | null>(null);
  const [formData,     setFormData]     = useState(emptyFirm);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const activeFirms   = firms.filter(f => !f.isDeleted);
  const filteredFirms = activeFirms.filter(f => {
    const matchesSearch = !searchQuery ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.firmCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterActive === 'all' || (filterActive === 'active' ? f.isActive : !f.isActive);
    return matchesSearch && matchesFilter;
  });

  function openAdd() {
    setEditingFirm(null);
    setFormData({ ...emptyFirm, firmCode: generateFirmCode(activeFirms) } as any);
    setFormStep(1);
    setShowModal(true);
  }

  function openEdit(firm: Firm) {
    setEditingFirm(firm);
    setFormData(firm);
    setFormStep(1);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormStep(1);
  }

  // Validate before moving to next step
  function handleNext() {
    if (formStep === 1 && !formData.name.trim()) {
      toast.error('Firm Name is required');
      return;
    }
    setFormStep(s => s + 1);
  }

  async function handleSave() {
    if (!formData.name.trim()) { toast.error('Firm Name is required'); return; }

    try {
      const firmTypeGroup = state.masterGroups?.find(g => g.code === 'FIRM_TYPE');
      const selectedMasterData = firmTypeGroup?.masterData?.find(m => m.value === formData.firmType);
      if (!selectedMasterData) {
        toast.error(`Firm type '${formData.firmType}' not found in master data.`);
        return;
      }
      const firmTypeCode = selectedMasterData.code;
      // Left blank, the server auto-generates the next code; typed in, it's the user's
      // explicit choice and the server validates it's unique instead of silently swapping
      // it for a generated one.
      const firmCode = (formData as any).firmCode?.trim() || undefined;
      const payload = {
        name: formData.name, firmCode, panNumber: formData.panNumber, gstNumber: formData.gstNumber,
        cinNumber: formData.cinNumber, gemSellerId: formData.gemSellerId, firmTypeCode,
        contactPerson: formData.contactPerson, email: formData.email, mobile: formData.mobile,
        website: formData.website, accountHolderName: formData.accountHolderName,
        accountNumber: formData.accountNumber, ifscCode: formData.ifscCode, bankName: formData.bankName,
        address: formData.address, city: formData.city, state: formData.state, pincode: formData.pincode,
        uploadedBy: state.currentUser?.fullName || state.currentUser?.username,
      };

      if (editingFirm) {
        const res = await axios.put(`/api/firms/${editingFirm.id}`, payload);
        const f = res.data;
        const mapped = {
          ...editingFirm, ...f,
          firmType: f.type?.value || formData.firmType,
          address: formData.address, city: formData.city,
          state: formData.state, pincode: formData.pincode,
          updatedBy: state.currentUser.id,
          updatedOn: new Date().toISOString().split('T')[0],
        };
        dispatch({ type: 'UPDATE_FIRM', payload: mapped });
        logAudit({ userId: state.currentUser?.id || 'sys', userName: state.currentUser?.fullName || 'System', action: 'Update', module: 'Firms', details: `Updated firm '${mapped.name}'` }, dispatch);
        toast.success('Firm updated successfully');
      } else {
        const res = await axios.post('/api/firms', payload);
        const f = res.data;
        const mapped = { ...f, firmType: f.type?.value || formData.firmType, address: formData.address, city: formData.city, state: formData.state, pincode: formData.pincode };
        dispatch({ type: 'ADD_FIRM', payload: mapped });
        logAudit({ userId: state.currentUser?.id || 'sys', userName: state.currentUser?.fullName || 'System', action: 'Create', module: 'Firms', details: `Created new firm '${mapped.name}'` }, dispatch);
        toast.success('Firm created successfully');
      }
      closeModal();
      setFormData(emptyFirm);
    } catch (e) {
      console.error(e);
      const msg = axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to save firm';
      toast.error(msg);
    }
  }

  async function handleToggleStatus(id: string) {
    try {
      await axios.patch(`/api/firms/${id}/toggle-status`);
      dispatch({ type: 'TOGGLE_FIRM_STATUS', payload: id });
      toast.success('Firm status updated');
    } catch { toast.error('Failed to update firm status'); }
  }

  async function handleCopyFirm(firm: Firm) {
    const lines = [
      `Firm Name: ${firm.name}`,
      firm.gstNumber && `GST Number: ${firm.gstNumber}`,
      firm.panNumber && `PAN Number: ${firm.panNumber}`,
      firm.cinNumber && `CIN Number: ${firm.cinNumber}`,
      firm.gemSellerId && `GeM Seller ID: ${firm.gemSellerId}`,
      firm.contactPerson && `Contact Person: ${firm.contactPerson}`,
      firm.mobile && `Mobile: ${firm.mobile}`,
      firm.email && `Email: ${firm.email}`,
      firm.website && `Website: ${firm.website}`,
      firm.address && `Address: ${firm.address}`,
      firm.state && `State: ${firm.state}`,
      firm.city && `City: ${firm.city}`,
      firm.pincode && `Pincode: ${firm.pincode}`,
      firm.remarks && `Remarks: ${firm.remarks}`,
    ].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(lines); toast.success('Firm data copied!'); }
    catch { toast.error('Failed to copy'); }
  }

  async function handleCopyAccount(firm: Firm) {
    const lines = [
      firm.bankName && `Bank Name: ${firm.bankName}`,
      firm.accountHolderName && `Account Holder: ${firm.accountHolderName}`,
      firm.accountNumber && `Account Number: ${firm.accountNumber}`,
      firm.ifscCode && `IFSC Code: ${firm.ifscCode}`,
    ].filter(Boolean).join('\n');
    if (!lines) { toast.error('No account details to copy'); return; }
    try { await navigator.clipboard.writeText(lines); toast.success('Account details copied!'); }
    catch { toast.error('Failed to copy'); }
  }

  //  Styles 
  const inp = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const lbl = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const sec = `text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;

  //  Table columns 
  const columns = [
    { key: 'firmCode', label: 'Code', width: '100px', render: (f: Firm) => (
      <span className="font-mono text-xs font-semibold text-blue-500">{f.firmCode}</span>
    )},
    { key: 'name', label: 'Firm Name', render: (f: Firm) => (
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold ${f.isActive ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-400'}`}>
          {f.name.charAt(0)}
        </div>
        <div>
          <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{f.name}</p>
          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{f.firmType}</p>
        </div>
      </div>
    )},
    { key: 'contactPerson', label: 'Contact', render: (f: Firm) => (
      <div>
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{f.contactPerson}</p>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{f.mobile}</p>
      </div>
    )},
    { key: 'email', label: 'Email', render: (f: Firm) => (
      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{f.email || '-'}</span>
    )},
    { key: 'city', label: 'Location', render: (f: Firm) => (
      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{[f.city, f.state].filter(Boolean).join(', ') || '--'}</span>
    )},
    { key: 'gstNumber', label: 'GST', render: (f: Firm) => (
      <span className="font-mono text-xs">{f.gstNumber || '--'}</span>
    )},
    { key: 'isActive', label: 'Status', render: (f: Firm) => (
      <Badge text={f.isActive ? 'Active' : 'Inactive'} color={f.isActive ? '#10b981' : '#ef4444'} />
    )},
    { key: 'actions', label: 'Actions', sortable: false, render: (f: Firm) => (
      <div className="flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); setViewingFirm(f); }} className={`p-2 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`} title="View"><Eye size={16} /></button>
        <button onClick={e => { e.stopPropagation(); openEdit(f); }} className={`p-2 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-500'}`} title="Edit"><Edit3 size={16} /></button>
        <button onClick={e => { e.stopPropagation(); handleToggleStatus(f.id); }} className={`p-2 rounded-lg transition ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} ${f.isActive ? 'text-amber-500' : 'text-green-500'}`} title={f.isActive ? 'Deactivate' : 'Activate'}><Power size={16} /></button>
        <button onClick={e => { e.stopPropagation(); setFirmToDelete(f.id); }} className={`p-2 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-500'}`} title="Delete"><Trash2 size={16} /></button>
      </div>
    )},
  ];

  //  Render 
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Firm Management</h2>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage all registered firms - {activeFirms.length} firms total</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition">
          <Plus size={18} /> Add New Firm
        </button>
      </div>

      {/* Search & Filters */}
      <div className={`${cardBg} rounded-2xl border p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <Search size={18} className="opacity-50" />
          <input type="text" placeholder="Search firms..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button key={f} onClick={() => setFilterActive(f)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition ${filterActive === f ? 'bg-blue-600 text-white' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
        <DataTable columns={columns} data={filteredFirms} pageSize={8} emptyMessage="No firms found" showSerial />
      </div>

      {/*  Add / Edit Modal  */}
      <Modal isOpen={showModal} onClose={closeModal} title={editingFirm ? 'Edit Firm' : 'Add New Firm'} size="lg">
        <StepIndicator current={formStep} darkMode={darkMode} />

        {/* - Step 1: Basic Info - */}
        {formStep === 1 && (
          <div className="space-y-4">
            <p className={sec}>Step 1 -- Basic Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={lbl}>Firm Name <span className="text-red-500">*</span></label>
                <input className={inp} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Enter full firm name" autoFocus />
              </div>
              <div>
                <label className={lbl}>Firm Code</label>
                <input
                  className={`${inp} font-mono`}
                  value={(formData as any).firmCode || ''}
                  onChange={e => setFormData({ ...formData, firmCode: e.target.value.toUpperCase() } as any)}
                  placeholder="e.g. FRM-005"
                />
              </div>
              <div>
                <label className={lbl}>Firm Type</label>
                <select className={inp} value={formData.firmType || ''} onChange={e => setFormData({ ...formData, firmType: e.target.value })}>
                  <option value="">Select Firm Type</option>
                  {state.masterGroups?.find(g => g.code === 'FIRM_TYPE')?.masterData?.map(m => (
                    <option key={m.code} value={m.value}>{m.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Contact Person</label>
                <input className={inp} value={formData.contactPerson || ''} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} placeholder="Full name of contact person" />
              </div>
              <div>
                <label className={lbl}>Mobile Number</label>
                <div className="flex">
                  <span className={`inline-flex items-center px-3 rounded-l-xl border border-r-0 text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-500'}`}>+91</span>
                  <input className={`${inp} rounded-l-none`} value={formData.mobile || ''} maxLength={10}
                    onChange={e => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })} placeholder="10-digit mobile" />
                </div>
              </div>
              <div>
                <label className={lbl}>Email Address</label>
                <input className={inp} type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@company.com" />
              </div>
              <div>
                <label className={lbl}>Website</label>
                <input className={inp} value={formData.website || ''} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="www.company.com" />
              </div>
            </div>
          </div>
        )}

        {/* - Step 2: Business Details - */}
        {formStep === 2 && (
          <div className="space-y-4">
            <p className={sec}>Step 2 -- Business Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>GST Number</label>
                <input className={inp} value={formData.gstNumber || ''} maxLength={15}
                  onChange={e => setFormData({ ...formData, gstNumber: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="e.g. 27AAACT2727Q1Z7" />
              </div>
              <div>
                <label className={lbl}>PAN Number</label>
                <input className={inp} value={formData.panNumber || ''} maxLength={10}
                  onChange={e => setFormData({ ...formData, panNumber: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="e.g. AAACT2727Q" />
              </div>
              <div>
                <label className={lbl}>CIN Number</label>
                <input className={inp} value={formData.cinNumber || ''} maxLength={21}
                  onChange={e => setFormData({ ...formData, cinNumber: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="21-character CIN" />
              </div>
              <div>
                <label className={lbl}>GeM Seller ID</label>
                <input className={inp} value={formData.gemSellerId || ''} maxLength={16}
                  onChange={e => setFormData({ ...formData, gemSellerId: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="GeM Seller ID" />
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>Address</label>
                <textarea className={`${inp} h-20 resize-none`} value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Full postal address" />
              </div>
              <div>
                <label className={lbl}>State</label>
                <SearchableSelect
                  className={inp}
                  darkMode={darkMode}
                  value={formData.state || ''}
                  onChange={v => setFormData({ ...formData, state: v, city: '' })}
                  options={indianStates.map(s => ({ value: s.name, label: s.name }))}
                  placeholder="Search state..."
                />
              </div>
              <div>
                <label className={lbl}>City</label>
                {(() => {
                  const stateObj = indianStates.find(s => s.name === formData.state);
                  const cities   = stateObj ? City.getCitiesOfState('IN', stateObj.isoCode) : [];
                  return cities.length > 0 ? (
                    <SearchableSelect
                      className={inp}
                      darkMode={darkMode}
                      value={formData.city || ''}
                      onChange={v => setFormData({ ...formData, city: v })}
                      options={cities.map(c => ({ value: c.name, label: c.name }))}
                      placeholder="Search city..."
                    />
                  ) : (
                    <input className={inp} value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })}
                      placeholder={formData.state ? 'Enter city name' : 'Select state first'} disabled={!formData.state} />
                  );
                })()}
              </div>
              <div>
                <label className={lbl}>Pincode</label>
                <input className={inp} value={formData.pincode || ''} maxLength={6}
                  onChange={e => setFormData({ ...formData, pincode: e.target.value.replace(/\D/g, '') })} placeholder="6-digit pincode" />
              </div>
              <div>
                <label className={lbl}>Remarks</label>
                <input className={inp} value={formData.remarks || ''} onChange={e => setFormData({ ...formData, remarks: e.target.value })} placeholder="Optional remarks" />
              </div>
            </div>
          </div>
        )}

        {/* - Step 3: Account Details - */}
        {formStep === 3 && (
          <div className="space-y-4">
            <p className={sec}>Step 3 -- Bank Account Details</p>
            <div className={`rounded-xl p-4 mb-2 ${darkMode ? 'bg-blue-900/20 border border-blue-800/40' : 'bg-blue-50 border border-blue-100'}`}>
              <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                 Bank account details are used for payment references. All fields are optional.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Bank Name</label>
                <input className={inp} value={formData.bankName || ''} onChange={e => setFormData({ ...formData, bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
              </div>
              <div>
                <label className={lbl}>Account Holder Name</label>
                <input className={inp} value={formData.accountHolderName || ''} onChange={e => setFormData({ ...formData, accountHolderName: e.target.value })} placeholder="As per bank records" />
              </div>
              <div>
                <label className={lbl}>Account Number</label>
                <input className={inp} value={formData.accountNumber || ''} maxLength={18}
                  onChange={e => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '') })} placeholder="Bank account number" />
              </div>
              <div>
                <label className={lbl}>IFSC Code</label>
                <input className={inp} value={formData.ifscCode || ''} maxLength={11}
                  onChange={e => setFormData({ ...formData, ifscCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="e.g. HDFC0001234" />
              </div>
            </div>
          </div>
        )}

        {/*  Step navigation footer  */}
        <div className={`flex items-center justify-between mt-6 pt-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {FIRM_STEPS.map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${
                i + 1 === formStep
                  ? 'w-6 h-2 bg-blue-600'
                  : i + 1 < formStep
                  ? 'w-2 h-2 bg-emerald-500'
                  : `w-2 h-2 ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`
              }`} />
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={closeModal}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              Cancel
            </button>
            {formStep > 1 && (
              <button onClick={() => setFormStep(s => s - 1)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                Back
              </button>
            )}
            {formStep < FIRM_STEPS.length ? (
              <button onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition">
                <Check size={16} /> {editingFirm ? 'Update Firm' : 'Create Firm'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/*  View Modal  */}
      <Modal isOpen={!!viewingFirm} onClose={() => setViewingFirm(null)} title="Firm Details" size="lg">
        {viewingFirm && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold ${viewingFirm.isActive ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-400'}`}>
                  {viewingFirm.name.charAt(0)}
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{viewingFirm.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-sm text-blue-500">{viewingFirm.firmCode}</span>
                    <Badge text={viewingFirm.isActive ? 'Active' : 'Inactive'} color={viewingFirm.isActive ? '#10b981' : '#ef4444'} />
                    <Badge text={viewingFirm.firmType} color="#6366f1" variant="outline" />
                  </div>
                </div>
              </div>
              <button onClick={() => handleCopyFirm(viewingFirm)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                <Copy size={16} /> Copy Data
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[['GST Number', viewingFirm.gstNumber], ['PAN Number', viewingFirm.panNumber], ['CIN Number', viewingFirm.cinNumber],
                ['GeM Seller ID', viewingFirm.gemSellerId], ['Contact Person', viewingFirm.contactPerson], ['Mobile', viewingFirm.mobile],
                ['Email', viewingFirm.email], ['Website', viewingFirm.website], ['Address', viewingFirm.address],
                ['State', viewingFirm.state], ['City', viewingFirm.city], ['Pincode', viewingFirm.pincode],
                ['Remarks', viewingFirm.remarks], ['Created On', viewingFirm.createdOn],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                  <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value || '--'}</p>
                </div>
              ))}
            </div>
            <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <h4 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Account Details</h4>
                <button onClick={() => handleCopyAccount(viewingFirm)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-white hover:bg-gray-100 border text-gray-700'}`}>
                  <Copy size={14} /> Copy Account
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[['Bank Name', viewingFirm.bankName], ['Account Holder', viewingFirm.accountHolderName],
                  ['Account Number', viewingFirm.accountNumber], ['IFSC Code', viewingFirm.ifscCode],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                    <p className={`text-sm font-mono mt-0.5 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value || '--'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Documents ({state.documents.filter(d => d.firmId === viewingFirm.id && !d.isDeleted).length})
              </p>
              <button onClick={() => { dispatch({ type: 'SELECT_FIRM', payload: viewingFirm.id }); router.push('/documents'); setViewingFirm(null); }}
                className="text-sm text-blue-500 hover:text-blue-600 font-medium">
                View Documents
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!firmToDelete}
        onClose={() => setFirmToDelete(null)}
        onConfirm={async () => {
          if (firmToDelete) {
            try {
              await axios.delete(`/api/firms/${firmToDelete}`, { data: { uploadedBy: state.currentUser?.fullName || state.currentUser?.username } });
              dispatch({ type: 'DELETE_FIRM', payload: firmToDelete });
              toast.success('Firm deleted');
            } catch { toast.error('Failed to delete firm'); }
          }
        }}
        title="Delete Firm"
        message="Are you sure you want to delete this firm? This is a soft delete."
        isDanger
      />
    </div>
  );
}


