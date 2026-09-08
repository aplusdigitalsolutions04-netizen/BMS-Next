'use client'

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Link2, Plus, Trash2, Pencil, Loader2, ExternalLink, Tag, Check, Filter, X, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import Modal from '../UI/Modal';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';
import { State } from 'country-state-city';

const indianStates = State.getStatesOfCountry('IN');

interface CategoryOption {
  code: string;
  value: string;
}

interface FirmOption {
  id: string;
  name: string;
}

interface DirectLinkEntry {
  id: string;
  entryDate: string;
  productName: string;
  link: string | null;
  catalogId: string | null;
  itemCategoryCode: string | null;
  maxAvailableQty: number | null;
  minConsigneeQty: number | null;
  mrp: number | null;
  offerPrice: number | null;
  firm: string | null;
  firmId: string | null;
  sellerLocation: string | null;
  taggedLocations: string | null;
  client: string | null;
  clientCode: string | null;
  cartingStatus: number | boolean | null;
  cartingDate: string | null;
  orderStatus: string | null;
  createdBy: string | null;
  createdOn: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  entryDate: todayStr(),
  productName: '',
  link: '',
  catalogId: '',
  itemCategoryCode: '',
  maxAvailableQty: '',
  minConsigneeQty: '',
  mrp: '',
  offerPrice: '',
  firmId: '',
  sellerLocation: '',
  taggedLocations: [] as string[],
  clientCode: '',
  cartingStatus: false,
  cartingDate: todayStr(),
  orderStatus: 'PENDING',
};

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMoney(v: number | null) {
  if (v === null || v === undefined) return '--';
  return `₹${Number(v).toLocaleString('en-IN')}`;
}

function parseTaggedLocations(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function DirectLinkManagement() {
  const { state } = useApp();
  const { darkMode } = state;

  const [entries, setEntries] = useState<DirectLinkEntry[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [clients, setClients] = useState<CategoryOption[]>([]);
  const [locations, setLocations] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  const firms: FirmOption[] = state.firms.map(f => ({ id: f.id, name: f.name }));

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [updatingInlineId, setUpdatingInlineId] = useState<string | null>(null);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const [locationTextInput, setLocationTextInput] = useState('');
  const [addingLocationInline, setAddingLocationInline] = useState(false);

  const [entryToDelete, setEntryToDelete] = useState<DirectLinkEntry | null>(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
  }`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;

  useEffect(() => { fetchEntries(); fetchCategories(); fetchClients(); fetchLocations(); }, []);

  // Background auto-refresh every 5s so an entry added/edited by another user shows up
  // here without a manual reload -- silent (isPoll) so it never flashes the loading state.
  useEffect(() => {
    const id = setInterval(() => fetchEntries(true), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setCurrentPage(1); }, [filterCategory, filterClient, filterLocation, filterDateFrom, filterDateTo, pageSize]);

  async function fetchEntries(isPoll = false) {
    if (!isPoll) setLoading(true);
    try {
      const res = await axios.get('/api/direct-links');
      setEntries(res.data);
    } catch {
      if (!isPoll) toast.error('Failed to load entries');
    } finally {
      if (!isPoll) setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const res = await axios.get('/api/master');
      const group = res.data.find((g: { code: string }) => g.code === 'ITEM_CATEGORY');
      const opts = (group?.masterData || []).map((m: { code: string; value: string }) => ({ code: m.code, value: m.value }));
      setCategories(opts);
    } catch {
      toast.error('Failed to load categories');
    }
  }

  async function fetchClients() {
    try {
      const res = await axios.get('/api/master');
      const group = res.data.find((g: { code: string }) => g.code === 'CLIENT');
      const opts = (group?.masterData || []).map((m: { code: string; value: string }) => ({ code: m.code, value: m.value }));
      setClients(opts);
    } catch {
      toast.error('Failed to load clients');
    }
  }

  async function fetchLocations() {
    try {
      const res = await axios.get('/api/master');
      const group = res.data.find((g: { code: string }) => g.code === 'LOCATION');
      const opts = (group?.masterData || []).map((m: { code: string; value: string }) => ({ code: m.code, value: m.value }));
      setLocations(opts);
    } catch {
      toast.error('Failed to load locations');
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(entry: DirectLinkEntry) {
    setEditingId(entry.id);
    setForm({
      entryDate: entry.entryDate ? entry.entryDate.slice(0, 10) : todayStr(),
      productName: entry.productName || '',
      link: entry.link || '',
      catalogId: entry.catalogId || '',
      itemCategoryCode: entry.itemCategoryCode || '',
      maxAvailableQty: entry.maxAvailableQty?.toString() || '',
      minConsigneeQty: entry.minConsigneeQty?.toString() || '',
      mrp: entry.mrp?.toString() || '',
      offerPrice: entry.offerPrice?.toString() || '',
      firmId: entry.firmId || '',
      sellerLocation: entry.sellerLocation || '',
      taggedLocations: parseTaggedLocations(entry.taggedLocations),
      clientCode: entry.clientCode || '',
      cartingStatus: !!entry.cartingStatus,
      cartingDate: entry.cartingDate ? entry.cartingDate.slice(0, 10) : todayStr(),
      orderStatus: entry.orderStatus || 'PENDING',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.productName.trim()) { toast.error('Product name is required'); return; }
    setSaving(true);
    try {
      // If a firm/client isn't selected in the dropdown, fall back to whatever text was
      // already on the entry (older entries have free-text firm/client with no id/code) --
      // otherwise saving any unrelated field would silently blank these out.
      const originalEntry = editingId ? entries.find(e => e.id === editingId) : null;
      const payload = {
        entryDate: form.entryDate,
        productName: form.productName.trim(),
        link: form.link.trim(),
        catalogId: form.catalogId.trim(),
        itemCategoryCode: form.itemCategoryCode || null,
        maxAvailableQty: form.maxAvailableQty ? parseInt(form.maxAvailableQty, 10) : null,
        minConsigneeQty: form.minConsigneeQty ? parseInt(form.minConsigneeQty, 10) : null,
        mrp: form.mrp ? parseFloat(form.mrp) : null,
        offerPrice: form.offerPrice ? parseFloat(form.offerPrice) : null,
        firm: form.firmId ? (firms.find(f => f.id === form.firmId)?.name || '') : (originalEntry?.firm || ''),
        firmId: form.firmId || null,
        sellerLocation: form.sellerLocation.trim(),
        taggedLocations: form.taggedLocations,
        client: form.clientCode ? (clients.find(c => c.code === form.clientCode)?.value || '') : (originalEntry?.client || ''),
        clientCode: form.clientCode || null,
        cartingStatus: form.cartingStatus,
        cartingDate: form.cartingDate,
        orderStatus: form.orderStatus,
        createdBy: state.currentUser?.fullName || state.currentUser?.username || 'System',
      };

      if (editingId) {
        await axios.put(`/api/direct-links/${editingId}`, payload);
        toast.success('Entry updated');
      } else {
        await axios.post('/api/direct-links', payload);
        toast.success('Entry created');
      }
      setShowForm(false);
      fetchEntries();
    } catch (e) {
      toast.error(axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  async function updateInlineField(entry: DirectLinkEntry, changes: Partial<Pick<DirectLinkEntry, 'cartingStatus' | 'cartingDate' | 'orderStatus'>>) {
    setUpdatingInlineId(entry.id);
    const updated = { ...entry, ...changes };
    try {
      const payload = {
        entryDate: updated.entryDate ? updated.entryDate.slice(0, 10) : todayStr(),
        productName: updated.productName,
        link: updated.link || '',
        catalogId: updated.catalogId || '',
        itemCategoryCode: updated.itemCategoryCode,
        maxAvailableQty: updated.maxAvailableQty,
        minConsigneeQty: updated.minConsigneeQty,
        mrp: updated.mrp,
        offerPrice: updated.offerPrice,
        firm: updated.firm || '',
        firmId: updated.firmId,
        sellerLocation: updated.sellerLocation || '',
        taggedLocations: parseTaggedLocations(updated.taggedLocations),
        client: updated.client || '',
        clientCode: updated.clientCode,
        cartingStatus: !!updated.cartingStatus,
        cartingDate: updated.cartingDate ? updated.cartingDate.slice(0, 10) : todayStr(),
        orderStatus: updated.orderStatus || 'PENDING',
      };
      await axios.put(`/api/direct-links/${entry.id}`, payload);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...changes } : e));
    } catch {
      toast.error('Failed to update entry');
    } finally {
      setUpdatingInlineId(null);
    }
  }

  async function handleDelete() {
    if (!entryToDelete) return;
    try {
      await axios.delete(`/api/direct-links/${entryToDelete.id}`);
      toast.success('Entry deleted');
      setEntries(prev => prev.filter(e => e.id !== entryToDelete.id));
    } catch {
      toast.error('Failed to delete entry');
    } finally {
      setEntryToDelete(null);
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) { toast.error('Enter a category name'); return; }
    setSavingCategory(true);
    try {
      const code = newCategoryName.trim().toUpperCase().replace(/\s+/g, '_');
      await axios.post('/api/master/ITEM_CATEGORY', { code, value: newCategoryName.trim() });
      toast.success('Category added');
      setNewCategoryName('');
      setShowNewCategory(false);
      await fetchCategories();
      setForm(f => ({ ...f, itemCategoryCode: code }));
    } catch {
      toast.error('Failed to add category (it may already exist)');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleAddClient() {
    if (!newClientName.trim()) { toast.error('Enter a client name'); return; }
    setSavingClient(true);
    try {
      const code = newClientName.trim().toUpperCase().replace(/\s+/g, '_');
      await axios.post('/api/master/CLIENT', { code, value: newClientName.trim() });
      toast.success('Client added');
      setNewClientName('');
      setShowNewClient(false);
      await fetchClients();
      setForm(f => ({ ...f, clientCode: code }));
    } catch {
      toast.error('Failed to add client (it may already exist)');
    } finally {
      setSavingClient(false);
    }
  }

  // Adds a location by its display name -- if it already exists in the LOCATION master,
  // just selects it; otherwise creates it first (same as the "+Add" modal) then selects it.
  // Used by both the inline "write" input and the "select state" dropdown.
  async function quickAddLocation(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = locations.find(l => l.value.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setForm(f => f.taggedLocations.includes(existing.code) ? f : { ...f, taggedLocations: [...f.taggedLocations, existing.code] });
      return;
    }
    setAddingLocationInline(true);
    try {
      const code = trimmed.toUpperCase().replace(/\s+/g, '_');
      await axios.post('/api/master/LOCATION', { code, value: trimmed });
      await fetchLocations();
      setForm(f => ({ ...f, taggedLocations: [...f.taggedLocations, code] }));
    } catch {
      toast.error('Failed to add location (it may already exist)');
    } finally {
      setAddingLocationInline(false);
    }
  }

  function toggleTaggedLocation(code: string) {
    setForm(f => ({
      ...f,
      taggedLocations: f.taggedLocations.includes(code)
        ? f.taggedLocations.filter(c => c !== code)
        : [...f.taggedLocations, code],
    }));
  }

  async function deleteLocation(code: string) {
    try {
      await axios.delete(`/api/master/LOCATION/${code}`);
      setLocations(prev => prev.filter(l => l.code !== code));
      setForm(f => ({ ...f, taggedLocations: f.taggedLocations.filter(c => c !== code) }));
      toast.success('Location removed');
    } catch {
      toast.error('Failed to remove location');
    }
  }

  const categoryName = (code: string | null) => categories.find(c => c.code === code)?.value || '--';
  const clientName = (code: string | null) => clients.find(c => c.code === code)?.value || '--';
  const firmName = (id: string | null) => firms.find(f => f.id === id)?.name || '--';

  const filteredEntries = entries.filter(entry => {
    if (filterCategory && entry.itemCategoryCode !== filterCategory) return false;
    if (filterClient && entry.clientCode !== filterClient) return false;
    if (filterLocation && !parseTaggedLocations(entry.taggedLocations).includes(filterLocation)) return false;
    if (filterDateFrom && entry.entryDate.slice(0, 10) < filterDateFrom) return false;
    if (filterDateTo && entry.entryDate.slice(0, 10) > filterDateTo) return false;
    return true;
  });

  const paginatedEntries = filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function exportToExcel() {
    if (filteredEntries.length === 0) { toast.error('No entries to export'); return; }

    const rows = filteredEntries.map(entry => ({
      'Entry Date': entry.entryDate ? entry.entryDate.slice(0, 10) : '',
      'Product Name': entry.productName,
      'Link': entry.link || '',
      'Catalog ID': entry.catalogId || '',
      'Category': categories.find(c => c.code === entry.itemCategoryCode)?.value || '',
      'Max Available Qty': entry.maxAvailableQty ?? '',
      'Min Consignee Qty': entry.minConsigneeQty ?? '',
      'MRP': entry.mrp ?? '',
      'Offer Price': entry.offerPrice ?? '',
      'Firm': entry.firm || '',
      'Seller Location': entry.sellerLocation || '',
      'Tagged Locations': parseTaggedLocations(entry.taggedLocations)
        .map(code => locations.find(l => l.code === code)?.value || code)
        .join(', '),
      'Client': entry.client || '',
      'Carting Status': entry.cartingStatus ? 'Yes' : 'No',
      'Carting Date': entry.cartingDate ? entry.cartingDate.slice(0, 10) : '',
      'Order Status': entry.orderStatus || '',
      'Created By': entry.createdBy || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Direct Link');
    XLSX.writeFile(workbook, `direct-link-entries-${todayStr()}.xlsx`);
  }

  const hasActiveFilters = !!(filterCategory || filterClient || filterLocation || filterDateFrom || filterDateTo);
  function clearFilters() {
    setFilterCategory('');
    setFilterClient('');
    setFilterLocation('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary} flex items-center gap-2.5`}>
            Direct Link
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
              {filteredEntries.length} {hasActiveFilters ? `of ${entries.length}` : ''}
            </span>
          </h2>
          <p className={`text-sm ${textSecondary}`}>Track product listings with pricing and availability</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
              darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Download size={17} /> Export to Excel
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition"
          >
            <Plus size={17} /> New Entry
          </button>
        </div>
      </div>

      {!loading && entries.length > 0 && (
        <div className={`${cardBg} rounded-2xl border p-4 flex flex-wrap items-end gap-3`}>
          <div className="flex items-center gap-1.5 pb-2.5 text-sm font-semibold flex-shrink-0">
            <Filter size={15} className={textSecondary} />
            <span className={textPrimary}>Filters</span>
          </div>
          <div className="min-w-[160px]">
            <label className={labelClass}>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={inputClass}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className={labelClass}>Client</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className={inputClass}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className={labelClass}>Location</label>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className={inputClass}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.code} value={l.code}>{l.value}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className={labelClass}>From Date</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div className="min-w-[150px]">
            <label className={labelClass}>To Date</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className={inputClass} />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition flex-shrink-0 ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <X size={14} /> Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 size={22} className="animate-spin text-blue-500" />
          <span className={`text-sm ${textSecondary}`}>Loading entries...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <Link2 size={52} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`font-semibold text-base ${textSecondary}`}>No entries yet</p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>Click &quot;New Entry&quot; to add your first direct link</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <Filter size={52} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`font-semibold text-base ${textSecondary}`}>No entries match these filters</p>
          <button onClick={clearFilters} className="text-sm text-blue-500 hover:text-blue-600 mt-1">Clear filters</button>
        </div>
      ) : (
        <div className={`${cardBg} rounded-2xl border overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={darkMode ? 'bg-gray-900/50' : 'bg-gray-100'}>
                {['#', 'Date', 'Product', 'Catalog ID', 'Category', 'Firm', 'Client', 'Seller Location', 'Tagged Locations', 'MRP', 'Offer Price', 'Max Qty', 'Min Qty', 'Carting', 'Carting Date', 'Order Status', ''].map(h => (
                  <th key={h} className={`text-left px-4 py-3 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.map((entry, idx) => (
                <tr key={entry.id} className={`border-t ${darkMode ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-blue-50/40'}`}>
                  <td className={`px-4 py-3 font-medium ${textSecondary}`}>{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{formatDate(entry.entryDate)}</td>
                  <td className={`px-4 py-3 font-semibold ${textPrimary}`}>
                    <div className="flex items-center gap-1.5">
                      {entry.productName}
                      {entry.link && (
                        <a href={entry.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.catalogId || '--'}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{categoryName(entry.itemCategoryCode)}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.firmId ? firmName(entry.firmId) : (entry.firm || '--')}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.clientCode ? clientName(entry.clientCode) : (entry.client || '--')}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.sellerLocation || '--'}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>
                    {parseTaggedLocations(entry.taggedLocations).length === 0 ? '--' : (
                      <div className="flex flex-wrap gap-1 max-w-[180px] max-h-[52px] overflow-y-auto pr-1">
                        {parseTaggedLocations(entry.taggedLocations).map(code => (
                          <span key={code} className={`px-1.5 py-0.5 rounded-md text-xs flex-shrink-0 ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                            {locations.find(l => l.code === code)?.value || code}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{formatMoney(entry.mrp)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-500">{formatMoney(entry.offerPrice)}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.maxAvailableQty ?? '--'}</td>
                  <td className={`px-4 py-3 ${textSecondary}`}>{entry.minConsigneeQty ?? '--'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateInlineField(entry, { cartingStatus: !entry.cartingStatus })}
                      disabled={updatingInlineId === entry.id}
                      title="Click to toggle"
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold transition hover:opacity-75 disabled:opacity-40 ${
                        entry.cartingStatus ? 'bg-emerald-100 text-emerald-700' : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500')
                      }`}
                    >
                      {entry.cartingStatus ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={entry.cartingDate ? entry.cartingDate.slice(0, 10) : ''}
                      onChange={e => updateInlineField(entry, { cartingDate: e.target.value })}
                      disabled={updatingInlineId === entry.id}
                      className={`px-2 py-1 rounded-lg text-xs border outline-none disabled:opacity-40 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateInlineField(entry, { orderStatus: entry.orderStatus === 'RECEIVED' ? 'PENDING' : 'RECEIVED' })}
                      disabled={updatingInlineId === entry.id}
                      title="Click to toggle"
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold transition hover:opacity-75 disabled:opacity-40 ${
                        entry.orderStatus === 'RECEIVED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {entry.orderStatus === 'RECEIVED' ? 'Received' : 'Pending'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openEdit(entry)} title="Edit"
                        className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-600 text-gray-300' : 'hover:bg-gray-100 text-gray-500'}`}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setEntryToDelete(entry)} title="Delete"
                        className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-red-900/30 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalItems={filteredEntries.length}
            darkMode={darkMode}
            itemLabel="entries"
          />
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={showForm} onClose={() => !saving && setShowForm(false)} title={editingId ? 'Edit Entry' : 'New Direct Link Entry'} size="lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Product Name *</label>
              <input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="e.g. Office Chair" className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Link</label>
              <input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Catalog ID</label>
              <input value={form.catalogId} onChange={e => setForm(f => ({ ...f, catalogId: e.target.value }))} placeholder="e.g. CAT-12345" className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Item Category</label>
              <div className="flex items-center gap-2">
                <select value={form.itemCategoryCode} onChange={e => setForm(f => ({ ...f, itemCategoryCode: e.target.value }))} className={inputClass}>
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
                </select>
                <button
                  onClick={() => setShowNewCategory(true)}
                  title="Add new category"
                  className={`flex-shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Maximum Availability Quantity</label>
              <input type="number" value={form.maxAvailableQty} onChange={e => setForm(f => ({ ...f, maxAvailableQty: e.target.value }))} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Minimum Consignee Quantity</label>
              <input type="number" value={form.minConsigneeQty} onChange={e => setForm(f => ({ ...f, minConsigneeQty: e.target.value }))} placeholder="0" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>MRP</label>
              <input type="number" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Offer Price</label>
              <input type="number" value={form.offerPrice} onChange={e => setForm(f => ({ ...f, offerPrice: e.target.value }))} placeholder="0.00" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Firm</label>
              <select value={form.firmId} onChange={e => setForm(f => ({ ...f, firmId: e.target.value }))} className={inputClass}>
                <option value="">Select firm...</option>
                {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Seller Location</label>
              <input value={form.sellerLocation} onChange={e => setForm(f => ({ ...f, sellerLocation: e.target.value }))} placeholder="City / State" className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Tagged Locations <span className={`font-normal ${textSecondary}`}>(which location(s) this link is for)</span></label>

              <div className="flex items-center gap-2 mb-2">
                <input
                  value={locationTextInput}
                  onChange={e => setLocationTextInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      quickAddLocation(locationTextInput);
                      setLocationTextInput('');
                    }
                  }}
                  placeholder="Type a location and press Enter..."
                  disabled={addingLocationInline}
                  className={inputClass}
                />
                <select
                  value=""
                  onChange={e => { if (e.target.value) quickAddLocation(e.target.value); }}
                  disabled={addingLocationInline}
                  className={inputClass}
                  style={{ maxWidth: '200px' }}
                >
                  <option value="">Select state...</option>
                  {indianStates.map(s => <option key={s.isoCode} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div className={`flex flex-wrap gap-2 mb-2 max-h-32 overflow-y-auto p-1 rounded-xl border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                {locations.map(l => {
                  const selected = form.taggedLocations.includes(l.code);
                  return (
                    <span
                      key={l.code}
                      className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-semibold border transition flex-shrink-0 ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : (darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-600')
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTaggedLocation(l.code)}
                        className={`flex items-center gap-1 ${!selected && (darkMode ? 'hover:text-white' : 'hover:text-gray-900')}`}
                      >
                        {selected && <Check size={11} className="-mt-0.5" />}
                        {l.value}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLocation(l.code)}
                        title="Remove this location permanently"
                        className={`rounded-full p-0.5 ${selected ? 'hover:bg-blue-700' : (darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200')}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Client</label>
              <div className="flex items-center gap-2">
                <select value={form.clientCode} onChange={e => setForm(f => ({ ...f, clientCode: e.target.value }))} className={inputClass}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.code} value={c.code}>{c.value}</option>)}
                </select>
                <button
                  onClick={() => setShowNewClient(true)}
                  title="Add new client"
                  className={`flex-shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

        <div className="flex gap-3 mt-6">
          <button onClick={() => setShowForm(false)} disabled={saving}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg transition disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Entry'}
          </button>
        </div>
      </Modal>

      {/* Quick add-category modal */}
      <Modal isOpen={showNewCategory} onClose={() => !savingCategory && setShowNewCategory(false)} title="New Item Category" size="sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
            <Tag size={18} />
          </div>
          <p className={`text-sm ${textSecondary}`}>Add a new category without leaving the form</p>
        </div>
        <label className={labelClass}>Category Name</label>
        <input
          autoFocus
          value={newCategoryName}
          onChange={e => setNewCategoryName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
          placeholder="e.g. Electronics"
          className={`${inputClass} mb-5`}
        />
        <div className="flex gap-3">
          <button onClick={() => setShowNewCategory(false)} disabled={savingCategory}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Cancel
          </button>
          <button onClick={handleAddCategory} disabled={savingCategory}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg transition disabled:opacity-50">
            {savingCategory ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {savingCategory ? 'Adding...' : 'Add Category'}
          </button>
        </div>
      </Modal>

      {/* Quick add-client modal */}
      <Modal isOpen={showNewClient} onClose={() => !savingClient && setShowNewClient(false)} title="New Client" size="sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
            <Tag size={18} />
          </div>
          <p className={`text-sm ${textSecondary}`}>Add a new client without leaving the form</p>
        </div>
        <label className={labelClass}>Client Name</label>
        <input
          autoFocus
          value={newClientName}
          onChange={e => setNewClientName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddClient()}
          placeholder="e.g. XYZ Corp"
          className={`${inputClass} mb-5`}
        />
        <div className="flex gap-3">
          <button onClick={() => setShowNewClient(false)} disabled={savingClient}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Cancel
          </button>
          <button onClick={handleAddClient} disabled={savingClient}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg transition disabled:opacity-50">
            {savingClient ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {savingClient ? 'Adding...' : 'Add Client'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!entryToDelete}
        onClose={() => setEntryToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Entry"
        message={`Delete "${entryToDelete?.productName}"? This cannot be undone.`}
        isDanger
      />
    </div>
  );
}
