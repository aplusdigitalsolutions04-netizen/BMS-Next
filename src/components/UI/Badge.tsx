'use client'

interface BadgeProps {
  text: string;
  color?: string;
  variant?: 'solid' | 'outline';
}

export default function Badge({ text, color = '#3b82f6', variant = 'solid' }: BadgeProps) {
  if (variant === 'outline') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
        style={{ color, borderColor: color + '40', backgroundColor: color + '10' }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {text}
    </span>
  );
}

