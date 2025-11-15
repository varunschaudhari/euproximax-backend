// In-memory user storage (replace with database in production)
// For production, use MongoDB, PostgreSQL, MySQL, etc.

let users = [];

class User {
  constructor({ id, name, email, password }) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.password = password; // This will be hashed
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Remove password from user object before sending
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }

  static create(userData) {
    const user = new User({
      id: users.length + 1,
      ...userData
    });
    users.push(user);
    return user;
  }

  static findByEmail(email) {
    return users.find(user => user.email === email);
  }

  static findById(id) {
    return users.find(user => user.id === parseInt(id));
  }

  static getAll() {
    return users.map(user => user.toJSON());
  }
}

module.exports = User;

