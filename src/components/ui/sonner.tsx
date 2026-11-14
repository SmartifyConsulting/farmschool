import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-2xl border border-border bg-card font-sans text-sm text-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toast]:border-primary/40 group-[.toast]:bg-primary/10 group-[.toast]:text-foreground",
          error: "group-[.toast]:border-destructive/40 group-[.toast]:bg-destructive/10 group-[.toast]:text-foreground",
          warning: "group-[.toast]:border-border group-[.toast]:bg-muted group-[.toast]:text-foreground",
          info: "group-[.toast]:border-primary/40 group-[.toast]:bg-primary/10 group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
