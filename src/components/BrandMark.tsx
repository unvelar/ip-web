type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="38" height="38" rx="11" fill="#1c1917" />
      <path
        d="M15 15v11.5C15 32.2 18.7 36 24 36s9-3.8 9-9.5V15"
        stroke="#fffaf0"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M15 39h18"
        stroke="#dc2626"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M31 10l6 5-6 5"
        stroke="#dc2626"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
