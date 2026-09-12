"use client"

type SettingsPlaceholderProps = {
  title: string
  description?: string
}

export function SettingsPlaceholder({ title, description }: SettingsPlaceholderProps) {
  return (
    <div className="space-y-4">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {description && <p className="text-xs text-zinc-400 mt-1">{description}</p>}
      </div>
      <div className="p-12 border border-zinc-800/80 rounded-xl bg-[#181a24] text-center text-zinc-500 text-sm">
        Placeholder configuration view for <strong className="text-zinc-300">{title}</strong>.
      </div>
    </div>
  )
}
