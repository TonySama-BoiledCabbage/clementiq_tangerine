import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-tangerine text-white hover:bg-tangerine-bright",
        secondary: "bg-peach text-tangerine hover:brightness-[0.97]",
        outline: "bg-peach text-ink hover:brightness-[0.97]",
        ghost: "text-ink-2 hover:bg-peach hover:text-ink",
        danger: "bg-bad text-white hover:brightness-110",
        link: "text-tangerine underline-offset-4 hover:underline px-0",
      },
      size: { default: "h-11 px-5", sm: "h-9 px-4 text-[13px]", lg: "h-[50px] px-6 text-[17px]", icon: "h-11 w-11" },
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
