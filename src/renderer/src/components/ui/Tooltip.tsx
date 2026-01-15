import { ReactElement, cloneElement, useId } from 'react'

type TooltipProps = {
  label: string
  children: ReactElement
  className?: string
}

export default function Tooltip({
  label,
  children,
  className
}: TooltipProps): React.JSX.Element {
  const id = useId()

  return (
    <span className={`tooltip-wrapper${className ? ` ${className}` : ''}`}>
      {cloneElement(children as ReactElement<any>, {
        'aria-describedby': id
      })}
      <span id={id} role="tooltip" className="tooltip-content">
        {label}
      </span>
    </span>
  )
}
