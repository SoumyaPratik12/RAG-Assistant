import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogOverlay = React.forwardRef(
  ({ className, ...props }: any, ref: any) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
);
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = React.forwardRef(
  ({ className, children, ...props }: any, ref: any) => (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg dark:bg-slate-900",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
);

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);

export const DialogTitle = React.forwardRef(
  ({ className, ...props }: any, ref: any) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
);
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef(
  ({ className, ...props }: any, ref: any) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-slate-500", className)}
      {...props}
    />
  )
);
DialogDescription.displayName = "DialogDescription";
