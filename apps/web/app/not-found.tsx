import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-muted rounded-full">
              <Compass className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Page not found</CardTitle>
        </CardHeader>
        <CardContent className="text-center pt-2">
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 pt-4">
          <Button asChild className="w-full" variant="default">
            <Link href="/">Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
