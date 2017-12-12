/*
 * Wire
 * Copyright (C) 2017 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

const crypto = require('crypto');
const rs = require('jsrsasign');

const MAIN_FP = '3pHQns2wdYtN4b2MWsMguGw70gISyhBZLZDpbj+EmdU=';
const ALGORITHM_RSA = '2a864886f70d010101';
const VERISIGN_CLASS3_G5_ROOT='-x----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAryQICCl6NZ5gDKrnSztO\n3Hy8PEUcuyvg/ikC+VcIo2SFFSf18a3IMYldIugqqqZCs4/4uVW3sbdLs/6PfgdX\n7O9D22ZiFWHPYA2k2N744MNiCD1UE+tJyllUhSblK48bn+v1oZHCM0nYQ2NqUkvS\nj+hwUU3RiWl7x3D2s9wSdNt7XUtW05a/FXehsPSiJfKvHJJnGOX0BgTvkLnkAOTd\nOrUZ/wK69Dzu4IvrN4vs9Nes8vbwPa/ddZEzGR0cQMt0JBkhk9kU/qwqUseP1QRJ\n5I1jR4g8aYPL/ke9K35PxZWuDp3U0UPAZ3PjFAh+5T+fc7gzCs9dPzSHloruU+gl\nFQIDAQAB\n-----END PUBLIC KEY-----\n';
const pins = [
  {
    publicKeyInfo: [{
      algorithmID: ALGORITHM_RSA,
      algorithmParam: null,
      fingerprints: ['bORoZ2vRsPJ4WBsUdL1h3Q7C50ZaBqPwngDmDVw+wHA=', MAIN_FP],
    }],
    url: /^app\.wire\.com$/i,
  },
  {
    publicKeyInfo: [{
      algorithmID: ALGORITHM_RSA,
      algorithmParam: null,
      fingerprints: [MAIN_FP],
    }],
    url: /^(www\.)?wire\.com$/i,
  },
  {
    publicKeyInfo: [{
      algorithmID: ALGORITHM_RSA,
      algorithmParam: null,
      fingerprints: [MAIN_FP],
    }],
    url: /^prod-(assets|nginz-https|nginz-ssl)\.wire\.com$/i,
  },
  {
    issuerRootPubkeys: [VERISIGN_CLASS3_G5_ROOT],
    publicKeyInfo: [],
    url: /^[a-z0-9]{14,63}\.cloudfront\.net$/i,
  },
];

module.exports = {
  hostnameShouldBePinned(hostname) {
    return pins.some(pin => pin.url.test(hostname.toLowerCase().trim()));
  },

  verifyPinning(hostname, certificate) {
    const {data: certData = '', issuerCert: {data: issuerCertData = ''} = {}} = certificate;
    let issuerCertHex, publicKey, publicKeyBytes, publicKeyFingerprint;

    try {
      issuerCertHex = rs.pemtohex(issuerCertData);
      publicKey = rs.X509.getPublicKeyInfoPropOfCertPEM(certData);
      publicKeyBytes = Buffer.from(publicKey.keyhex, 'hex').toString('binary');
      publicKeyFingerprint = crypto.createHash('sha256').update(publicKeyBytes).digest('base64');
    } catch (err) {
      console.error('verifyPinning', err);
      return {decoding: false};
    }

    let result = {};

    let errorMessages = [];

    for (const pin of pins) {
      const {url, publicKeyInfo = [], issuerRootPubkeys = []} = pin;

      if (url.test(hostname.toLowerCase().trim())) {
        if (issuerRootPubkeys.length > 0) {
          result.verifiedIssuerRootPubkeys = issuerRootPubkeys.some(pubkey => rs.X509.verifySignature(issuerCertHex, rs.KEYUTIL.getKey(pubkey)));
          if (!result.verifiedIssuerRootPubkeys) {
            errorMessages.push(`Issuer root public key signatures: none of "${issuerRootPubkeys.join(', ')}" could be verified.`);
          }
        }

        result.verifiedPublicKeyInfo = publicKeyInfo.reduce((arr, pubkey) => {
          const {fingerprints: knownFingerprints = [], algorithmID: knownAlgorithmID = '', algorithmParam: knownAlgorithmParam = null} = pubkey;

          const fingerprintCheck = (knownFingerprints.length > 0) ? knownFingerprints.some(knownFingerprint => knownFingerprint === publicKeyFingerprint) : undefined;
          const algorithmIDCheck = knownAlgorithmID === publicKey.algoid;
          const algorithmParamCheck = knownAlgorithmParam === publicKey.algparam;

          if (!fingerprintCheck) {
            errorMessages.push(`Public key fingerprints: "${publicKeyFingerprint}" could not be verified with any of the known fingerprints "${knownFingerprints.join(', ')}".`);
          }

          if (!algorithmIDCheck) {
            errorMessages.push(`Algorithm ID: "${publicKey.algoid}" could not be verified with the known ID "${knownAlgorithmID}".`);
          }

          if (!algorithmParamCheck) {
            errorMessages.push(`Algorithm parameter: "${publicKey.algparam}" could not be verified with the known parameter "${knownAlgorithmParam}".`);
          }

          arr.push(
            fingerprintCheck,
            algorithmIDCheck,
            algorithmParamCheck
          );

          return arr;
        }, []).every(value => Boolean(value));

        if (errorMessages.length > 0) {
          result.errorMessage = errorMessages.join('\n');
        }

        break;
      }
    }

    return result;
  }
};
