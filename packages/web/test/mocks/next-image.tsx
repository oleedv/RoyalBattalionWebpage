import React from "react";

export default function Image({
  alt,
  src,
  ...props
}: {
  alt: string;
  src: string;
  [key: string]: any;
}) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return React.createElement("img", { alt, src, ...props });
}
