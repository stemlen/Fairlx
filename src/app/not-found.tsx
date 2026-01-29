import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center px-4">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-gray-200">404</h1>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="text-6xl">🔍</div>
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-gray-800 mb-4">
          Page Not Found
        </h2>
        
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. 
          The page might have been moved or deleted.
        </p>
        
        <div className="flex gap-4 justify-center">
          <Button asChild>
            <Link href="/">
              Go Home
            </Link>
          </Button>
          
          <Button variant="outline" asChild>
            <Link href="/workspaces">
              View Workspaces
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
