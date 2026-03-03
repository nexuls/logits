import type { T_Page, T_Page_Meta, T_Project } from "@/types/types";

type TempProject = Omit<T_Project, "pages"> & {
  pages: T_Page[];
};

const dummyProject_temp: TempProject[] = [
  {
    id: "1",
    name: "scrcpy-gui",
    updatedAt: "2026-03-02T10:15:00.000Z",
    pages: [
      {
        id: "1",
        name: "Basic Gates",
        type: "gallery",
        content: "",
      },
    ],
  },
  {
    id: "2",
    name: "Markly",
    updatedAt: "2026-02-20T09:00:00.000Z",
    pages: [
      {
        id: "2",
        name: "Home",
        type: "canvas",
        content: "",
      },
    ],
  },
  {
    id: "3",
    name: "MC Worker Wireframe",
    updatedAt: "2026-02-15T09:00:00.000Z",
    pages: [
      {
        id: "3",
        name: "Overview",
        type: "canvas",
        content: "",
      },
    ],
  },
  {
    id: "4",
    name: "Blackboard 1",
    updatedAt: "2026-01-28T09:00:00.000Z",
    pages: [
      {
        id: "4",
        name: "Concepts",
        type: "gallery",
        content: "",
      },
    ],
  },
  {
    id: "5",
    name: "Minecraft",
    updatedAt: "2026-01-11T09:00:00.000Z",
    pages: [
      {
        id: "5",
        name: "Build Plan",
        type: "canvas",
        content: "",
      },
    ],
  },
];

export const dummyProjects: T_Project[] = dummyProject_temp.map(
  ({ pages, ...project }) => ({
    ...project,
    pages: pages.map(({ content, ...page }) => page),
  }),
);

export const dummyPages: T_Page_Meta[] = dummyProject_temp.flatMap((project) =>
  project.pages.map((page) => ({ ...page })),
);
