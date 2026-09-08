'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export default function UploadTrendChart({
  data, darkMode,
}: {
  data: { month: string; uploads: number; label: string }[]
  darkMode: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
        <XAxis dataKey="month" tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} />
        <YAxis tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? '#1f2937' : '#fff',
            border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
            borderRadius: '12px',
          }}
          formatter={(val) => [`${val ?? 0} documents`, 'Uploaded']}
        />
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="uploads" stroke="#10b981" fill="url(#areaGradient)" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
