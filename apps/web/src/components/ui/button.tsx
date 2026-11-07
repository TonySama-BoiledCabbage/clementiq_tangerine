import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "brand-gradient text-white shadow-sm hover:brightness-105 active:brightness-95",
        secondary: "bg-peach text-tangerine hover:brightness-95",
        outline: "border border-line bg-surface text-ink hover:bg-peach",
        ghost: "text-ink-2 hover:bg-peach hover:text-ink",
        danger: "bg-bad text-white hover:brightness-110",
        link: "text-tangerine underline-offset-4 hover:underline px-0",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs rounded-lg", lg: "h-12 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
