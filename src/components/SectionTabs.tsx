import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const SectionTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex w-full justify-start gap-4 overflow-x-auto border-b border-border",
      className,
    )}
    {...props}
  />
));
SectionTabsList.displayName = "SectionTabsList";

export const SectionTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "shrink-0 cursor-pointer whitespace-nowrap border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:border-primary data-[state=active]:text-primary",
      className,
    )}
    {...props}
  />
));
SectionTabsTrigger.displayName = "SectionTabsTrigger";
