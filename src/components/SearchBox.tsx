type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SearchBox({
  value,
  onChange,
  placeholder = 'Tìm từ vựng…',
}: Props) {
  return (
    <input
      className="field"
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Search vocabulary"
    />
  );
}
