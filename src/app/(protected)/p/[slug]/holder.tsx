"use client";

import { useEffect, useMemo, useState } from "react";

import Header from "@/components/header";
import { useMetadata } from "@/components/providers/metadata";
import { Spinner } from "@/components/ui/spinner";

export default function Holder({ slug }: { slug: string }) {
  const {
    projects,
    isHydrating,
    renameProject,
    updateProjectPages,
    getPageContent,
  } = useMetadata();
  const [currentPageId, setCurrentPageId] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === slug) ?? null,
    [projects, slug],
  );
  const pages = selectedProject?.pages ?? [];

  useEffect(() => {
    if (!pages.length) {
      setCurrentPageId("");
      return;
    }

    const hasCurrentPage = pages.some((page) => page.id === currentPageId);

    if (!hasCurrentPage) {
      setCurrentPageId(pages[0].id);
    }
  }, [currentPageId, pages]);

  useEffect(() => {
    if (!pages.length || !currentPageId) {
      return;
    }

    const currentPage = pages.find((page) => page.id === currentPageId);

    if (!currentPage) {
      return;
    }

    void getPageContent(currentPage);
  }, [pages, currentPageId, getPageContent]);

  if (isHydrating) {
    return (
      <div className="relative w-full h-dvh bg-background">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className="relative w-full h-dvh bg-background">
        <Header placeholder />
        <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          Project not found
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-dvh bg-background">
      <Header
        placeholder={false}
        projectName={selectedProject.name}
        pages={pages}
        currentPageId={currentPageId}
        onCurrentPageIdChange={setCurrentPageId}
        onPagesChange={(nextPages) => {
          void updateProjectPages(selectedProject.id, nextPages);
        }}
        onProjectNameChange={(newName) => {
          void renameProject(selectedProject.id, newName);
        }}
      />
      <main className=""></main>
    </div>
  );
}
