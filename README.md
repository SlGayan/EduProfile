# EduProfile

A comprehensive student information management system built with Next.js (frontend) and Express.js (backend) using Prisma ORM and PostgreSQL database.

## Features

- **Multi-role Authentication**: Support for Admin, Principal, Teacher, and Student roles
- **Student Management**: Search, view, and manage student records
- **Academic Tracking**: Monitor student marks and performance
- **Class Management**: Organize students by classes and grades
- **Dashboard Analytics**: Role-based dashboards with relevant metrics
- **Modern UI**: Built with Next.js 15, React 19, and Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **UI Components**: Radix UI, Lucide Icons
- **State Management**: TanStack Query (React Query)

## Database Setup

### Prerequisites

- PostgreSQL 15 (local instance running)
- Node.js 20.11.1 or later

### pgAdmin Connection

Use pgAdmin to connect to the local PostgreSQL server:

```
Host: localhost
Port: 5432
Database: eduprofile
Username: postgres
Password: [see apps/api/.env for password]
```

## Study Material Storage Setup (Azure Blob Storage)

Study materials (PDF/DOC/image uploads) are stored in Azure Blob Storage, not on local disk. The API authenticates via your own Azure identity locally (no shared keys or connection strings are used anywhere), so each developer needs their own access grant before uploads/downloads/deletes will work locally.

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Access to the EduProfile Azure subscription — ask the project owner to add you

### One-time setup per developer

1. **Log in to Azure CLI**
   ```bash
   az login
   ```
   Make sure it logs into the EduProfile subscription (`az account show`).

2. **Ask the project owner to grant you storage access.** You can't grant this to yourself — only someone with Owner/User Access Administrator on the subscription can. Send them your account email and ask them to run:
   ```bash
   az role assignment create \
     --assignee "<your-azure-account-email>" \
     --role "Storage Blob Data Contributor" \
     --scope "/subscriptions/<subscription-id>/resourceGroups/EduProfile-RG/providers/Microsoft.Storage/storageAccounts/eduprofilematerials"
   ```
   Role assignments take a minute or two to propagate — if uploads fail with `AuthorizationPermissionMismatch` right after being granted access, wait a bit and retry.

3. **Add the storage config to `apps/api/.env`** (see [Environment Variables](#environment-variables) below). No key or secret is needed — the API picks up your `az login` session automatically via `DefaultAzureCredential`.

That's it — no separate storage emulator or local blob setup needed; local dev talks to the real (shared) `study-materials` container in the cloud.

### Rebuilding the storage infrastructure

The storage account, its container, the CORS rules, and the API's role assignment are all declared in [`infra/storage.bicep`](infra/storage.bicep). You only need this if you're standing up a new environment or recreating the account — day-to-day development never touches it.

```bash
az deployment group create \
  --resource-group EduProfile-RG \
  --template-file infra/storage.bicep \
  --parameters apiAppName=eduprofile-api-prod \
  --parameters webAppOrigins='["https://<web-app-host>","http://localhost:3000"]'
```

The CORS rule in that template is load-bearing and easy to overlook: downloads redirect the browser to Blob Storage, so without it every download fails, and without `Content-Disposition` in its `exposedHeaders` files save under the wrong name. **If `apps/web` is ever served from a new hostname, add that origin to `webAppOrigins` and redeploy**, or downloads will break from the new host only.

## Development

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/SlGayan/EduProfile.git
   cd EduProfile
   ```

2. **Install dependencies**
   ```bash
   # Install API dependencies
   cd apps/api && npm install

   # Install web app dependencies
   cd ../web && npm install
   ```

3. **Database Setup**
   ```bash
   # Ensure PostgreSQL is running locally with database 'eduprofile'
   cd apps/api

   # Run migrations
   npx prisma migrate dev

   # Seed the database
   npx prisma db seed
   ```

4. **Start Development Servers**
   ```bash
   # Terminal 1: Start the API server
   cd apps/api && npm run dev

   # Terminal 2: Start the web app
   cd apps/web && npm run dev
   ```

5. **Access the Application**
   - Web App: http://localhost:3000
   - API: http://localhost:8000

## Project Structure

```
eduprofile/
├── apps/
│   ├── api/                    # Express.js Backend Application
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   ├── seed.ts         # Database seeding
│   │   │   └── migrations/     # Database migrations
│   │   ├── src/
│   │   │   └── server.ts       # Main server file
│   │   └── package.json
│   └── web/                    # Next.js Frontend Application
│       ├── app/                # Next.js App Router
│       │   ├── (auth)/         # Authentication routes
│       │   ├── (main)/         # Main application routes
│       │   ├── api/            # API routes
│       │   └── globals.css     # Global styles
│       ├── components/         # Reusable UI components
│       │   ├── ui/             # Base UI components (Radix)
│       │   └── providers.tsx   # React context providers
│       ├── lib/                # Utility functions and types
│       └── package.json
├── docs/                       # Documentation
│   ├── prd/            
│   ├── architecture/        
│   ├── stories/             
```

## Available Scripts

### API (apps/api)
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server

### Web App (apps/web)
- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

### API (apps/api/.env)
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/eduprofile"
PORT=8000

# Azure Blob Storage (study materials) — see "Study Material Storage Setup" above.
# No key/secret: auth is via your `az login` session locally, Managed Identity in production.
AZURE_STORAGE_ACCOUNT_NAME=eduprofilematerials
AZURE_STORAGE_CONTAINER_NAME=study-materials
```

### Web App (apps/web/.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Contributing

1. Follow the BMad Method for development workflow
2. Ensure all tests pass before committing
3. Use conventional commit messages
4. Update documentation as needed

## License

ISC
