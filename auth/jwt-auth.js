/**
 * JWT Auth
 */
const logger = require('../utils/logger');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const IV_LENGTH = 16;

/**
 * Class Definition for JWTAuth with its member functions
 */
class JwtAuth {
  jwtSecret;
  key;

  constructor(secrets) {
    this.jwtSecret = secrets.JWT_SECRET;
    const jwtPayloadSECRET = secrets.JWT_PL_SECRET;
    const jwtSalt = secrets.JWT_SALT;
    this.key = crypto.pbkdf2Sync(jwtPayloadSECRET, jwtSalt, 65536, 32, 'sha1');
  }

  decodeJwtToken(token) {
    const decodedData = jwt.verify(token, this.jwtSecret);
    const decryptedData = this.decrypt(decodedData.sub, this.key);
    return decryptedData;
  }

  /**
   * Generates JWT for the user
   * @param {Object} user - User object
   */
  generateToken(user) {
    if (!user) {
      logger.error('No user provided');
      return;
    }

    // If we need to generate expiration token then expHours is 30 days else 1 week.
    const expirationDate = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
    const payloadObj = {
      id: user._id || user.id,
      name: user.name,
      mobileNumber: user.mobile || user.mobileNumber,
      email: user.email,
      logoutNum: user.logoutNum || 0
    };

    const encryptedPayload = this.encrypt(
      JSON.stringify(payloadObj),
      this.key
    );

    return jwt.sign({
      sub: encryptedPayload,
      exp: expirationDate.getTime() / 1000
    }, this.jwtSecret);
  }

  /**
   * Verify the payload and queries the user from db
   */
  async verify(jwtPayload, cb) {
    try {
      const decodedPayload = this.decrypt(jwtPayload.sub, this.key);
      const tokenUser = JSON.parse(decodedPayload);

      const data = await User.findOne({
        email: String(tokenUser.email).toLowerCase()
      }).lean();

      if (!data) {
        const errObj = { message: 'USER_NOT_FOUND', code: 1004, status: 401 };
        return cb(errObj);
      }

      return cb(null, data);
    } catch (err) {
      logger.error('Unable to decrypt/verify token', err);
      return cb(err);
    }
  }

  /**
   * Encrypts the payload data
   * @param {String} data - Payload data
   * @param {Buffer} key - Encryption key
   */
  encrypt(data, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  /**
   * Decrypts the payload data
   * @param {String} data - Encrypted data
   * @param {Buffer} key - Decryption key
   */
  decrypt(data, key) {
    const buff = Buffer.from(data, 'base64');
    const iv = buff.slice(0, IV_LENGTH);
    const encryptedText = buff.slice(IV_LENGTH, buff.length);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = decipher.update(encryptedText);
    return Buffer.concat([decrypted, decipher.final()]).toString();
  }
}

module.exports = JwtAuth;

