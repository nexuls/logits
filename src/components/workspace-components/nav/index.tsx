import { NotebookActions } from "./actions";
import { NotebookBreadcrumbs } from "./breadcrumbs";

export default function NavBar() {
  return (
    <div className="flex h-10 px-3 items-center justify-between bg-background">
      <NotebookBreadcrumbs />
      <NotebookActions />
    </div>
  );
}
