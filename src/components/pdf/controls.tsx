"use client";

import { Download } from "lucide-react";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { PAGE_SIZE_OPTIONS } from "./constants";
import type {
  EdgeInset,
  PageNumberPosition,
  PageOrientation,
  PageSize,
  PdfOptions,
} from "./types";

type Props = {
  options: PdfOptions;
  onChangeAction: (options: PdfOptions) => void;
  onExportAction: () => void;
  className?: string;
};

const PAGE_NUMBER_POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "none", label: "None" },
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

const ORIENTATIONS: { value: PageOrientation; label: string }[] = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

function toNumber(event: ChangeEvent<HTMLInputElement>, fallback: number) {
  const parsed = Number(event.target.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function EdgeInsetFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EdgeInset;
  onChange: (next: EdgeInset) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} (mm)
      </Label>
      <div className="grid grid-cols-4 gap-1.5">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <div key={side} className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground capitalize">
              {side}
            </span>
            <Input
              type="number"
              min={0}
              step={1}
              value={value[side]}
              onChange={(event) =>
                onChange({ ...value, [side]: toNumber(event, value[side]) })
              }
              className="h-8"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PdfControls({
  options,
  onChangeAction,
  onExportAction,
  className,
}: Props) {
  const update = <Key extends keyof PdfOptions>(
    key: Key,
    value: PdfOptions[Key],
  ) => {
    onChangeAction({ ...options, [key]: value });
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4",
        className,
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pdf-title">Title</Label>
        <Input
          id="pdf-title"
          value={options.title}
          onChange={(event) => update("title", event.target.value)}
          className="h-8"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>Page size</Label>
          <Select
            value={options.pageSize}
            onValueChange={(value) => update("pageSize", value as PageSize)}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Orientation</Label>
          <Select
            value={options.orientation}
            onValueChange={(value) =>
              update("orientation", value as PageOrientation)
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORIENTATIONS.map((orientation) => (
                <SelectItem key={orientation.value} value={orientation.value}>
                  {orientation.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <EdgeInsetFields
        label="Margin"
        value={options.margin}
        onChange={(next) => update("margin", next)}
      />

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex flex-col">
          <Label
            htmlFor="pdf-visualize-layout"
            className="cursor-pointer text-sm"
          >
            Visualize layout
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Highlight the margin band.
          </span>
        </div>
        <Switch
          id="pdf-visualize-layout"
          checked={options.visualizeLayout}
          onCheckedChange={(checked) => update("visualizeLayout", checked)}
        />
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label>Page numbers</Label>
        <Select
          value={options.pageNumbers}
          onValueChange={(value) =>
            update("pageNumbers", value as PageNumberPosition)
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_NUMBER_POSITIONS.map((position) => (
              <SelectItem key={position.value} value={position.value}>
                {position.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pdf-page-number-format">Page number format</Label>
        <Input
          id="pdf-page-number-format"
          value={options.pageNumberFormat}
          onChange={(event) => update("pageNumberFormat", event.target.value)}
          placeholder="{n} / {total}"
          className="h-8"
        />
        <p className="text-[11px] text-muted-foreground">
          Use <code>{"{n}"}</code> for the current page and{" "}
          <code>{"{total}"}</code> for the total count.
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="pdf-header">Header text</Label>
          <Input
            id="pdf-header"
            value={options.headerText}
            onChange={(event) => update("headerText", event.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdf-footer">Footer text</Label>
          <Input
            id="pdf-footer"
            value={options.footerText}
            onChange={(event) => update("footerText", event.target.value)}
            className="h-8"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pdf-content-scale">Overall size</Label>
          <span className="text-xs text-muted-foreground">
            {Math.round(options.contentScale)}%
          </span>
        </div>
        <Slider
          id="pdf-content-scale"
          min={75}
          max={150}
          step={1}
          value={[options.contentScale]}
          onValueChange={([value]) => update("contentScale", value ?? 100)}
          aria-label="Overall content size"
        />
      </div>

      <div className="mt-auto pt-2">
        <Button type="button" className="w-full" onClick={onExportAction}>
          <Download className="size-4" />
          Export PDF
        </Button>
      </div>
    </div>
  );
}
