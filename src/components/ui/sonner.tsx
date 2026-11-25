import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 font-sans text-[13px] text-card-foreground shadow-lg",
          title: "font-semibold leading-5",
          description: "text-[13px] leading-5 text-muted-foreground",
          actionButton: "rounded-md bg-primary px-3 py-1.5 text-primary-foreground",
          cancelButton: "rounded-md border border-border bg-muted px-3 py-1.5 text-foreground",
          success: "border-border [&_[data-icon]]:text-primary",
          error: "border-destructive/40 [&_[data-icon]]:text-destructive",
          warning: "border-amber-400/50 [&_[data-icon]]:text-amber-600",
          info: "border-border [&_[data-icon]]:text-primary",
          closeButton: "border-border bg-card text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
