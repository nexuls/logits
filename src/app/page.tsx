"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText } from "lucide-react";
import { useNotebooks } from "@/hooks/use-notebooks";
import Header from "@/components/header/index";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function Home() {
  const router = useRouter();
  const { notebooks, isHydrating, createNotebook } = useNotebooks();

  useEffect(() => {
    if (isHydrating || !notebooks.length) return;

    router.replace(`/p/${notebooks[0].id}`);
  }, [isHydrating, notebooks, router]);

  return (
    <div className="relative h-dvh w-full bg-background">
      <Header placeholder className="relative border-b" />
      <main className="flex h-full items-center justify-center px-6 pt-16">
        <Empty className="max-w-lg border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenText />
            </EmptyMedia>
            <EmptyTitle>Create your first notebook</EmptyTitle>
            <EmptyDescription>
              Logits is now organized around notebooks with folders and notes.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={async () => {
              const notebook = await createNotebook();

              if (notebook) {
                router.push(`/p/${notebook.id}`);
              }
            }}
          >
            New notebook
          </Button>
        </Empty>
      </main>
    </div>
  );
}
