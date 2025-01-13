# Event Management Platform Backend

A robust backend service for managing events with real-time updates, built with Node.js, Express, Prisma, and Socket.IO.

## Features

- JWT-based authentication system
- Real-time event updates using Socket.IO
- CRUD operations for events with ownership control
- Image upload support via Cloudinary
- Rate limiting for security
- Input validation using Zod
- PostgreSQL database with Prisma ORM
- Real-time attendee management

## Prerequisites

- Node.js (v20 or higher) - LTS
- PostgreSQL/MySQL database
- Cloudinary account for image hosting
- npm or yarn package manager

## Project Structure

```
src/
├── lib/
│   ├── prisma.js        # Prisma client initialization
│   └── validate.js      # Request validation middleware
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── routes/
│   ├── auth.js          # Authentication routes
│   ├── events.js        # Event management routes
│   └── image.js         # Image upload routes
├── index.js             # Application entry point
prisma/
└── schema.prisma        # Database schema
.env.example            # Environment variables template
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=5000
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Authentication
JWT_SECRET=your_jwt_secret_key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd event-management-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up the database:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

4. Start the server:
   ```bash
   npm run dev
   ```

## Database Schema

The application uses a PostgreSQL/Mysql (change adapter in schema.prisma) database with the following schema:

### User Model

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  events    Event[]  @relation("CreatedEvents")
  attending Event[]  @relation("Attendees")

  @@map("users")
}
```

### Event Model

```prisma
model Event {
  id          String   @id @default(uuid())
  title       String
  description String   @db.Text
  date        DateTime
  location    String
  category    String
  coverUrl    String   @map("cover_url")
  imagesUrl   String[] @map("images_url")
  creatorId   String   @map("creator_id")
  createdAt   DateTime @default(now()) @map("created_at")
  creator     User     @relation("CreatedEvents", fields: [creatorId], references: [id])
  attendees   User[]   @relation("Attendees")

  @@index([creatorId])
  @@map("events")
}
```

### Relationships

- Each event has one creator (User)
- Users can create multiple events
- Users can attend multiple events
- Events can have multiple attendees

## API Endpoints

### Authentication

#### POST /api/auth/register

Register a new user.

- Body: `{ "email": string, "password": string, "name": string }`
- Returns: User object and JWT token

#### POST /api/auth/login

Login existing user.

- Body: `{ "email": string, "password": string }`
- Returns: User object and JWT token

#### GET /api/auth/me

Get current user details.

- Headers: `Authorization: Bearer <token>`
- Returns: User object

### Events

#### GET /api/events

Get events with pagination and filters.

- Query Parameters:
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
  - `category`: string (optional)
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `search`: string (optional)
  - `sortBy`: "date" | "title" | "attendeeCount" (default: "date")
  - `sortOrder`: "asc" | "desc" (default: "asc")

#### POST /api/events

Create a new event.

- Headers: `Authorization: Bearer <token>`
- Body:
  ```json
  {
    "title": string,
    "description": string,
    "date": ISO date string,
    "location": string,
    "category": string,
    "coverUrl": string,
    "imagesUrl": string[] (optional)
  }
  ```

#### GET /api/events/:id

Get events with the id.

- Body: Returns an Event field same as PUT

#### PUT /api/events/:id

Update an event.

- Headers: `Authorization: Bearer <token>`
- Body: Same as POST but all fields optional

#### DELETE /api/events/:id

Delete an event.

- Headers: `Authorization: Bearer <token>`

#### POST /api/events/:id/join

Join an event.

- Headers: `Authorization: Bearer <token>`

#### POST /api/events/:id/leave

Leave an event.

- Headers: `Authorization: Bearer <token>`

### Images

#### POST /api/images/upload

Upload an image to Cloudinary.

- Body: FormData with `file` field
- Returns: `{ url: string }`

## Real-time Events

The backend uses Socket.IO for real-time updates. Clients can listen to these events:

- `newEvent`: Emitted when a new event is created
- `eventUpdated`: Emitted when an event is updated
- `eventDeleted`: Emitted when an event is deleted

To subscribe to specific event updates:

```javascript
socket.emit("joinEvent", eventId);
```

## Security Features

- Password hashing using bcrypt
- JWT-based authentication
- Rate limiting on authentication routes
- Input validation using Zod schemas
- CORS configuration
- Secure password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one number
  - At least one special character

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- 200: Success
- 201: Resource created
- 400: Bad request / Invalid input
- 401: Unauthorized
- 403: Forbidden
- 404: Resource not found
- 409: Conflict (e.g., email already exists)
- 429: Too many requests
- 500: Server error

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License.
