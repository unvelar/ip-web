type BrandMarkProps = {
  className?: string;
};

const brandMarkSrc = `${import.meta.env.BASE_URL}logo/192x192.png`;

export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <img
      className={className}
      src={brandMarkSrc}
      width="192"
      height="192"
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}
