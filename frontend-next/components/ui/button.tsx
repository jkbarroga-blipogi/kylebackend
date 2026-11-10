import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-65 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--button-primary-hover)]",
        secondary: "border border-input bg-transparent text-foreground hover:bg-secondary",
        outline: "border border-input bg-transparent text-foreground hover:bg-secondary",
        ghost: "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-[#b4233b] text-white hover:bg-[#951e32]",
      },
      size: {
        default: "min-h-11 px-4",
        sm: "min-h-11 px-3 text-sm",
        lg: "min-h-12 px-6",
        icon: "min-h-11 min-w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
