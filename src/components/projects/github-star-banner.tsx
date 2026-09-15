import { StarIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REPOSITORY_URL = "https://github.com/nexuls/logits";

type Props = {
  className?: string;
};

export default function GithubStarBanner({ className }: Props) {
  return (
    <aside
      aria-labelledby="github-star-banner-title"
      className={cn(
        "flex flex-col gap-3 overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-3",
        className,
      )}
    >
      <StarCircuitIllustration />

      <div className="flex flex-col gap-0.5">
        <p
          id="github-star-banner-title"
          className="text-base font-semibold tracking-tight"
        >
          Enjoying Logits?
        </p>
        <p className="text-sm leading-snug text-muted-foreground">
          A star on GitHub helps other people find it.
        </p>
      </div>

      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "default" }))}
      >
        <StarIcon />
        Star on GitHub
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </aside>
  );
}

// Muted on purpose: the banner sits beside the project list and should not
// out-shout it, so the LED hues are used at partial strength and without glow.
const HIGH = "stroke-(--logit-led-green)/55";
const OUT = "stroke-(--logit-led-amber)/65";
const FAINT = "stroke-muted-foreground/25";

/** Both gate outputs, from each output pin to where they meet the star. */
const OUTPUT_WIRES = [
  "M100 39 H126 Q136 39 136 49 V58 Q136 68 146 68 H178",
  "M106 97 H126 Q136 97 136 87 V78 Q136 68 146 68 H178",
];

/**
 * A small circuit that evaluates true: 1 AND 1, and 1 XOR 0, both driving a
 * star. The wire colours are the LED tokens the canvas lamps use, so it reads
 * as the app's own signals; the circuit is correct so it holds up to a second
 * look. The travelling pulses are SMIL, which ignores `prefers-reduced-motion`,
 * so they are hidden outright under it.
 */
function StarCircuitIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 14 240 108"
      className="h-auto w-full rounded-xl bg-background/60 opacity-80"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <pattern
          id="github-star-banner-grid"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="5" cy="5" r="0.7" className="fill-muted-foreground/25" />
        </pattern>
      </defs>
      <rect width="240" height="140" fill="url(#github-star-banner-grid)" />

      {/* Background circuitry, dimmed so it reads as more canvas. */}
      <g strokeWidth="1.5" className={FAINT}>
        <path d="M132 0 V12 H150 M142 22 H150" />
        <path d="M150 6 H166 A11 11 0 0 1 166 28 H150 Z" />
        <circle cx="180" cy="17" r="3" />
        <path d="M183 17 H206" />
        <path d="M160 100 L182 111 L160 122 Z" />
        <circle cx="185" cy="111" r="3" />
        <path d="M188 111 H204 V100 H216" />
        <path d="M112 132 H136 V111 H160 M136 132 V138 H150" />
      </g>
      <g className="fill-muted-foreground/25">
        <circle cx="206" cy="17" r="2" />
        <circle cx="216" cy="100" r="2" />
        <circle cx="112" cy="132" r="2" />
        <circle cx="150" cy="138" r="2" />
      </g>

      {/* Input pins. */}
      <InputPin y={28} high />
      <InputPin y={50} high />
      <InputPin y={86} high />
      <InputPin y={108} />

      {/* Input wires: lit when high, dim when low. */}
      <path
        d="M24 28 H60 M24 50 H60 M24 86 H60"
        strokeWidth="2"
        className={HIGH}
      />
      <path
        d="M24 108 H60"
        strokeWidth="2"
        className="stroke-muted-foreground/40"
      />

      {/* AND and XOR gates. */}
      <g strokeWidth="1.75" className="fill-sidebar stroke-foreground/45">
        <path d="M60 20 H81 A19 19 0 0 1 81 58 H60 Z" />
        <path d="M62 78 Q74 97 62 116 Q92 116 106 97 Q92 78 62 78 Z" />
        <path d="M56 78 Q68 97 56 116" fill="none" />
      </g>

      {/* Outputs, merging into the star. */}
      <g strokeWidth="2">
        {OUTPUT_WIRES.map((d) => (
          <path key={d} d={d} className={OUT} />
        ))}
      </g>
      <g className="motion-reduce:hidden">
        {OUTPUT_WIRES.map((d, index) => (
          <path
            key={d}
            d={d}
            strokeWidth="2"
            strokeDasharray="6 142"
            className="stroke-primary-foreground/40"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="148"
              to="0"
              dur="4s"
              begin={`${index * 2}s`}
              repeatCount="indefinite"
            />
          </path>
        ))}
      </g>
      <g className="fill-foreground/50">
        <circle cx="100" cy="39" r="2" />
        <circle cx="106" cy="97" r="2" />
      </g>

      {/* The star, with a faint halo and rays. */}
      <circle cx="200" cy="68" r="26" className="fill-(--logit-led-amber)/8" />
      <path
        d="M200 38 V32 M177 48.7 L172.4 44.8 M223 48.7 L227.6 44.8"
        strokeWidth="2"
        className="stroke-(--logit-led-amber)/40"
      />
      <path
        d="M200 48 L205 61.1 L219 61.8 L208.1 70.6 L211.8 84.2 L200 76.5 L188.2 84.2 L191.9 70.6 L181 61.8 L195 61.1 Z"
        strokeWidth="2.5"
        className="fill-(--logit-led-amber)/60 stroke-(--logit-led-amber)/60"
      />
    </svg>
  );
}

type InputPinProps = {
  y: number;
  high?: boolean;
};

function InputPin({ y, high = false }: InputPinProps) {
  return (
    <g>
      <rect
        x="6"
        y={y - 8}
        width="18"
        height="16"
        rx="4"
        strokeWidth="1.5"
        className={
          high
            ? "fill-(--logit-led-green)/8 stroke-(--logit-led-green)/45"
            : "fill-muted/30 stroke-muted-foreground/35"
        }
      />
      <text
        x="15"
        y={y + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          "font-mono text-[10px] font-semibold",
          high ? "fill-(--logit-led-green)/70" : "fill-muted-foreground/70",
        )}
      >
        {high ? "1" : "0"}
      </text>
    </g>
  );
}
