"use client";

import { useState } from "react";

import Header from "@/components/header";
import { dummyPages, dummyProjects } from "../../../../../data/dummy";
import type { T_Project } from "@/types/types";

export default function Holder({ slug }: { slug: string }) {
  const [projects, setProjects] = useState<T_Project[]>(dummyProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(slug);
  const selectedProject = projects.find((p) => p.id === selectedProjectId)!;

  const [pages, setPages] = useState(
    dummyPages.filter((p) => selectedProjectId.includes(p.id)),
  );
  const [currentPageId, setCurrentPageId] = useState(pages[0].id);

  return (
    <div className="relative w-full h-dvh bg-background">
      <Header
        projectName={selectedProject.name}
        pages={pages}
        currentPageId={currentPageId}
        onCurrentPageIdChange={setCurrentPageId}
        onPagesChange={setPages}
        onProjectNameChange={(newName) => {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === selectedProjectId
                ? { ...project, name: newName }
                : project,
            ),
          );
        }}
      />
      <main className=""></main>
    </div>
  );
}
