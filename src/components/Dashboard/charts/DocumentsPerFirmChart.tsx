'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export default function DocumentsPerFirmChart({
  data, darkMode,
}: {
  data: { name: string; documents: number }[]
  darkMode: boolean
}) {
  if (data.length === 0) {
    return (
      <div className={`h-64 flex items-center justify-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
        <XAxis dataKey="name" tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} />
        <YAxis tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? '#1f2937' : '#fff',
            border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}
          labelStyle={{ color: darkMode ? '#fff' : '#111' }}
        />
        <Bar dataKey="documents" fill="url(#blueGradient)" radius={[8, 8, 0, 0]} />
        <defs>
          <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  )
}
