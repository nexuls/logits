"use client";

import { AlignCenter, AlignLeft, AlignRight, Download } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { PAGE_SIZE_OPTIONS } from "./constants";
import type {
  BandOptions,
  EdgeInset,
  HorizontalAlign,
  PageNumberPlacement,
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

const ORIENTATIONS: { value: PageOrientation; label: string }[] = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const PAGE_NUMBER_PLACEMENTS: { value: PageNumberPlacement; label: string }[] =
  [
    { value: "none", label: "None" },
    { value: "header", label: "With header" },
    { value: "footer", label: "With footer" },
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

function AlignToggle({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: HorizontalAlign;
  onChange: (next: HorizontalAlign) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as HorizontalAlign);
      }}
      aria-label={ariaLabel}
      className="justify-start border"
      disabled={disabled}
    >
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function BandFields({
  idPrefix,
  label,
  placeholder,
  value,
  onChange,
}: {
  idPrefix: string;
  label: string;
  placeholder?: string;
  value: BandOptions;
  onChange: (next: BandOptions) => void;
}) {
  const update = <Key extends keyof BandOptions>(
    key: Key,
    next: BandOptions[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label
          className="text-xs uppercase tracking-wide text-muted-foreground"
          htmlFor={`${idPrefix}-text`}
        >
          {label} text
        </Label>
        <Input
          id={`${idPrefix}-text`}
          value={value.text}
          placeholder={placeholder}
          onChange={(event) => update("text", event.target.value)}
          className="h-8"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Align
        </Label>
        <AlignToggle
          ariaLabel={`${label} alignment`}
          value={value.align}
          onChange={(next) => update("align", next)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label
            htmlFor={`${idPrefix}-size`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Size (pt)
          </Label>
          <Input
            id={`${idPrefix}-size`}
            type="number"
            min={6}
            max={24}
            step={1}
            value={value.fontSize}
            onChange={(event) =>
              update("fontSize", toNumber(event, value.fontSize))
            }
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${idPrefix}-padding`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Padding (mm)
          </Label>
          <Input
            id={`${idPrefix}-padding`}
            type="number"
            min={0}
            step={1}
            value={value.padding}
            onChange={(event) =>
              update("padding", toNumber(event, value.padding))
            }
            className="h-8"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
        <Label
          htmlFor={`${idPrefix}-border`}
          className="cursor-pointer text-sm"
        >
          Separator line
        </Label>
        <Switch
          id={`${idPrefix}-border`}
          checked={value.border}
          onCheckedChange={(checked) => update("border", checked)}
        />
      </div>
    </div>
  );
}

function Subgroup({
  itemValue,
  title,
  summary,
  children,
}: {
  itemValue: string;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={itemValue}
      className="overflow-hidden border-b border-border"
    >
      <AccordionTrigger className="w-full gap-2 px-3 py-2 hover:bg-muted/60 hover:no-underline">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium">{title}</span>
          {summary ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-3 px-2 pb-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

function bandSummary(band: BandOptions): string {
  const text = band.text.trim() || "No text";
  return `${text} · ${band.align} · ${band.fontSize}pt`;
}

function pageNumberSummary(options: PdfOptions): string {
  if (options.pageNumberPlacement === "none") return "Hidden";
  const host = options.pageNumberPlacement === "header" ? "header" : "footer";
  return `In ${host} · ${options.pageNumberAlign}`;
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
        <Label
          className="text-xs uppercase tracking-wide text-muted-foreground"
          htmlFor="pdf-title"
        >
          Title
        </Label>
        <Input
          id="pdf-title"
          value={options.title}
          onChange={(event) => update("title", event.target.value)}
          className="h-8"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Page size
          </Label>
          <Select
            value={options.pageSize}
            onValueChange={(value) => update("pageSize", value as PageSize)}
          >
            <SelectTrigger className="h-8 w-full">
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
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Orientation
          </Label>
          <Select
            value={options.orientation}
            onValueChange={(value) =>
              update("orientation", value as PageOrientation)
            }
          >
            <SelectTrigger className="h-8 w-full">
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
            Show page & content size and header / footer bands.
          </span>
        </div>
        <Switch
          id="pdf-visualize-layout"
          checked={options.visualizeLayout}
          onCheckedChange={(checked) => update("visualizeLayout", checked)}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Header, footer & page numbers
        </Label>

        <Accordion type="multiple" className="border rounded-lg">
          <Subgroup
            itemValue="header"
            title="Header"
            summary={bandSummary(options.header)}
          >
            <BandFields
              idPrefix="pdf-header"
              label="Header"
              value={options.header}
              onChange={(next) => update("header", next)}
            />
          </Subgroup>

          <Subgroup
            itemValue="footer"
            title="Footer"
            summary={bandSummary(options.footer)}
          >
            <BandFields
              idPrefix="pdf-footer"
              label="Footer"
              value={options.footer}
              onChange={(next) => update("footer", next)}
            />
          </Subgroup>

          <Subgroup
            itemValue="page-numbers"
            title="Page numbers"
            summary={pageNumberSummary(options)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Placement
                  </Label>
                  <Select
                    value={options.pageNumberPlacement}
                    onValueChange={(value) =>
                      update(
                        "pageNumberPlacement",
                        value as PageNumberPlacement,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_NUMBER_PLACEMENTS.map((placement) => (
                        <SelectItem
                          key={placement.value}
                          value={placement.value}
                        >
                          {placement.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Align
                  </Label>
                  <AlignToggle
                    ariaLabel="Page number alignment"
                    disabled={options.pageNumberPlacement === "none"}
                    value={options.pageNumberAlign}
                    onChange={(next) => update("pageNumberAlign", next)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                  htmlFor="pdf-page-number-format"
                >
                  Format
                </Label>
                <Input
                  id="pdf-page-number-format"
                  value={options.pageNumberFormat}
                  onChange={(event) =>
                    update("pageNumberFormat", event.target.value)
                  }
                  placeholder="{n} / {total}"
                  className="h-8"
                />
                <p className="text-[11px] text-muted-foreground">
                  Use <code>{"{n}"}</code> for the current page and{" "}
                  <code>{"{total}"}</code> for the total count.
                </p>
              </div>
            </div>
          </Subgroup>
        </Accordion>
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
