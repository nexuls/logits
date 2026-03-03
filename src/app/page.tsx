"use client";

import { useState } from "react";

import Header from "@/components/header";

const dummyPages = [
  { id: "1", name: "Basic Gates" },
  { id: "2", name: "Page 2" },
  { id: "3", name: "Page 3" },
];

export default function Home() {
  const [projectName, setProjectName] = useState("8-bit Adder");
  const [pages, setPages] = useState(dummyPages);
  const [currentPageId, setCurrentPageId] = useState(dummyPages[0].id);

  return (
    <div className="w-full h-dvh bg-background">
      <Header
        projectName={projectName}
        pages={pages}
        currentPageId={currentPageId}
        onCurrentPageIdChange={setCurrentPageId}
        onPagesChange={setPages}
        onProjectNameChange={setProjectName}
      />
      <main className=""></main>
    </div>
  );
}
