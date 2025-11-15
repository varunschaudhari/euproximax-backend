# Express JWT Authentication Server

A complete Node.js Express server with JWT authentication implementation.

## Features

- User registration with email and password
- User login with JWT token generation
- Password hashing using bcrypt
- JWT token authentication middleware
- Input validation using express-validator
- CORS enabled
- Error handling middleware
- Protected routes

## Project Structure

```
euproximax-backend/
├── config/
│   └── jwt.config.js          # JWT configuration
├── controllers/
│   └── auth.controller.js     # Authentication controllers
├── middleware/
│   ├── auth.middleware.js     # JWT authentication middleware
│   └── validation.middleware.js # Request validation middleware
├── models/
│   └── User.model.js          # User model (in-memory storage)
├── routes/
│   └── auth.routes.js         # Authentication routes
├── .env.example               # Environment variables template
├── .gitignore
├── package.json
├── README.md
└── server.js                  # Main server file
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file from the example:
```bash
cp .env.example .env
```

3. Update the `.env` file with your configuration:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
```

## Running the Server

### Development mode (with nodemon):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

### Public Routes

#### Register User
- **POST** `/api/auth/register`
- **Body:**
  ```json
  {
    "username": "johndoe",
    "email": "john@example.com",
    "password": "Password123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": 1,
        "username": "johndoe",
        "email": "john@example.com",
        "createdAt": "2024-01-01T00:00:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### Login
- **POST** `/api/auth/login`
- **Body:**
  ```json
  {
    "email": "john@example.com",
    "password": "Password123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": 1,
        "username": "johndoe",
        "email": "john@example.com"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### Protected Routes (Require JWT Token)

#### Get Profile
- **GET** `/api/auth/profile`
- **Headers:**
  ```
  Authorization: Bearer <your-jwt-token>
  ```

#### Verify Token
- **GET** `/api/auth/verify`
- **Headers:**
  ```
  Authorization: Bearer <your-jwt-token>
  ```

### Health Check
- **GET** `/api/health`

## Password Requirements

- Minimum 6 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

## Using the JWT Token

Include the JWT token in the Authorization header for protected routes:

```
Authorization: Bearer <your-jwt-token>
```

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message here"
}
```

## Notes

- The current implementation uses in-memory storage for users. For production, replace the `User.model.js` with a database implementation (MongoDB, PostgreSQL, MySQL, etc.).
- Make sure to use a strong, random `JWT_SECRET` in production.
- The JWT token expires in 7 days by default (configurable via `JWT_EXPIRE` in `.env`).

## Development

- The server uses `nodemon` for automatic restarts during development
- All routes are prefixed with `/api`
- CORS is enabled for all origins (configure as needed for production)

