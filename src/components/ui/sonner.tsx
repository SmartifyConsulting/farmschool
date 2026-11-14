import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-2xl border border-navy bg-navy font-sans text-sm text-navy-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-navy-foreground/80",
          actionButton: "group-[.toast]:bg-navy-foreground/20 group-[.toast]:text-navy-foreground",
          cancelButton: "group-[.toast]:bg-navy-foreground/10 group-[.toast]:text-navy-foreground",
          success: "group-[.toast]:border-navy group-[.toast]:bg-navy group-[.toast]:text-navy-foreground",
          error: "group-[.toast]:border-destructive group-[.toast]:bg-destructive group-[.toast]:text-destructive-foreground",
          warning: "group-[.toast]:border-navy group-[.toast]:bg-navy group-[.toast]:text-navy-foreground",
          info: "group-[.toast]:border-navy group-[.toast]:bg-navy group-[.toast]:text-navy-foreground",
          closeButton: "group-[.toast]:border-navy-foreground/30 group-[.toast]:bg-navy group-[.toast]:text-navy-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
