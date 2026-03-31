import type { ReactNode } from "react";
import { localCategoryLabel } from "./helpers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { LocalFontOptionsResult } from "@/lib/local-fonts";

type BuiltInOption = {
  value: string;
  label: string;
  family?: string;
};

type LocalOption = LocalFontOptionsResult["nonMonospace"][number];

type Props = {
  id: string;
  value: string;
  placeholder: string;
  builtInOptions: BuiltInOption[];
  localOptions: LocalOption[];
  onValueChange: (value: string) => void;
  triggerClassName?: string;
  localLabelSuffix?: (option: LocalOption) => ReactNode;
};

type FontPreviewProps = {
  family?: string;
  children: ReactNode;
};

function FontPreview({ family, children }: FontPreviewProps) {
  return (
    <HoverCard openDelay={60} closeDelay={0}>
      <HoverCardTrigger asChild>
        <span className="block w-full">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="pointer-events-none w-80"
      >
        <div className="" style={family ? { fontFamily: family } : undefined}>
          <p className="text-base leading-snug">
            The quick brown fox jumps over the lazy dog.
          </p>
          <p className="mt-2 text-sm leading-snug">0 1 2 3 4 5 6 7 8 9</p>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            ! @ # $ % & * ( ) - _ + = / ? , . : ; ' "
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function FontFamilySelect({
  id,
  value,
  placeholder,
  builtInOptions,
  localOptions,
  onValueChange,
  triggerClassName = "w-full min-w-48 sm:w-52",
  localLabelSuffix,
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Built-in fonts</SelectLabel>
          {builtInOptions.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <FontPreview family={item.family}>{item.label}</FontPreview>
            </SelectItem>
          ))}
        </SelectGroup>
        {localOptions.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Installed on this device</SelectLabel>
              {localOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <FontPreview family={item.family}>
                    {item.label}
                    {localLabelSuffix ? (
                      localLabelSuffix(item)
                    ) : (
                      <> ({localCategoryLabel(item.category)})</>
                    )}
                  </FontPreview>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
