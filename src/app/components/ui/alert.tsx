import * as React from "react"

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Alert({ className, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg border p-4 ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  )
}
