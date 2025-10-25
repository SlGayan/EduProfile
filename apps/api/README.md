# EduProfile API

## Authentication

POST /api/auth/login

Request JSON:

  { "email": "user@example.com", "password": "secret" }

Responses:
- 200: { token: "<jwt>", user: { id, email, role } }
- 400: invalid input
- 401: invalid credentials
- 429: too many attempts

Environment variables:
- APP_JWT_SECRET: secret used to sign JWTs
- BCRYPT_SALT_ROUNDS: number of bcrypt salt rounds used when hashing passwords
- JWT_EXPIRES_IN: token lifetime (default 15m)

Example curl:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"adminpassword"}'
```

Notes:
- A seed user (admin@example.com / adminpassword) is created by the project's prisma seed script.
- Rate limiting is applied to the login endpoint (5 attempts per IP per 15 minutes).
