export type T_Page_Meta = {
  id: string;
  name: string;
  type: "canvas" | "gallery";
};

export type T_Page = T_Page_Meta & {
  content: string; // Replace with actual content type
};

export type T_Project = {
  id: string;
  name: string;
  updatedAt: string;
  pages: T_Page_Meta[];
};
