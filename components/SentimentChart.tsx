'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface SentimentPoint {
  date: string
  positive: number
  neutral: number
  negative: number
}

interface SentimentChartProps {
  data: SentimentPoint[]
}

export function SentimentChart({ data }: SentimentChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500">
        Not enough data to show a trend yet.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="positive"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          name="Positive"
        />
        <Line
          type="monotone"
          dataKey="neutral"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          name="Neutral"
        />
        <Line
          type="monotone"
          dataKey="negative"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="Negative"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
