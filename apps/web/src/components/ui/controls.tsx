"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative flex w-full touch-none select-none items-center py-2", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-[#e3e3e8]">
        <SliderPrimitive.Range className="absolute h-full brand-gradient" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={props["aria-label"]}
        className="block h-7 w-7 cursor-grab rounded-full bg-white shadow-[0_0.5px_4px_rgb(0_0_0/0.12),0_6px_13px_rgb(0_0_0/0.12)] transition active:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tangerine/30" />
    </SliderPrimitive.Root>
  );
}

export function Switch({ className, ...p }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition data-[state=checked]:bg-good data-[state=unchecked]:bg-[#e9e9ea]", className)} {...p}>
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex flex-wrap items-center gap-0.5 rounded-[9px] bg-[#eeeef0] p-0.5", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("cursor-pointer rounded-[7px] px-3 py-1.5 text-[13px] font-medium text-ink transition data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]", className)} {...p} />;
}

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export function DropdownMenuContent({ className, ...p }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={8} align="end" className={cn("glass z-50 min-w-56 rounded-[14px] p-1.5 text-ink", className)} {...p} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, ...p }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-peach [&_svg]:size-4 [&_svg]:text-ink-2", className)} {...p} />;
}
export function DropdownMenuLabel({ className, ...p }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-xs text-ink-2", className)} {...p} />;
}
export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export function DialogContent({ className, children, title, description, ...p }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <D.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl", className)} {...p}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description && <D.Description className="text-sm text-ink-2">{description}</D.Description>}
          </div>
          <D.Close className="cursor-pointer rounded-lg p-1 text-ink-2 hover:bg-peach" aria-label="Close"><X className="size-4" /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
