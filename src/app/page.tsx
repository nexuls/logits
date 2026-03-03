import Link from "next/link";

export default function Home() {
  return (
    <div className="relative w-full h-dvh bg-background">
      <main className="">
        <Link href="/p/1" className="text-blue-500 underline">
          Project 1
        </Link>
      </main>
    </div>
  );
}
