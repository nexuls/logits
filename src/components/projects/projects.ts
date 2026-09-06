export type Project = {
  id: string;
  name: string;
  /**
   * Pre-formatted so the label is identical on the server and the client —
   * deriving it from `Date.now()` at render time would hydrate mismatched.
   */
  updatedLabel: string;
  nodeCount: number;
  pinned?: boolean;
};

export const SAMPLE_PROJECTS: Project[] = [
  {
    id: "half-adder",
    name: "Half Adder",
    updatedLabel: "2 hours ago",
    nodeCount: 6,
    pinned: true,
  },
  {
    id: "ripple-counter",
    name: "4-bit Ripple Counter",
    updatedLabel: "yesterday",
    nodeCount: 18,
    pinned: true,
  },
  {
    id: "sr-latch",
    name: "SR Latch",
    updatedLabel: "3 days ago",
    nodeCount: 4,
  },
  {
    id: "seven-segment-driver",
    name: "7-Segment Driver",
    updatedLabel: "last week",
    nodeCount: 27,
  },
  {
    id: "clock-divider",
    name: "Clock Divider",
    updatedLabel: "last week",
    nodeCount: 9,
  },
  {
    id: "mux-4to1",
    name: "4-to-1 Multiplexer",
    updatedLabel: "2 weeks ago",
    nodeCount: 12,
  },
];
