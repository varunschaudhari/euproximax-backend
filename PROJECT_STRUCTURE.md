# Project Structure Documentation

## Directory Structure

```
euproximax-backend/
│
├── auth/                          # Authentication & Authorization
│   └── jwt-auth.js               # JWT authentication class with encryption
│
├── bin/                           # Executable Scripts
│   └── init.js                   # Database initialization (creates test user)
│
├── config/                        # Configuration Files
│   ├── db.js                     # MongoDB connection configuration
│   └── jwt.config.js             # JWT secrets and settings
│
├── controllers/                   # Business Logic Layer
│   └── user.controller.js        # User operations (register, login, getMe)
│
├── middleware/                    # Express Middleware
│   ├── acl.js                    # Access Control List (permissions)
│   ├── auth.js                   # JWT authentication middleware
│   ├── errorHandler.js           # Global error handling
│   └── validate.js               # Input validation middleware
│
├── models/                        # Database Models (Mongoose)
│   └── User.js                   # User schema, methods, and validation
│
├── routes/                        # API Route Definitions
│   ├── index.js                  # Main routes configuration
│   ├── auth.js                   # Authentication routes (/api/v1/auth)
│   └── user.js                   # User routes (/api/v1/user)
│
├── utils/                         # Utility Functions
│   ├── generateToken.js          # JWT token generation wrapper
│   └── logger.js                 # Winston logger configuration
│
├── logs/                          # Application Logs (auto-generated)
│   ├── combined.log              # All application logs
│   ├── error.log                 # Error logs only
│   ├── exceptions.log             # Uncaught exceptions
│   └── rejections.log            # Unhandled promise rejections
│
├── .env                           # Environment variables (gitignored)
├── .env.example                   # Environment variables template
├── .gitignore                     # Git ignore rules
├── package.json                   # Dependencies and scripts
├── README.md                      # Main documentation
├── MONGODB_SETUP.md              # MongoDB setup guide
└── server.js                     # Application entry point
```

## File Descriptions

### Core Application Files

#### `server.js`
- Main application entry point
- Express app initialization
- Middleware setup (Helmet, CORS, Body Parser, etc.)
- Database connection
- Route mounting
- Error handling
- Server startup

### Authentication (`auth/`)

#### `auth/jwt-auth.js`
- JWT authentication class
- Token generation with encrypted payloads
- Token verification and decryption
- AES-256-CBC encryption/decryption
- User lookup from database

### Configuration (`config/`)

#### `config/db.js`
- MongoDB connection using Mongoose
- Connection error handling
- Helpful error messages

#### `config/jwt.config.js`
- JWT configuration
- Secret keys from environment variables
- Token expiration settings

### Controllers (`controllers/`)

#### `controllers/user.controller.js`
- `register()` - User registration logic
- `login()` - User authentication logic
- `getMe()` - Get current user profile

### Middleware (`middleware/`)

#### `middleware/auth.js`
- JWT authentication middleware
- Uses Passport.js JWT strategy
- Extracts token from Authorization header
- Verifies token and sets `req.user`

#### `middleware/errorHandler.js`
- Global error handling
- Custom AppError class
- Mongoose error handling
- Development vs production error responses

#### `middleware/validate.js`
- Input validation error handler
- Processes express-validator results
- Returns formatted validation errors

#### `middleware/acl.js`
- Access Control List middleware
- Role-based permission checking
- Requires UserRole and AclPermission models

### Models (`models/`)

#### `models/User.js`
- User Mongoose schema
- Fields: name, mobile, email, password, lastLogin, logoutNum
- Password hashing (pre-save hook)
- Password comparison method
- Timestamps (createdAt, updatedAt)

### Routes (`routes/`)

#### `routes/index.js`
- Main routes configuration
- JWT middleware application
- Public vs protected route filtering
- Route mounting

#### `routes/auth.js`
- Authentication routes
- POST `/api/v1/auth/register` - User registration
- POST `/api/v1/auth/login` - User login
- Input validation rules

#### `routes/user.js`
- User routes
- GET `/api/v1/user/me` - Get user profile (protected)

### Utilities (`utils/`)

#### `utils/generateToken.js`
- JWT token generation wrapper
- Uses JwtAuth class
- Creates encrypted tokens

#### `utils/logger.js`
- Winston logger configuration
- Console and file logging
- Log rotation
- Different formats for dev/prod

### Scripts (`bin/`)

#### `bin/init.js`
- Database initialization script
- Creates test user for development
- Can be run with `npm run init`

## Data Flow

### Request Flow
1. Request arrives at `server.js`
2. Middleware applied (Helmet, CORS, Body Parser, etc.)
3. Routes checked in `routes/index.js`
4. JWT middleware applied (if protected route)
5. Route handler in `routes/*.js`
6. Validation middleware (`validate.js`)
7. Controller function (`controllers/*.js`)
8. Model operations (`models/*.js`)
9. Response sent
10. Error handler catches any errors

### Authentication Flow
1. User registers/logs in
2. Controller creates/verifies user
3. `generateToken()` creates JWT with encrypted payload
4. Token returned to client
5. Client includes token in Authorization header
6. `auth.js` middleware extracts and verifies token
7. `jwt-auth.js` decrypts payload and finds user
8. `req.user` set with user data
9. Route handler executes

## Adding New Features

### Adding a New Model
1. Create file in `models/ModelName.js`
2. Define Mongoose schema
3. Export model

### Adding a New Controller
1. Create file in `controllers/resource.controller.js`
2. Export controller functions
3. Import in route file

### Adding New Routes
1. Create route file in `routes/resource.js`
2. Define routes with validation
3. Import controller
4. Add to `routes/index.js`

### Adding New Middleware
1. Create file in `middleware/middlewareName.js`
2. Export middleware function
3. Use in routes or `routes/index.js`

## Best Practices

1. **Separation of Concerns**
   - Controllers: Business logic
   - Models: Data structure
   - Routes: Endpoint definitions
   - Middleware: Reusable logic

2. **Error Handling**
   - Use AppError for operational errors
   - Let errorHandler catch and format errors
   - Log all errors

3. **Validation**
   - Validate all inputs
   - Use express-validator
   - Return clear error messages

4. **Security**
   - Never return passwords
   - Hash all passwords
   - Use encrypted JWT payloads
   - Validate all inputs
   - Use Helmet for security headers

5. **Logging**
   - Log important events
   - Use appropriate log levels
   - Don't log sensitive data

