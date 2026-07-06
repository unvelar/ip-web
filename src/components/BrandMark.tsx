type BrandMarkProps = {
  className?: string;
};

const brandMarkSrc = `${import.meta.env.BASE_URL}logo/logo.svg`;

export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <img
      className={className}
      src={brandMarkSrc}
      width="512"
      height="512"
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}
