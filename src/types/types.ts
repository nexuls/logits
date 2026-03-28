export type T_Notebook = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type T_File_Type = "folder" | "file" | "draw" | "image";
export type T_File_Features =
  | "versioning"
  | "collaboration"
  | "comments"
  | "ai-assistance";

export type T_File_Shared_With = {
  userId: string;
  permission: "read" | "write";
};

export type T_File_Metadata = {
  url: string;
  size: number;
  type: T_File_Type;
  parentId: string;
  fileOrder: number;
  iconUrl?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  isShared: boolean;
  sharedWith: T_File_Shared_With[];
  tags: string[];
  enabledFeatures: T_File_Features[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type T_File = {
  id: string;
  name: string;
  content: string;
  metadata: T_File_Metadata;
};

export type T_User_Settings = Record<string, unknown>;

export type T_App_Data = {
  notebooks: T_Notebook[];
  files: T_File[];
  settings: T_User_Settings;
  version: number;
  updatedAt: string;
};
