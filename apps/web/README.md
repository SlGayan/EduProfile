# EduProfile Web Application

Frontend application for EduProfile - A comprehensive student profile management system for educational institutions.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **State Management**: Zustand
- **Form Handling**: React Hook Form + Zod
- **Testing**: Vitest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm test             # Run tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Generate coverage report
```

## Project Structure

```
apps/web/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication routes (login)
│   ├── (main)/            # Main application routes
│   │   ├── admin/         # Admin dashboard
│   │   ├── principal/     # Principal dashboard
│   │   ├── teacher/       # Teacher dashboard
│   │   └── student/       # Student profile
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # Reusable UI components (shadcn/ui)
│   └── ...               # Feature components
├── lib/                   # Utility functions and shared logic
│   ├── useAuthStore.ts   # Zustand auth store
│   ├── auth.ts           # Authentication utilities
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Helper functions
├── hooks/                 # Custom React hooks
├── public/               # Static assets
└── styles/               # Global styles
```

## Authentication

EduProfile uses Zustand for global authentication state management. See [Authentication Documentation](../../docs/auth-state-management.md) for detailed usage.

### Quick Start

```tsx
import { useAuthStore } from "@/lib/useAuthStore"

function MyComponent() {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  
  return <div>Welcome, {user?.name}!</div>
}
```

### Demo Accounts

| Email | Role | Password |
|-------|------|----------|
| teacher@edu.com | Teacher | any |
| principal@edu.com | Principal | any |
| admin@edu.com | Admin | any |
| student@edu.com | Student | any |

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with UI (recommended for development)
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Writing Tests

Tests are located in `__tests__` directories alongside the code they test:

```
lib/
├── auth.ts
├── useAuthStore.ts
└── __tests__/
    ├── auth.test.ts
    └── useAuthStore.test.ts
```

Example test:

```typescript
import { describe, it, expect } from "vitest"
import { useAuthStore } from "../useAuthStore"

describe("useAuthStore", () => {
  it("should initialize with null user", () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
  })
})
```

## UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) components built on Radix UI. Components are located in `components/ui/`.

### Adding New Components

```bash
npx shadcn-ui@latest add [component-name]
```

### Using Components

```tsx
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

function MyComponent() {
  return (
    <Card>
      <Button>Click Me</Button>
    </Card>
  )
}
```

## Styling

### Tailwind CSS

The project uses Tailwind CSS v4 for styling. Configure via `tailwind.config.js`.

```tsx
// Using Tailwind classes
<div className="flex items-center gap-4 p-4 rounded-lg bg-primary text-white">
  Content
</div>
```

### CSS Variables

Theme colors are defined in `app/globals.css` and can be customized:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  --primary: 222.2 47.4% 11.2%;
  /* ... */
}
```

## Type Safety

### Using Types

```typescript
import type { User } from "@/lib/types"

function getUserInfo(user: User) {
  return `${user.name} (${user.role})`
}
```

### Adding New Types

Define types in `lib/types.ts`:

```typescript
export interface MyNewType {
  id: string
  name: string
}
```

## API Integration

### API Routes

API routes are defined in `app/api/`:

```typescript
// app/api/example/route.ts
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  return NextResponse.json({ message: "Hello" })
}
```

### Calling APIs

```typescript
// Client component
const response = await fetch("/api/example")
const data = await response.json()
```

## Environment Variables

Create a `.env.local` file for local development:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
DATABASE_URL=postgresql://...
```

Access in code:

```typescript
const apiUrl = process.env.NEXT_PUBLIC_API_URL
```

## Development Tips

### Hot Reload

Next.js supports hot reload. Changes to files are reflected immediately in the browser.

### TypeScript Errors

Fix TypeScript errors before committing:

```bash
npm run lint
```

### Debugging

Use VS Code debugger or browser DevTools:

```typescript
console.log("Debug info:", data)
debugger // Pause execution in browser
```

## Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

The build output will be in `.next/` directory.

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

### Other Platforms

The app can be deployed to any platform supporting Next.js:
- AWS Amplify
- Netlify
- Railway
- Self-hosted with Node.js

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
npx kill-port 3000

# Or use a different port
PORT=3001 npm run dev
```

### Module Not Found

```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
```

### TypeScript Errors

```bash
# Check TypeScript errors
npx tsc --noEmit
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Run tests and linting
5. Submit a pull request

## Documentation

- [Architecture Documentation](../../docs/architecture.md)
- [Authentication Guide](../../docs/auth-state-management.md)
- [PRD](../../docs/prd.md)

## License

Private - Educational Institution Use Only
