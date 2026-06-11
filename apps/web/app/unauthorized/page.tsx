import React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"

export default function UnauthorizedPage() {
    return (
        <div className="flex items-center justify-center min-h-[80vh] px-4">
            <Card className="w-full max-w-md border-destructive/20 shadow-lg">
                <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-destructive/10 rounded-full">
                            <ShieldAlert className="h-10 w-10 text-destructive" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Access Denied</CardTitle>
                </CardHeader>
                <CardContent className="text-center pt-2">
                    <p className="text-muted-foreground">
                        You don't have permission to access this page. Please contact your administrator if you believe this is an error.
                    </p>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2 pt-4">
                    <Button asChild className="w-full" variant="default">
                        <Link href="/login">Back to Login</Link>
                    </Button>
                    <Button asChild className="w-full" variant="outline">
                        <Link href="/">Home</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
