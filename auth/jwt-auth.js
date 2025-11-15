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
  verify(jwtPayload, cb) {
    try {
      const decodedPayload = this.decrypt(
        jwtPayload.sub,
        this.key
      );
      const user = JSON.parse(decodedPayload);

      User.findOne({
        email: String(user.email).toLowerCase()
        // status: { $ne: 'DELETED' } // Uncomment if you add status field to User model
      }, (err, data) => {
        if (err) {
          return cb(err);
        }

        if (!data) {
          const errObj = {
            message: 'USER_NOT_FOUND',
            code: 1004,
            status: 401
          };
          return cb(errObj);
        }

        return cb(null, data);
        // expire payload if user is inactive for > 7 days
        // if ((data.lastActive) && data.lastActive < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
        //     const errObj = {
        //         message: 'EXPIRED_TOKEN',
        //         code: 1004,
        //         status: 401
        //     };
        //     logger.error(`Token expired for user ${user.email}`);
        //     return cb(errObj);
        // }

        // should remain logged-in in 2 devices
        // if ((data.logoutNum - 1) > (user.logoutNum)) {
        //     const errObj = {
        //         message: 'EXPIRED_TOKEN',
        //         code: 1004,
        //         status: 401
        //     };
        //     return cb(errObj);
        // }

        // data.lastActive = new Date();
        // User.updateOne({_id: data._id}, {$set: {lastActive: new Date()}}).then(() => {
        //     return cb(null, data);
        // }).catch((err) => {
        //     return cb(err);
        // });
      });
    } catch (err) {
      logger.error('Unable to decrypt token %s', err);
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

