'use client'

import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  darkMode?: boolean;
}

// A text input that filters a dropdown list as you type -- for long option lists (e.g.
// Indian states/cities) where a plain <select> makes finding the right value tedious.
export default function SearchableSelect({ value, onChange, options, placeholder, disabled, className, darkMode }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || '';
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={className}
        value={open ? query : selectedLabel}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && (
        <div className={`absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg ${
          darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
        }`}>
          {filtered.length === 0 ? (
            <div className={`px-3 py-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No match</div>
          ) : filtered.map(o => (
            <button
              type="button"
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
              className={`block w-full text-left px-3 py-2 text-sm transition ${
                o.value === value
                  ? darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                  : darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
