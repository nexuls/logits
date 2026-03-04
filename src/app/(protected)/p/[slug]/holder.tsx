"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, TriangleAlertIcon } from "lucide-react";

import Header from "@/components/header";
import { useMetadata } from "@/components/providers/metadata";
import { Spinner } from "@/components/ui/spinner";
import Canvas from "@/components/canvas";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function Holder({ slug }: { slug: string }) {
  const {
    projects,
    isHydrating,
    renameProject,
    updateProjectPages,
    getPageContent,
    updatePageContent,
  } = useMetadata();
  const [currentPageId, setCurrentPageId] = useState("");
  const [currentPageContent, setCurrentPageContent] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === slug) ?? null,
    [projects, slug],
  );
  const pages = selectedProject?.pages ?? [];
  const currentPage = useMemo(
    () => pages.find((page) => page.id === currentPageId) ?? null,
    [pages, currentPageId],
  );

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
    if (!currentPage) {
      setCurrentPageContent("");
      return;
    }

    let isCancelled = false;

    const loadContent = async () => {
      const content = await getPageContent(currentPage);

      if (!isCancelled) {
        setCurrentPageContent(content);
      }
    };

    void loadContent();

    return () => {
      isCancelled = true;
    };
  }, [currentPage, getPageContent]);

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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          <Empty className="h-full border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>Project not found.</EmptyTitle>
              <EmptyDescription>
                It may have been deleted or you may not have access to it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
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
      <main className="w-full h-full">
        {currentPage?.type === "canvas" ? (
          <Canvas
            content={currentPageContent}
            onContentChange={(nextContent) => {
              setCurrentPageContent(nextContent);
              void updatePageContent(currentPage.id, nextContent);
            }}
          />
        ) : (
          <div className="h-full p-6 pt-20">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGrid />
                </EmptyMedia>
                <EmptyTitle>Gallery page</EmptyTitle>
                <EmptyDescription>
                  Gallery rendering is not implemented yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}
