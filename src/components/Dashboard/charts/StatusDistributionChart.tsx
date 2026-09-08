'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export default function StatusDistributionChart({
  data, darkMode,
}: {
  data: { name: string; value: number; color: string }[]
  darkMode: boolean
}) {
  if (data.length === 0) {
    return (
      <div className={`h-52 flex items-center justify-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        No documents
      </div>
    )
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: darkMode ? '#1f2937' : '#fff',
              border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
              borderRadius: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {data.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
            <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.name} ({s.value})</span>
          </div>
        ))}
      </div>
    </>
  )
}
