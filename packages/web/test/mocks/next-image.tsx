import React from "react";

export default function Image({
  alt,
  src,
  priority: _priority,
  fill: _fill,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
  fill?: boolean;
}) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return React.createElement("img", { alt, src, ...props });
}
