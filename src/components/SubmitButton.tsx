"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that disables itself while its form's action is in flight.
 *
 * React does not do this for you — a second tap during a pending server action
 * fires the action again. On a phone that is easy to do by accident, and for
 * confirmItem it meant two identical inventory rows.
 *
 * useFormStatus reads the enclosing form, so this must be rendered *inside*
 * the <form>, not by the component that renders it.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`disabled:opacity-60 ${className}`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
