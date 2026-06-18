/**
 * Round avatar for a signed-in user. Falls back to a slate circle with the
 * user's initial when `pictureUrl` is null (or when the image fails to load).
 */
import { useState } from "react";

interface Props {
  pictureUrl: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}

export default function Avatar({ pictureUrl, name, size = 32, className = "" }: Props) {
  const [errored, setErrored] = useState(false);
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const showImage = pictureUrl && !errored;

  const style = { width: size, height: size, fontSize: size * 0.42 };

  if (showImage) {
    return (
      <img
        src={pictureUrl}
        alt={name ?? ""}
        onError={() => setErrored(true)}
        style={style}
        className={`rounded-full object-cover bg-stone-100 ${className}`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`rounded-full bg-gradient-to-br from-stone-200 to-stone-300 text-stone-600 font-bold flex items-center justify-center ${className}`}
    >
      {initial}
    </div>
  );
}
