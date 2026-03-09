import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext(null)

function Tabs({ defaultValue, value, onValueChange, children, className, ...props }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const currentValue = value ?? internalValue
  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: onValueChange ?? setInternalValue }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }) {
  return (
    <div
      className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-white p-1 text-black", className)}
      {...props}
    />
  )
}

function TabsTrigger({ value, className, children, ...props }) {
  const ctx = React.useContext(TabsContext)
  const isActive = ctx.value === value
  return (
    <button
      type="button"
      role="tab"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive ? "bg-blue-100 text-black shadow-sm" : "bg-white text-black hover:bg-slate-50",
        className
      )}
      onClick={() => ctx.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  )
}

function TabsContent({ value, className, children, ...props }) {
  const ctx = React.useContext(TabsContext)
  if (ctx.value !== value) return null
  return (
    <div className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
