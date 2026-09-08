'use client';

import React, { useEffect, useRef, useState, useCallback, use } from 'react';
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import axios from 'axios';
import { Loader2, Table2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SharedSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [shareMode, setShareMode] = useState<'VIEW' | 'EDIT' | 'NONE'>('NONE');
  const [initialData, setInitialData] = useState<any[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const isInitialMount = useRef(true);
  const pendingDataRef = useRef<any[] | null>(null);
  const pendingNameRef = useRef('');
  const hasPendingSaveRef = useRef(false);
  const savingInFlightRef = useRef(false);
  const needsAnotherSaveRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await axios.get(`/api/share/sheet/${token}`);
        setSheetName(res.data.name);
        setShareMode(res.data.shareMode);
        
        const data = typeof res.data.data === 'string' ? JSON.parse(res.data.data) : res.data.data;
        const validData = Array.isArray(data) && data.length > 0 ? data : [{
          name: "Sheet1",
          color: "",
          status: 1,
          order: 0,
          celldata: [],
          config: {},
          index: "sheet_01",
        }];
        
        const sanitizedData = validData.map((sheet: any) => ({
          ...sheet,
          id: sheet.id || sheet.index || `sheet_${Math.random().toString(36).substring(2, 9)}`,
          row: sheet.row || 84,
          column: sheet.column || 60,
          defaultRowHeight: 19,
          defaultColWidth: 73,
          scrollTop: 0,
          scrollLeft: 0
        }));
        
        setInitialData(sanitizedData);
        pendingDataRef.current = sanitizedData;
        pendingNameRef.current = res.data.name;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load shared workbook');
      } finally {
        setLoading(false);
        setTimeout(() => { isInitialMount.current = false; }, 1000);
      }
    }
    loadData();
  }, [token]);

  const flushPendingSave = useCallback(() => {
    if (!hasPendingSaveRef.current || shareMode !== 'EDIT') return;
    hasPendingSaveRef.current = false;
    fetch(`/api/share/sheet/${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: pendingDataRef.current, name: pendingNameRef.current }),
      keepalive: true,
    }).catch(() => {});
  }, [token, shareMode]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSave();
    }
    window.addEventListener('beforeunload', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const performSave = useCallback(async () => {
    if (savingInFlightRef.current) {
      needsAnotherSaveRef.current = true;
      return;
    }
    savingInFlightRef.current = true;
    setSaveState('saving');
    try {
      await axios.put(`/api/share/sheet/${token}`, {
        data: pendingDataRef.current,
        name: pendingNameRef.current,
      });
      hasPendingSaveRef.current = false;
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      toast.error('Failed to save workbook');
      setSaveState('idle');
    } finally {
      savingInFlightRef.current = false;
      if (needsAnotherSaveRef.current) {
        needsAnotherSaveRef.current = false;
        performSave();
      }
    }
  }, [token]);

  const scheduleSave = useCallback((newData: any[] | null, newName?: string) => {
    if (isInitialMount.current || shareMode !== 'EDIT') return;

    if (newName !== undefined) pendingNameRef.current = newName;
    if (newData) pendingDataRef.current = newData; 
    hasPendingSaveRef.current = true;

    performSave();
  }, [performSave, shareMode]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (shareMode !== 'EDIT') return;
    const newName = e.target.value;
    setSheetName(newName);
    scheduleSave(null, newName);
  };

  const handleSheetChange = useCallback((data: any[]) => {
    if (shareMode !== 'EDIT') return;
    const dataToSave = data.map((sheet) => {
      const newCelldata: any[] = [];
      if (sheet.data && Array.isArray(sheet.data)) {
        for (let r = 0; r < sheet.data.length; r++) {
          if (!sheet.data[r]) continue;
          for (let c = 0; c < sheet.data[r].length; c++) {
            const v = sheet.data[r][c];
            if (v != null) {
              newCelldata.push({ r, c, v });
            }
          }
        }
      }
      return {
        ...sheet,
        celldata: newCelldata.length > 0 ? newCelldata : sheet.celldata,
        data: undefined
      };
    });

    scheduleSave(dataToSave);
  }, [scheduleSave, shareMode]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <Loader2 size={32} className="animate-spin text-emerald-500 mb-4" />
        <p className="text-gray-500">Loading shared workbook...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-gray-100">
          <Table2 size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const isReadOnly = shareMode === 'VIEW';

  return (
    <div className="absolute inset-0 flex flex-col w-full h-full bg-white" onWheel={(e) => e.stopPropagation()}>
      {/* Top Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b shrink-0 z-10 bg-white border-gray-200 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
          <Table2 size={20} />
        </div>
        <div className="flex flex-col">
          {isReadOnly ? (
            <h1 className="font-bold text-lg text-gray-900 leading-tight">{sheetName}</h1>
          ) : (
            <input
              value={sheetName}
              onChange={handleNameChange}
              className="font-bold text-lg bg-transparent outline-none text-gray-900 leading-tight border-b border-transparent focus:border-gray-300 transition-colors"
              placeholder="Untitled Workbook"
            />
          )}
          <div className="text-xs flex items-center gap-1.5 mt-0.5 text-gray-500 font-medium">
            {isReadOnly ? (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">View Only</span>
            ) : (
              <>
                <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full mr-2">Editable</span>
                {saveState === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving...</>}
                {saveState === 'saved' && <><Check size={12} className="text-emerald-500" /> Saved</>}
                {saveState === 'idle' && <span>All changes saved</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Container */}
      <div className="flex-1 relative w-full h-full">
        <style>{`
          .fortune-add-row { display: none !important; }
          ${isReadOnly ? `
            .fortune-toolbar { display: none !important; }
            .fortune-sheet-container { pointer-events: none !important; }
            .fortune-sheet-container .fortune-scrollbar-x, 
            .fortune-sheet-container .fortune-scrollbar-y,
            .fortune-sheet-area { pointer-events: auto !important; }
          ` : ''}
        `}</style>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Workbook
            data={initialData}
            onChange={isReadOnly ? () => {} : handleSheetChange}
            lang="en"
            currency="₹"
          />
        </div>
      </div>
    </div>
  );
}
