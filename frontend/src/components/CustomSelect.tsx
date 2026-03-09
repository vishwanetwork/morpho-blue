interface Option {
  label: string;
  value: string;
}

export function CustomSelect({ value, onChange, options, placeholder }: { value: string, onChange: (val: string) => void, options: Option[], placeholder?: string }) {
  return (
    <select 
      value={value} 
      onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 font-medium"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
