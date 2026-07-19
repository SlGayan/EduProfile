import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Define which routes require which roles
const ROLE_ROUTES: Record<string, string[]> = {
    admin: ["/admin"],
    teacher: ["/teacher"],
    principal: ["/principal"],
    student: ["/student"],
}

// Routes shared across multiple roles — checked before ROLE_ROUTES below, since
// they're more specific than (and would otherwise be shadowed by) a single-role
// prefix match (e.g. "/admin/search-students" also starts with "/admin").
const SHARED_ROUTES: { path: string; roles: string[] }[] = [
    { path: "/admin/search-students", roles: ["admin", "principal", "teacher"] },
]

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const role = request.cookies.get("eduprofile_role")?.value
    const userCookie = request.cookies.get("eduprofile_user")?.value

    // 1. If trying to access a protected route and no user/role, redirect to login
    const isProtectedRoute = Object.values(ROLE_ROUTES).some(routes =>
        routes.some(route => pathname.startsWith(route))
    )

    if (isProtectedRoute && !role) {
        const url = new URL("/login", request.url)
        url.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(url)
    }

    // 2. If logged in and trying to access /login or /register, redirect to their dashboard
    if ((pathname === "/login" || pathname === "/register") && role) {
        if (role === "admin") return NextResponse.redirect(new URL("/admin/users", request.url))
        if (role === "teacher") return NextResponse.redirect(new URL("/teacher/dashboard", request.url))
        if (role === "principal") return NextResponse.redirect(new URL("/principal/dashboard", request.url))
        if (role === "student") return NextResponse.redirect(new URL("/student/profile", request.url))
    }

    // 3. Shared routes — allow any of the listed roles, checked before the
    // single-role prefixes below since they'd otherwise shadow this
    const sharedRoute = SHARED_ROUTES.find(r => pathname.startsWith(r.path))
    if (sharedRoute) {
        if (!role || !sharedRoute.roles.includes(role)) {
            return NextResponse.redirect(new URL("/unauthorized", request.url))
        }
        return NextResponse.next()
    }

    // 4. Role-based access control
    for (const [requiredRole, routes] of Object.entries(ROLE_ROUTES)) {
        if (routes.some(route => pathname.startsWith(route))) {
            if (role !== requiredRole) {
                // If they have a role but it's the wrong one, send to unauthorized or their own area
                return NextResponse.redirect(new URL("/unauthorized", request.url))
            }
        }
    }

    return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
}
